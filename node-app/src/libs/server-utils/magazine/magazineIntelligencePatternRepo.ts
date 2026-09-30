import "server-only";

import { MONGODB_AMU_URL } from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import {
  INTELLIGENCE_PATTERN_CONTRACT_TYPE,
  INTELLIGENCE_PATTERN_NAMESPACE,
  INTELLIGENCE_PATTERN_SCHEMA_VERSION,
  isPatternEligibleForPublicRead,
  normalizePatternName,
  type IntelligencePattern,
  type PatternResolution,
} from "./magazineIntelligencePatternContract";
import {
  intelligencePatternRevision,
  validateIntelligencePattern,
} from "./magazineIntelligencePatternValidate";
import {
  MagazineIntelligencePatternSchema,
  type IMagazineIntelligencePatternDocument,
} from "models/magazine";
import { getMagazineKnowledgeArticle } from "./magazineKnowledgeRepo";
import { isPubliclyExposableKnowledgeArticle } from "./magazineKnowledgeValidate";
import { logger } from "utils/log";

/**
 * @docHint
 * @purpose Pattern Registry v1의 node-app 저장·검색·공개 projection — AIR-800
 * @process 계약 검증 -> canonical/alias 중복 차단 -> revision CAS -> fail-closed projection
 * @domain intelligence-pattern-registry
 * @scope server-repository
 */

const MODEL_NAME = "MagazineIntelligencePattern";
const COLLECTION_NAME = "magazine_intelligence_patterns";
const CONTRACT_FILTER = {
  contractType: INTELLIGENCE_PATTERN_CONTRACT_TYPE,
  schemaVersion: INTELLIGENCE_PATTERN_SCHEMA_VERSION,
} as const;

export type IntelligencePatternProjection = {
  pattern: IntelligencePattern;
  revision: string;
  source: "admin";
  updatedBy: string;
  updatedAt: string;
};

export type IntelligencePatternWriteResult =
  | { ok: true; data: IntelligencePatternProjection; created: boolean }
  | { ok: false; error: "validation_failed"; issues: string[] }
  | { ok: false; error: "conflict" | "duplicate_candidate" | "unavailable" };

export type IntelligencePatternReadResult =
  | { ok: true; data: IntelligencePatternProjection }
  | { ok: false; error: "not_found" | "unavailable" };

export type IntelligencePatternPage = {
  items: IntelligencePatternProjection[];
  hasMore: boolean;
  nextCursor: { updatedAt: string; patternId: string } | null;
};

export type IntelligencePatternPageResult =
  | { ok: true; data: IntelligencePatternPage }
  | { ok: false; error: "unavailable" };

export type IntelligencePatternCandidate = {
  pattern: IntelligencePatternProjection;
  resolution: Exclude<PatternResolution, "create_candidate">;
  matchedBy: "canonical" | "alias" | "semantic";
  score: number;
};

async function getPatternModel() {
  return getModel<IMagazineIntelligencePatternDocument>(
    MONGODB_AMU_URL,
    MODEL_NAME,
    MagazineIntelligencePatternSchema,
    COLLECTION_NAME,
  );
}

function envelope(value: Record<string, unknown>) {
  if (typeof value.revision !== "string" || !/^[a-f0-9]{64}$/.test(value.revision)) return null;
  if (value.source !== "admin" || typeof value.updatedBy !== "string" || !value.updatedBy.trim()) return null;
  const updatedAt = new Date(value.updatedAt as string | Date);
  if (Number.isNaN(updatedAt.getTime())) return null;
  return { revision: value.revision, source: "admin" as const, updatedBy: value.updatedBy, updatedAt: updatedAt.toISOString() };
}

function projection(raw: unknown): IntelligencePatternProjection | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const parsed = validateIntelligencePattern(value.pattern);
  const meta = envelope(value);
  if (!parsed.ok || !meta || intelligencePatternRevision(parsed.pattern) !== meta.revision) return null;
  return { pattern: parsed.pattern, ...meta };
}

function articleLinkIsCurrent(link: IntelligencePattern["articleLinks"][number]): boolean {
  return link.linkStatus === "current" && Boolean(link.articleRevision.trim());
}

