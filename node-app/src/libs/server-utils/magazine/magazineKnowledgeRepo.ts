import "server-only";

import { MONGODB_AMU_URL } from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import {
  MagazineKnowledgeArticleSchema,
  MagazineKnowledgeUnitSchema,
  type IMagazineKnowledgeArticleDocument,
  type IMagazineKnowledgeUnitDocument,
  type MagazineKnowledgeSource,
} from "models/magazine";
import {
  KNOWLEDGE_ARTICLE_CONTRACT_TYPE,
  KNOWLEDGE_ARTICLE_SCHEMA_VERSION,
  KNOWLEDGE_UNIT_CONTRACT_TYPE,
  KNOWLEDGE_UNIT_SCHEMA_VERSION,
  type MagazineKnowledgeArticle,
  type MagazineKnowledgeUnit,
} from "./magazineKnowledgeContract";
import { applyKnowledgeIntelligencePatch } from "./magazineKnowledgeIngest";
import {
  magazineKnowledgeRevision,
  validateMagazineKnowledgeArticle,
  validateMagazineKnowledgeUnit,
} from "./magazineKnowledgeValidate";
import { logger } from "utils/log";

/**
 * @docHint
 * @purpose Knowledge Corpus(기사·Knowledge Unit)의 node-app 단일 저장소 — MIR-200
 * @process contract validation -> revision CAS upsert -> sourceRevision stale 차단 -> read projection
 * @domain magazine-knowledge-corpus
 * @scope server-repository
 */

const ARTICLE_MODEL_NAME = "MagazineKnowledgeArticle";
const ARTICLE_COLLECTION_NAME = "magazine_knowledge_articles";
const UNIT_MODEL_NAME = "MagazineKnowledgeUnit";
const UNIT_COLLECTION_NAME = "magazine_knowledge_units";

const ARTICLE_FILTER = {
  contractType: KNOWLEDGE_ARTICLE_CONTRACT_TYPE,
  schemaVersion: KNOWLEDGE_ARTICLE_SCHEMA_VERSION,
} as const;
const UNIT_FILTER = {
  contractType: KNOWLEDGE_UNIT_CONTRACT_TYPE,
  schemaVersion: KNOWLEDGE_UNIT_SCHEMA_VERSION,
} as const;

export type MagazineKnowledgeArticleProjection = {
  article: MagazineKnowledgeArticle;
  revision: string;
  sourceRevision: string;
  source: MagazineKnowledgeSource;
  updatedBy: string;
  updatedAt: string;
};

export type MagazineKnowledgeUnitProjection = {
  unit: MagazineKnowledgeUnit;
  revision: string;
  sourceRevision: string;
  source: MagazineKnowledgeSource;
  updatedBy: string;
  updatedAt: string;
};

export type MagazineKnowledgeReadResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: "not_found" | "unavailable" };

export type MagazineKnowledgeListResult<T> =
  | { ok: true; data: T[] }
  | { ok: false; error: "unavailable" };

export type MagazineKnowledgeWriteResult<T> =
  | { ok: true; data: T; created: boolean }
  | { ok: false; error: "validation_failed"; issues: string[] }
  | { ok: false; error: "conflict" }
  | { ok: false; error: "stale_source_revision" }
  | { ok: false; error: "article_not_found" }
  | { ok: false; error: "unavailable" };

export type MagazineKnowledgeIdentifier = { postId?: number; slug?: string; contentId?: string };

async function getArticleModel() {
  return getModel<IMagazineKnowledgeArticleDocument>(
    MONGODB_AMU_URL,
    ARTICLE_MODEL_NAME,
    MagazineKnowledgeArticleSchema,
    ARTICLE_COLLECTION_NAME,
  );
}

async function getUnitModel() {
  return getModel<IMagazineKnowledgeUnitDocument>(
    MONGODB_AMU_URL,
    UNIT_MODEL_NAME,
    MagazineKnowledgeUnitSchema,
    UNIT_COLLECTION_NAME,
  );
}

type StoredEnvelope = { revision?: unknown; sourceRevision?: unknown; source?: unknown; updatedBy?: unknown; updatedAt?: unknown };

