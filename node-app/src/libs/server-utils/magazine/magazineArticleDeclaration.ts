import "server-only";
import crypto from "crypto";
import { MONGODB_AMU_URL } from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import {
  MagazineArticleDeclarationSchema,
  type IMagazineArticleDeclarationDocument,
  type MagazineArticleDeclarationSource,
} from "models/magazine";
import {
  magazineContentRefId,
  validateArticleDeclaration,
  type MagazineArticleDeclaration,
  type MagazineContentRef,
} from "./magazineEmbedContract";
import { logger } from "utils/log";

/**
 * @docHint
 * @purpose Article Experience declaration의 node-app 단일 저장소
 * @process contract validation -> contentRef별 upsert -> revision 기반 충돌 방지 -> runtime read projection
 * @domain magazine-content-experience
 * @scope server-repository
 */

const MODEL_NAME = "MagazineArticleDeclaration";
const COLLECTION_NAME = "magazine_article_declarations";
const CONTRACT_FILTER = {
  contractType: "article-experience-declaration" as const,
  schemaVersion: "article-experience.v2" as const,
};

export type MagazineArticleDeclarationProjection = {
  declaration: MagazineArticleDeclaration;
  revision: string;
  source: MagazineArticleDeclarationSource;
  updatedBy: string;
  updatedAt: string;
};

export type MagazineArticleDeclarationReadResult =
  | { ok: true; data: MagazineArticleDeclarationProjection }
  | { ok: false; error: "not_found" | "unavailable" };

export type MagazineArticleDeclarationListResult =
  | { ok: true; data: MagazineArticleDeclarationProjection[] }
  | { ok: false; error: "unavailable" };

export type MagazineArticleDeclarationUpsertResult =
  | { ok: true; data: MagazineArticleDeclarationProjection; created: boolean }
  | { ok: false; error: "validation_failed"; issues: string[] }
  | { ok: false; error: "conflict" }
  | { ok: false; error: "unavailable" };

async function getDeclarationModel() {
  return getModel<IMagazineArticleDeclarationDocument>(
    MONGODB_AMU_URL,
    MODEL_NAME,
    MagazineArticleDeclarationSchema,
    COLLECTION_NAME,
  );
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value;
}

export function magazineArticleDeclarationRevision(declaration: MagazineArticleDeclaration) {
  return crypto.createHash("sha256").update(JSON.stringify(stableValue(declaration))).digest("hex");
}

function projection(raw: unknown): MagazineArticleDeclarationProjection | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Partial<IMagazineArticleDeclarationDocument> & { declaration?: unknown; updatedAt?: unknown };
  const parsed = validateArticleDeclaration(value.declaration);
  if (!parsed.ok || typeof value.revision !== "string" || !/^[a-f0-9]{64}$/.test(value.revision)) return null;
  if (magazineArticleDeclarationRevision(parsed.declaration) !== value.revision) return null;
  if (typeof value.updatedBy !== "string" || !["admin", "agent"].includes(String(value.source))) return null;
  const updatedAt = new Date(value.updatedAt as string | Date);
  if (Number.isNaN(updatedAt.getTime())) return null;
  return {
    declaration: parsed.declaration,
    revision: value.revision,
    source: value.source as MagazineArticleDeclarationSource,
    updatedBy: value.updatedBy,
    updatedAt: updatedAt.toISOString(),
  };
}

function postFilter(identifier: { contentRef?: MagazineContentRef; refId?: string }) {
  const refId = identifier.refId ?? (identifier.contentRef && magazineContentRefId(identifier.contentRef));
  if (!refId) return CONTRACT_FILTER;
  return { ...CONTRACT_FILTER, contentRefKey: refId };
}

export async function getMagazineArticleDeclaration(identifier: { contentRef?: MagazineContentRef; refId?: string }): Promise<MagazineArticleDeclarationReadResult> {
  const refId = identifier.refId ?? (identifier.contentRef ? magazineContentRefId(identifier.contentRef) : undefined);
  if (!refId) return { ok: false, error: "not_found" };
  try {
    const model = await getDeclarationModel();
    const document = await model.findOne(postFilter({ refId })).lean();
    const data = projection(document);
    return data ? { ok: true, data } : { ok: false, error: "not_found" };
  } catch (error) {
    logger.error("[magazine-article-declaration] read failed", { error: error instanceof Error ? error.message : "unknown" });
    return { ok: false, error: "unavailable" };
  }
}

export async function listMagazineArticleDeclarations(limit = 100): Promise<MagazineArticleDeclarationListResult> {
  const boundedLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  try {
    const model = await getDeclarationModel();
    const documents = await model.find(CONTRACT_FILTER).sort({ updatedAt: -1 }).limit(boundedLimit).lean();
    const data = documents.map(projection).filter((item): item is MagazineArticleDeclarationProjection => Boolean(item));
    return { ok: true, data };
  } catch (error) {
    logger.error("[magazine-article-declaration] list failed", { error: error instanceof Error ? error.message : "unknown" });
    return { ok: false, error: "unavailable" };
  }
}

export async function upsertMagazineArticleDeclaration(input: unknown, args: {
  actor: string;
  source: MagazineArticleDeclarationSource;
  expectedRevision?: string;
}): Promise<MagazineArticleDeclarationUpsertResult> {
  const parsed = validateArticleDeclaration(input);
  if (!parsed.ok) return { ok: false, error: "validation_failed", issues: [parsed.reasonCode] };
  const actor = args.actor.trim();
  if (!actor || actor === "unknown") return { ok: false, error: "validation_failed", issues: ["감사 actor를 확인할 수 없습니다."] };

  const declaration = parsed.declaration;
  const revision = magazineArticleDeclarationRevision(declaration);
  const contentRefKey = magazineContentRefId(declaration.contentRef);
  const filter = { ...CONTRACT_FILTER, contentRefKey };

  try {
    const model = await getDeclarationModel();
    const existing = await model.findOne(filter).lean();
    const currentRevision = existing && typeof existing.revision === "string" ? existing.revision : undefined;

    // 신규 생성은 expectedRevision 없이 허용하고, 기존 선언 수정은 항상 최신 revision을 요구한다.
    if (currentRevision && args.expectedRevision !== currentRevision) return { ok: false, error: "conflict" };
    if (!currentRevision && args.expectedRevision) return { ok: false, error: "conflict" };

    // 사전 조회만으로 잠그면 두 요청이 동시에 같은 revision을 읽고 서로 덮어쓸 수 있다.
    // 기존 문서는 revision을 CAS 조건에 포함한 원자 update로 다시 확인한다.
    const atomicFilter = currentRevision ? { ...filter, revision: currentRevision } : filter;
    const updateResult = await model.updateOne(
      atomicFilter,
      {
        $set: {
          ...CONTRACT_FILTER,
          contentRefKey,
          contentRef: declaration.contentRef,
          declaration,
          revision,
          source: args.source,
          updatedBy: actor,
        },
      },
      { upsert: true, runValidators: true },
    );
    if (currentRevision && updateResult.matchedCount !== 1) return { ok: false, error: "conflict" };
    const saved = projection(await model.findOne(filter).lean());
    if (!saved) return { ok: false, error: "unavailable" };
    logger.info("[magazine-article-declaration] upserted", {
      actor,
      source: args.source,
      contentRefKey,
      revision,
      created: !existing,
    });
    return { ok: true, data: saved, created: !existing };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    if (/E11000|duplicate key/i.test(message)) return { ok: false, error: "conflict" };
    logger.error("[magazine-article-declaration] upsert failed", { error: message });
    return { ok: false, error: "unavailable" };
  }
}