export type PublicIntelligencePattern = {
  patternId: string;
  namespace: typeof INTELLIGENCE_PATTERN_NAMESPACE;
  canonicalName: string;
  definition: string;
  conditions: string[];
  mechanism: string;
  expectedOutcome: string;
  limitations: string[];
  scopeStatus: IntelligencePattern["scopeStatus"];
  scopeContext: string[];
  maturity: "active";
  healthStatus: "current";
  reviewDueAt: string;
  articleLinks: Array<{
    contentId: string;
    postId: number;
    articleRevision: string;
    role: IntelligencePattern["articleLinks"][number]["role"];
    evidenceRefs: string[];
  }>;
  evidence: Array<Pick<IntelligencePattern["evidence"][number], "evidenceId" | "sourceType" | "sourceRef" | "observedAt" | "claimStatus" | "supports" | "limitations">>;
  counterEvidence: Array<Pick<IntelligencePattern["counterEvidence"][number], "counterEvidenceId" | "sourceType" | "sourceRef" | "observedAt" | "claimStatus" | "supports" | "limitations">>;
};

export type PublicIntelligencePatternProjectionOptions = {
  context?: string;
  articleRevisionByContentId?: ReadonlyMap<string, string>;
};

/** 공개 projection에는 active/current·public Evidence와 현재 article revision만 남긴다. */
export function toPublicIntelligencePatternProjection(
  input: IntelligencePatternProjection,
  now = new Date(),
  options: PublicIntelligencePatternProjectionOptions = {},
): PublicIntelligencePattern | null {
  const pattern = input.pattern;
  if (!isPatternEligibleForPublicRead(pattern, { now, context: options.context })) return null;
  const linkedCurrent = pattern.articleLinks.filter((link) => link.linkStatus === "current" && Boolean(link.articleRevision.trim()));
  if (options.articleRevisionByContentId && (linkedCurrent.length === 0 || linkedCurrent.some((link) => options.articleRevisionByContentId?.get(link.contentId) !== link.articleRevision))) return null;
  const currentArticleLinks = linkedCurrent.filter((link) => {
    if (link.linkStatus !== "current" || !link.articleRevision.trim()) return false;
    if (!options.articleRevisionByContentId) return true;
    return options.articleRevisionByContentId.get(link.contentId) === link.articleRevision;
  });
  if (options.articleRevisionByContentId && currentArticleLinks.length === 0) return null;
  const evidence = pattern.evidence.filter((item) => item.visibility === "public");
  if (!evidence.length) return null;
  const currentRevisions = new Set(currentArticleLinks.map((link) => link.articleRevision));
  const currentEvidence = options.articleRevisionByContentId
    ? evidence.filter((item) => item.articleRevision === null || currentRevisions.has(item.articleRevision))
    : evidence;
  if (!currentEvidence.length) return null;
  const counterEvidence = pattern.counterEvidence.filter((item) => item.visibility === "public");
  return {
    patternId: pattern.patternId,
    namespace: "intelligencePattern",
    canonicalName: pattern.canonicalName,
    definition: pattern.definition,
    conditions: [...pattern.conditions],
    mechanism: pattern.mechanism,
    expectedOutcome: pattern.expectedOutcome,
    limitations: [...pattern.limitations],
    scopeStatus: pattern.scopeStatus,
    scopeContext: [...pattern.scopeContext],
    maturity: "active",
    healthStatus: "current",
    reviewDueAt: pattern.reviewDueAt as string,
    articleLinks: currentArticleLinks.filter(articleLinkIsCurrent).map((link) => ({
      contentId: link.contentId,
      postId: link.postId,
      articleRevision: link.articleRevision,
      role: link.role,
      evidenceRefs: [...link.evidenceRefs],
    })),
    evidence: currentEvidence.map(({ evidenceId, sourceType, sourceRef, observedAt, claimStatus, supports, limitations }) => ({
      evidenceId,
      sourceType,
      sourceRef,
      observedAt,
      claimStatus,
      supports,
      limitations: [...limitations],
    })),
    counterEvidence: counterEvidence.map(({ counterEvidenceId, sourceType, sourceRef, observedAt, claimStatus, supports, limitations }) => ({
      counterEvidenceId,
      sourceType,
      sourceRef,
      observedAt,
      claimStatus,
      supports,
      limitations: [...limitations],
    })),
  };
}