function envelope(value: StoredEnvelope) {
  if (typeof value.revision !== "string" || !/^[a-f0-9]{64}$/.test(value.revision)) return null;
  if (typeof value.sourceRevision !== "string" || !value.sourceRevision.trim()) return null;
  if (typeof value.updatedBy !== "string" || !value.updatedBy.trim()) return null;
  if (typeof value.source !== "string" || !["admin", "agent"].includes(value.source)) return null;
  const updatedAt = new Date(value.updatedAt as string | Date);
  if (Number.isNaN(updatedAt.getTime())) return null;
  return {
    revision: value.revision,
    sourceRevision: value.sourceRevision,
    source: value.source as MagazineKnowledgeSource,
    updatedBy: value.updatedBy,
    updatedAt: updatedAt.toISOString(),
  };
}

function articleProjection(raw: unknown): MagazineKnowledgeArticleProjection | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as StoredEnvelope & { article?: unknown };
  const parsed = validateMagazineKnowledgeArticle(value.article);
  if (!parsed.ok) return null;
  const meta = envelope(value);
  // 저장 후 계약이 바뀌었거나 문서가 손상된 경우 조용히 낡은 값을 서빙하지 않는다.
  if (!meta || magazineKnowledgeRevision(parsed.article) !== meta.revision) return null;
  return { article: parsed.article, ...meta };
}

function unitProjection(raw: unknown): MagazineKnowledgeUnitProjection | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as StoredEnvelope & { unit?: unknown };
  const parsed = validateMagazineKnowledgeUnit(value.unit);
  if (!parsed.ok) return null;
  const meta = envelope(value);
  if (!meta || magazineKnowledgeRevision(parsed.unit) !== meta.revision) return null;
  return { unit: parsed.unit, ...meta };
}

function articleFilter(identifier: MagazineKnowledgeIdentifier) {
  if (identifier.contentId?.trim()) return { ...ARTICLE_FILTER, contentId: identifier.contentId.trim() };
  if (identifier.postId !== undefined) return { ...ARTICLE_FILTER, postId: identifier.postId };
  if (identifier.slug?.trim()) return { ...ARTICLE_FILTER, slug: identifier.slug.trim() };
  return null;
}

export async function getMagazineKnowledgeArticle(identifier: MagazineKnowledgeIdentifier): Promise<MagazineKnowledgeReadResult<MagazineKnowledgeArticleProjection>> {
  const filter = articleFilter(identifier);
  if (!filter) return { ok: false, error: "not_found" };
  try {
    const model = await getArticleModel();
    const data = articleProjection(await model.findOne(filter).lean());
    return data ? { ok: true, data } : { ok: false, error: "not_found" };
  } catch (error) {
    logger.error("[magazine-knowledge] article read failed", { error: error instanceof Error ? error.message : "unknown" });
    return { ok: false, error: "unavailable" };
  }
}

export async function listMagazineKnowledgeArticles(args: { topic?: string; entity?: string; limit?: number } = {}): Promise<MagazineKnowledgeListResult<MagazineKnowledgeArticleProjection>> {
  const limit = Math.max(1, Math.min(100, Math.floor(args.limit ?? 50)));
  const filter: Record<string, unknown> = { ...ARTICLE_FILTER };
  if (args.topic?.trim()) filter["article.topics"] = args.topic.trim();
  if (args.entity?.trim()) filter["article.entities"] = args.entity.trim();
  try {
    const model = await getArticleModel();
    const documents = await model.find(filter).sort({ updatedAt: -1 }).limit(limit).lean();
    const data = documents.map(articleProjection).filter((item): item is MagazineKnowledgeArticleProjection => Boolean(item));
    return { ok: true, data };
  } catch (error) {
    logger.error("[magazine-knowledge] article list failed", { error: error instanceof Error ? error.message : "unknown" });
    return { ok: false, error: "unavailable" };
  }
}