export type PublicIntelligencePatternProjection = {
  pattern: PublicIntelligencePattern;
  articleRevision: string | null;
  updatedAt: string;
};

export type PublicIntelligencePatternReadResult =
  | { ok: true; data: PublicIntelligencePatternProjection }
  | { ok: false; error: "not_found" | "unavailable" };

async function currentArticleRevisions(pattern: IntelligencePattern): Promise<{ ok: true; revisions: Map<string, string> } | { ok: false; error: "unavailable" }> {
  const contentIds = [...new Set(pattern.articleLinks.filter((link) => link.linkStatus === "current").map((link) => link.contentId))];
  const results = await Promise.all(contentIds.map((contentId) => getMagazineKnowledgeArticle({ contentId })));
  if (results.some((result) => !result.ok && result.error === "unavailable")) return { ok: false, error: "unavailable" };
  const revisions = new Map<string, string>();
  results.forEach((result, index) => {
    if (result.ok && isPubliclyExposableKnowledgeArticle(result.data.article)) revisions.set(contentIds[index], result.data.article.sourceRevision);
  });
  return { ok: true, revisions };
}

async function publicProjection(input: IntelligencePatternProjection, context?: string): Promise<PublicIntelligencePatternReadResult> {
  const revisions = await currentArticleRevisions(input.pattern);
  if (!revisions.ok) return revisions;
  const pattern = toPublicIntelligencePatternProjection(input, new Date(), { context, articleRevisionByContentId: revisions.revisions });
  if (!pattern) return { ok: false, error: "not_found" };
  const articleRevisions = [...new Set(pattern.articleLinks.map((link) => link.articleRevision))];
  return {
    ok: true,
    data: {
      pattern,
      articleRevision: articleRevisions.length === 1 ? articleRevisions[0] : null,
      updatedAt: input.updatedAt,
    },
  };
}

/** 공개 read allowlist를 저장소·현재 Knowledge revision 대조까지 거친 뒤 반환한다. */
export async function getPublicIntelligencePattern(patternId: string, context?: string): Promise<PublicIntelligencePatternReadResult> {
  const result = await getIntelligencePattern(patternId);
  if (!result.ok) return result;
  return publicProjection(result.data, context);
}

export type PublicIntelligencePatternPage = {
  items: PublicIntelligencePattern[];
  hasMore: boolean;
  nextCursor: { updatedAt: string; patternId: string } | null;
  updatedAt: string | null;
};

export type PublicIntelligencePatternPageResult =
  | { ok: true; data: PublicIntelligencePatternPage }
  | { ok: false; error: "unavailable" };