export async function listMagazineKnowledgeUnits(args: {
  contentId: string;
  unitType?: MagazineKnowledgeUnit["unitType"];
  limit?: number;
  /** 지정하면 그 원문 revision에서 추출된 unit만 반환한다. 리뉴얼로 남은 옛 revision unit을 섞지 않는다. */
  sourceRevision?: string;
}): Promise<MagazineKnowledgeListResult<MagazineKnowledgeUnitProjection>> {
  const contentId = args.contentId.trim();
  if (!contentId) return { ok: true, data: [] };
  const limit = Math.max(1, Math.min(200, Math.floor(args.limit ?? 100)));
  const filter: Record<string, unknown> = { ...UNIT_FILTER, contentId };
  if (args.unitType) filter.unitType = args.unitType;
  if (args.sourceRevision?.trim()) filter.sourceRevision = args.sourceRevision.trim();
  try {
    const model = await getUnitModel();
    const documents = await model.find(filter).sort({ unitId: 1 }).limit(limit).lean();
    const data = documents.map(unitProjection).filter((item): item is MagazineKnowledgeUnitProjection => Boolean(item));
    return { ok: true, data };
  } catch (error) {
    logger.error("[magazine-knowledge] unit list failed", { error: error instanceof Error ? error.message : "unknown" });
    return { ok: false, error: "unavailable" };
  }
}

export type MagazineKnowledgePage<T> = {
  items: T[];
  hasMore: boolean;
  /** 다음 페이지 시작점. 정렬 키 그대로이며 내부 _id를 노출하지 않는다. */
  nextCursor: { updatedAt: string; contentId: string } | null;
};

export type MagazineKnowledgePageResult<T> =
  | { ok: true; data: MagazineKnowledgePage<T> }
  | { ok: false; error: "unavailable" };

/** 공개 노출 자격을 저장소 질의에서 먼저 좁힌다. 코드 단계의 재판정과 이중으로 건다(fail-closed). */
const PUBLIC_EXPOSURE_FILTER = {
  "article.intelligence.eligibility": "qualified",
  "article.intelligence.reviewStatus": "approved",
  "article.intelligence.extractionStatus": { $nin: ["stale", "failed"] },
} as const;

/**
 * cursor 기반 기사 페이지 조회. `updatedAt` 내림차순, 동시각은 `contentId` 내림차순으로 안정 정렬한다.
 * offset을 쓰지 않으므로 페이지 사이에 새 문서가 들어와도 같은 행이 두 번 나오지 않는다.
 */
export async function listMagazineKnowledgeArticlePage(args: {
  topic?: string;
  entity?: string;
  limit?: number;
  cursor?: { updatedAt: string; contentId: string } | null;
  publicOnly?: boolean;
} = {}): Promise<MagazineKnowledgePageResult<MagazineKnowledgeArticleProjection>> {
  const limit = Math.max(1, Math.min(100, Math.floor(args.limit ?? 20)));
  const filter: Record<string, unknown> = { ...ARTICLE_FILTER };
  if (args.topic?.trim()) filter["article.topics"] = args.topic.trim();
  if (args.entity?.trim()) filter["article.entities"] = args.entity.trim();
  if (args.publicOnly) Object.assign(filter, PUBLIC_EXPOSURE_FILTER);
  if (args.cursor) {
    const at = new Date(args.cursor.updatedAt);
    if (Number.isNaN(at.getTime())) return { ok: false, error: "unavailable" };
    filter.$or = [
      { updatedAt: { $lt: at } },
      { updatedAt: at, contentId: { $lt: args.cursor.contentId } },
    ];
  }
  try {
    const model = await getArticleModel();
    const documents = await model
      .find(filter)
      .sort({ updatedAt: -1, contentId: -1 })
      .limit(limit + 1)
      .lean();
    const hasMore = documents.length > limit;
    const page = hasMore ? documents.slice(0, limit) : documents;
    const items = page.map(articleProjection).filter((item): item is MagazineKnowledgeArticleProjection => Boolean(item));
    const last = items.length ? items[items.length - 1] : null;
    return {
      ok: true,
      data: {
        items,
        hasMore,
        nextCursor: hasMore && last ? { updatedAt: last.updatedAt, contentId: last.article.contentId } : null,
      },
    };
  } catch (error) {
    logger.error("[magazine-knowledge] article page failed", { error: error instanceof Error ? error.message : "unknown" });
    return { ok: false, error: "unavailable" };
  }
}

function actorOrNull(actor: string): string | null {
  const trimmed = actor.trim();
  return !trimmed || trimmed === "unknown" ? null : trimmed;
}