/** 필터링된 문서를 먼저 limit개 채우므로 stale/context 불일치 문서가 pagination을 오염시키지 않는다. */
export async function listPublicIntelligencePatternPage(args: {
  limit?: number;
  cursor?: { updatedAt: string; patternId: string } | null;
  context?: string;
} = {}): Promise<PublicIntelligencePatternPageResult> {
  const limit = Math.max(1, Math.min(50, Math.floor(args.limit ?? 20)));
  const items: Array<{ projection: PublicIntelligencePatternProjection; value: PublicIntelligencePattern }> = [];
  let cursor = args.cursor ?? null;
  try {
    const model = await getPatternModel();
    let exhausted = false;
    let hasMoreCandidate = false;
    while (items.length < limit && !exhausted) {
      const filter: Record<string, unknown> = { ...CONTRACT_FILTER };
      if (cursor) {
        const at = new Date(cursor.updatedAt);
        if (Number.isNaN(at.getTime())) return { ok: false, error: "unavailable" };
        filter.$or = [
          { updatedAt: { $lt: at } },
          { updatedAt: at, patternId: { $lt: cursor.patternId } },
        ];
      }
      const documents = await model.find(filter).sort({ updatedAt: -1, patternId: -1 }).limit(limit + 1).lean();
      exhausted = documents.length <= limit;
      if (!documents.length) break;
      for (const document of documents) {
        const input = projection(document);
        if (!input) continue;
        const result = await publicProjection(input, args.context);
        if (!result.ok) {
          if (result.error === "unavailable") return { ok: false, error: "unavailable" };
          continue;
        }
        if (items.length < limit) items.push({ projection: result.data, value: result.data.pattern });
        else hasMoreCandidate = true;
      }
      if (items.length === limit) break;
      const lastDocument = documents.at(-1);
      const lastInput = lastDocument ? projection(lastDocument) : null;
      if (!lastInput) break;
      cursor = { updatedAt: lastInput.updatedAt, patternId: lastInput.pattern.patternId };
    }
    const last = items.at(-1)?.projection;
    const hasMore = hasMoreCandidate || !exhausted;
    return {
      ok: true,
      data: {
        items: items.map((item) => item.value),
        hasMore,
        nextCursor: hasMore && last ? { updatedAt: last.updatedAt, patternId: last.pattern.patternId } : null,
        updatedAt: items.length ? items.reduce((newest, item) => newest > item.projection.updatedAt ? newest : item.projection.updatedAt, items[0].projection.updatedAt) : null,
      },
    };
  } catch (error) {
    logger.error("[intelligence-pattern] public page failed", { error: error instanceof Error ? error.message : "unknown" });
    return { ok: false, error: "unavailable" };
  }
}

export async function getIntelligencePattern(patternId: string): Promise<IntelligencePatternReadResult> {
  try {
    const model = await getPatternModel();
    const data = projection(await model.findOne({ ...CONTRACT_FILTER, patternId }).lean());
    return data ? { ok: true, data } : { ok: false, error: "not_found" };
  } catch (error) {
    logger.error("[intelligence-pattern] read failed", { error: error instanceof Error ? error.message : "unknown" });
    return { ok: false, error: "unavailable" };
  }
}

export async function listIntelligencePatternPage(args: {
  limit?: number;
  cursor?: { updatedAt: string; patternId: string } | null;
  recommendedOnly?: boolean;
} = {}): Promise<IntelligencePatternPageResult> {
  const limit = Math.max(1, Math.min(100, Math.floor(args.limit ?? 20)));
  const filter: Record<string, unknown> = { ...CONTRACT_FILTER };
  if (args.cursor) {
    const at = new Date(args.cursor.updatedAt);
    if (Number.isNaN(at.getTime())) return { ok: false, error: "unavailable" };
    filter.$or = [
      { updatedAt: { $lt: at } },
      { updatedAt: at, patternId: { $lt: args.cursor.patternId } },
    ];
  }
  try {
    const model = await getPatternModel();
    const documents = await model.find(filter).sort({ updatedAt: -1, patternId: -1 }).limit(Math.min(200, limit + 1)).lean();
    let items = documents.map(projection).filter((item): item is IntelligencePatternProjection => Boolean(item));
    if (args.recommendedOnly) items = items.filter((item) => toPublicIntelligencePatternProjection(item));
    const hasMore = documents.length > limit;
    items = items.slice(0, limit);
    const last = items.at(-1);
    return { ok: true, data: { items, hasMore, nextCursor: hasMore && last ? { updatedAt: last.updatedAt, patternId: last.pattern.patternId } : null } };
  } catch (error) {
    logger.error("[intelligence-pattern] page failed", { error: error instanceof Error ? error.message : "unknown" });
    return { ok: false, error: "unavailable" };
  }
}

function tokens(value: string): Set<string> {
  return new Set(normalizePatternName(value).split(/[^\p{L}\p{N}]+/u).filter((token) => token.length > 1));
}

export async function findIntelligencePatternCandidates(name: string, limit = 10): Promise<{ ok: true; data: IntelligencePatternCandidate[] } | { ok: false; error: "unavailable" }> {
  const normalized = normalizePatternName(name);
  if (!normalized) return { ok: true, data: [] };
  try {
    const model = await getPatternModel();
    const documents = await model.find(CONTRACT_FILTER).sort({ updatedAt: -1 }).limit(200).lean();
    const requestedTokens = tokens(normalized);
    const candidates = documents
      .map(projection)
      .filter((item): item is IntelligencePatternProjection => Boolean(item))
      .map((item): IntelligencePatternCandidate | null => {
        const pattern = item.pattern;
        if (pattern.normalizedName === normalized) return { pattern: item, resolution: "reuse", matchedBy: "canonical", score: 1 };
        if (pattern.aliases.some((alias) => alias.normalized === normalized)) return { pattern: item, resolution: "alias", matchedBy: "alias", score: 0.95 };
        const patternTokens = new Set([...tokens(pattern.normalizedName), ...pattern.aliases.flatMap((alias) => [...tokens(alias.normalized)])]);
        const overlap = [...requestedTokens].filter((token) => patternTokens.has(token)).length;
        if (!overlap) return null;
        return { pattern: item, resolution: "merge_candidate", matchedBy: "semantic", score: overlap / Math.max(requestedTokens.size, patternTokens.size) };
      })
      .filter((item): item is IntelligencePatternCandidate => Boolean(item))
      .sort((left, right) => right.score - left.score)
      .slice(0, Math.max(1, Math.min(20, Math.floor(limit))));
    return { ok: true, data: candidates };
  } catch (error) {
    logger.error("[intelligence-pattern] candidate search failed", { error: error instanceof Error ? error.message : "unknown" });
    return { ok: false, error: "unavailable" };
  }
}

export async function upsertIntelligencePattern(input: unknown, args: {
  actor: string;
  expectedRevision?: string;
}): Promise<IntelligencePatternWriteResult> {
  const parsed = validateIntelligencePattern(input);
  if (!parsed.ok) return { ok: false, error: "validation_failed", issues: parsed.issues };
  const actor = args.actor.trim();
  if (!actor || actor === "unknown") return { ok: false, error: "validation_failed", issues: ["감사 actor를 확인할 수 없습니다."] };
  const pattern = parsed.pattern;

  try {
    const model = await getPatternModel();
    const duplicate = await model.findOne({
      ...CONTRACT_FILTER,
      patternId: { $ne: pattern.patternId },
      $or: [{ normalizedName: pattern.normalizedName }, { "pattern.aliases.normalized": pattern.normalizedName }],
    }).lean();
    if (duplicate) return { ok: false, error: "duplicate_candidate" };

    const existing = await model.findOne({ ...CONTRACT_FILTER, patternId: pattern.patternId }).lean();
    const currentRevision = existing && typeof existing.revision === "string" ? existing.revision : undefined;
    if (currentRevision && args.expectedRevision !== currentRevision) return { ok: false, error: "conflict" };
    if (!currentRevision && args.expectedRevision) return { ok: false, error: "conflict" };

    const revision = intelligencePatternRevision(pattern);
    const atomicFilter = currentRevision ? { ...CONTRACT_FILTER, patternId: pattern.patternId, revision: currentRevision } : { ...CONTRACT_FILTER, patternId: pattern.patternId };
    const updateResult = await model.updateOne(
      atomicFilter,
      { $set: { ...CONTRACT_FILTER, patternId: pattern.patternId, normalizedName: pattern.normalizedName, maturity: pattern.maturity, scopeStatus: pattern.scopeStatus, healthStatus: pattern.healthStatus, pattern, revision, source: "admin", updatedBy: actor } },
      { upsert: true, runValidators: true },
    );
    if (currentRevision && updateResult.matchedCount !== 1) return { ok: false, error: "conflict" };
    const saved = projection(await model.findOne({ ...CONTRACT_FILTER, patternId: pattern.patternId }).lean());
    if (!saved) return { ok: false, error: "unavailable" };
    logger.info("[intelligence-pattern] upserted", { actor, patternId: pattern.patternId, maturity: pattern.maturity, healthStatus: pattern.healthStatus, revision, created: !existing });
    return { ok: true, data: saved, created: !existing };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    if (/E11000|duplicate key/i.test(message)) return { ok: false, error: "duplicate_candidate" };
    logger.error("[intelligence-pattern] upsert failed", { error: message });
    return { ok: false, error: "unavailable" };
  }
}