export async function upsertMagazineKnowledgeArticle(input: unknown, args: {
  actor: string;
  source: MagazineKnowledgeSource;
  /** 기존 문서 수정 시 필수. 저장된 revision과 다르면 conflict */
  expectedRevision?: string;
  /** 판정 근거로 읽은 원문 revision. 저장된 값과 다르면 stale로 거부한다 */
  expectedSourceRevision?: string;
}): Promise<MagazineKnowledgeWriteResult<MagazineKnowledgeArticleProjection>> {
  const parsed = validateMagazineKnowledgeArticle(input);
  if (!parsed.ok) return { ok: false, error: "validation_failed", issues: parsed.issues };
  const actor = actorOrNull(args.actor);
  if (!actor) return { ok: false, error: "validation_failed", issues: ["감사 actor를 확인할 수 없습니다."] };

  const article = parsed.article;
  const revision = magazineKnowledgeRevision(article);
  const filter = { ...ARTICLE_FILTER, postId: article.source.postId };

  try {
    const model = await getArticleModel();
    const existing = await model.findOne(filter).lean();
    const currentRevision = existing && typeof existing.revision === "string" ? existing.revision : undefined;
    const currentSourceRevision = existing && typeof existing.sourceRevision === "string" ? existing.sourceRevision : undefined;

    // 신규 생성은 expectedRevision 없이 허용하고, 기존 문서 수정은 항상 최신 revision을 요구한다.
    if (currentRevision && args.expectedRevision !== currentRevision) return { ok: false, error: "conflict" };
    if (!currentRevision && args.expectedRevision) return { ok: false, error: "conflict" };
    // 이식한 stale 판정 — 입력이 근거로 삼은 원문 revision이 현재 저장값과 다르면 거부한다.
    if (args.expectedSourceRevision !== undefined && currentSourceRevision !== undefined && args.expectedSourceRevision !== currentSourceRevision) {
      return { ok: false, error: "stale_source_revision" };
    }

    // 사전 조회만으로는 두 요청이 같은 revision을 읽고 서로 덮어쓸 수 있다. revision을 CAS 조건에 포함한다.
    const atomicFilter = currentRevision ? { ...filter, revision: currentRevision } : filter;
    const updateResult = await model.updateOne(
      atomicFilter,
      {
        $set: {
          ...ARTICLE_FILTER,
          contentId: article.contentId,
          postId: article.source.postId,
          slug: article.source.slug,
          article,
          revision,
          sourceRevision: article.sourceRevision,
          source: args.source,
          updatedBy: actor,
        },
      },
      { upsert: true, runValidators: true },
    );
    if (currentRevision && updateResult.matchedCount !== 1) return { ok: false, error: "conflict" };
    const saved = articleProjection(await model.findOne(filter).lean());
    if (!saved) return { ok: false, error: "unavailable" };
    logger.info("[magazine-knowledge] article upserted", {
      actor,
      source: args.source,
      postId: article.source.postId,
      slug: article.source.slug,
      revision,
      created: !existing,
    });
    return { ok: true, data: saved, created: !existing };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    if (/E11000|duplicate key/i.test(message)) return { ok: false, error: "conflict" };
    logger.error("[magazine-knowledge] article upsert failed", { error: message });
    return { ok: false, error: "unavailable" };
  }
}

/**
 * intelligence의 판정 필드만 갱신한다 (normalize·추출·사람 검토·Registry 연결 경로).
 * 근거·파생 항목과 기사 본문 계약은 그대로 두고, 저장 전 계약 검증을 다시 통과시킨다.
 */
export async function updateMagazineKnowledgeIntelligence(identifier: MagazineKnowledgeIdentifier, args: {
  patch: unknown;
  actor: string;
  source: MagazineKnowledgeSource;
  expectedRevision: string;
}): Promise<MagazineKnowledgeWriteResult<MagazineKnowledgeArticleProjection>> {
  const actor = actorOrNull(args.actor);
  if (!actor) return { ok: false, error: "validation_failed", issues: ["감사 actor를 확인할 수 없습니다."] };
  const filter = articleFilter(identifier);
  if (!filter) return { ok: false, error: "article_not_found" };

  try {
    const model = await getArticleModel();
    const current = articleProjection(await model.findOne(filter).lean());
    if (!current) return { ok: false, error: "article_not_found" };
    if (current.revision !== args.expectedRevision) return { ok: false, error: "conflict" };

    // 권한 경계는 저장소에서 강제한다 — 라우트가 빠뜨려도 agent가 사람 검토·Registry 연결을 쓸 수 없다.
    const patched = applyKnowledgeIntelligencePatch(current.article, args.patch, { actorKind: args.source });
    if (!patched.ok) return { ok: false, error: "validation_failed", issues: patched.issues };

    const article = patched.article;
    const revision = magazineKnowledgeRevision(article);
    const updateResult = await model.updateOne(
      { ...filter, revision: current.revision },
      {
        $set: {
          article,
          revision,
          source: args.source,
          updatedBy: actor,
        },
      },
      { runValidators: true },
    );
    if (updateResult.matchedCount !== 1) return { ok: false, error: "conflict" };
    const saved = articleProjection(await model.findOne(filter).lean());
    if (!saved) return { ok: false, error: "unavailable" };
    logger.info("[magazine-knowledge] intelligence updated", {
      actor,
      source: args.source,
      postId: article.source.postId,
      eligibility: article.intelligence.eligibility,
      reviewStatus: article.intelligence.reviewStatus,
      revision,
    });
    return { ok: true, data: saved, created: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    logger.error("[magazine-knowledge] intelligence update failed", { error: message });
    return { ok: false, error: "unavailable" };
  }
}

export async function upsertMagazineKnowledgeUnit(input: unknown, args: {
  actor: string;
  source: MagazineKnowledgeSource;
  expectedRevision?: string;
}): Promise<MagazineKnowledgeWriteResult<MagazineKnowledgeUnitProjection>> {
  const parsed = validateMagazineKnowledgeUnit(input);
  if (!parsed.ok) return { ok: false, error: "validation_failed", issues: parsed.issues };
  const actor = actorOrNull(args.actor);
  if (!actor) return { ok: false, error: "validation_failed", issues: ["감사 actor를 확인할 수 없습니다."] };

  const unit = parsed.unit;
  const revision = magazineKnowledgeRevision(unit);
  const filter = { ...UNIT_FILTER, unitId: unit.unitId };

  try {
    const articleModel = await getArticleModel();
    const article = await articleModel.findOne({ ...ARTICLE_FILTER, contentId: unit.articleRef.contentId }).lean();
    // Knowledge Unit은 기사 없이 독립 존재하지 않는다. 고아 unit을 만들지 않는다.
    if (!article) return { ok: false, error: "article_not_found" };
    if (String(article.sourceRevision || "").trim() !== unit.sourceRevision.trim()) {
      return { ok: false, error: "stale_source_revision" };
    }

    const model = await getUnitModel();
    const existing = await model.findOne(filter).lean();
    const currentRevision = existing && typeof existing.revision === "string" ? existing.revision : undefined;
    if (currentRevision && args.expectedRevision !== currentRevision) return { ok: false, error: "conflict" };
    if (!currentRevision && args.expectedRevision) return { ok: false, error: "conflict" };

    const atomicFilter = currentRevision ? { ...filter, revision: currentRevision } : filter;
    const updateResult = await model.updateOne(
      atomicFilter,
      {
        $set: {
          ...UNIT_FILTER,
          unitId: unit.unitId,
          contentId: unit.articleRef.contentId,
          postId: unit.articleRef.postId,
          unitType: unit.unitType,
          unit,
          revision,
          sourceRevision: unit.sourceRevision,
          source: args.source,
          updatedBy: actor,
        },
      },
      { upsert: true, runValidators: true },
    );
    if (currentRevision && updateResult.matchedCount !== 1) return { ok: false, error: "conflict" };
    const saved = unitProjection(await model.findOne(filter).lean());
    if (!saved) return { ok: false, error: "unavailable" };
    logger.info("[magazine-knowledge] unit upserted", {
      actor,
      source: args.source,
      unitId: unit.unitId,
      unitType: unit.unitType,
      revision,
      created: !existing,
    });
    return { ok: true, data: saved, created: !existing };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    if (/E11000|duplicate key/i.test(message)) return { ok: false, error: "conflict" };
    logger.error("[magazine-knowledge] unit upsert failed", { error: message });
    return { ok: false, error: "unavailable" };
  }
}
