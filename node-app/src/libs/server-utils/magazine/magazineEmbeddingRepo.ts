import "server-only";

import { MONGODB_AMU_URL } from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import {
  MagazineEmbeddingSchema,
  type IMagazineEmbeddingDocument,
} from "models/magazine";
import {
  MAGAZINE_EMBEDDING_CONTRACT_TYPE,
  MAGAZINE_EMBEDDING_SCHEMA_VERSION,
  type MagazineEmbedding,
  type MagazineEmbeddingCandidate,
  type MagazineEmbeddingQuery,
} from "./magazineEmbeddingContract";
import { rankMagazineEmbeddingCandidates, type MagazineEmbeddingScoredCandidate } from "./magazineEmbeddingMath";
import {
  magazineEmbeddingKey,
  validateMagazineEmbedding,
  validateMagazineEmbeddingCandidate,
  validateMagazineEmbeddingQuery,
} from "./magazineEmbeddingValidate";
import { logger } from "utils/log";

/**
 * @docHint
 * @purpose Semantic Index embedding의 node-app 저장소 — dedup 멱등 저장 + hybrid 검색 (MIR-202)
 * @process validation -> (documentRef,textDigest,modelVersion,namespace) dedup upsert -> 소스메타 resolve -> 코사인 재순위
 * @domain magazine-semantic-index
 * @scope server-repository
 *
 * 실행 방식은 app_level_cosine(self-hosted MongoDB, Atlas `$vectorSearch` 불가). 기존 text 검색은 건드리지 않고 병행한다.
 * 공개 노출은 service가 resolveSourceMeta로 강제한다. resolver 미제공 시 기본은 소스메타 eligible=false(공개 0건) — fail-closed.
 */

const MODEL_NAME = "MagazineEmbedding";
const COLLECTION_NAME = "magazine_embeddings";

const FILTER = {
  contractType: MAGAZINE_EMBEDDING_CONTRACT_TYPE,
  schemaVersion: MAGAZINE_EMBEDDING_SCHEMA_VERSION,
} as const;

export type MagazineEmbeddingProjection = {
  embedding: MagazineEmbedding;
  source: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
};

export type MagazineEmbeddingWriteResult =
  | { ok: true; data: MagazineEmbeddingProjection; created: boolean }
  | { ok: false; error: "validation_failed"; issues: string[] }
  | { ok: false; error: "not_found" }
  | { ok: false; error: "unavailable" };

export type MagazineEmbeddingListResult<T> =
  | { ok: true; data: T[] }
  | { ok: false; error: "unavailable" };

export type MagazineEmbeddingSearchResult =
  | { ok: true; data: MagazineEmbeddingScoredCandidate[]; resolved: number; total: number }
  | { ok: false; error: "query_invalid"; issues: string[] }
  | { ok: false; error: "unavailable" };

async function getEmbeddingModel() {
  return getModel<IMagazineEmbeddingDocument>(MONGODB_AMU_URL, MODEL_NAME, MagazineEmbeddingSchema, COLLECTION_NAME);
}

function embeddingProjection(raw: unknown): MagazineEmbeddingProjection | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const parsed = validateMagazineEmbedding(value.embedding);
  if (!parsed.ok) return null;
  if (typeof value.source !== "string" || !["admin", "agent"].includes(value.source)) return null;
  if (typeof value.updatedBy !== "string" || !value.updatedBy.trim()) return null;
  const createdAt = new Date(value.createdAt as string | Date);
  const updatedAt = new Date(value.updatedAt as string | Date);
  if (Number.isNaN(createdAt.getTime()) || Number.isNaN(updatedAt.getTime())) return null;
  return {
    embedding: parsed.embedding,
    source: value.source as string,
    updatedBy: value.updatedBy as string,
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
  };
}

function dedupFilter(embedding: MagazineEmbedding): Record<string, unknown> {
  return {
    ...FILTER,
    documentRef: embedding.documentRef,
    textDigest: embedding.textDigest,
    modelVersion: embedding.provenance.modelVersion,
    namespace: embedding.namespace,
  };
}

export async function storeMagazineEmbedding(input: unknown, args: { actor: string; source: "admin" | "agent" }): Promise<MagazineEmbeddingWriteResult> {
  const parsed = validateMagazineEmbedding(input);
  if (!parsed.ok) return { ok: false, error: "validation_failed", issues: parsed.issues };
  const actor = args.actor.trim();
  if (!actor || actor === "unknown") return { ok: false, error: "validation_failed", issues: ["감사 actor를 확인할 수 없습니다."] };
  const embedding = parsed.embedding;

  const write = {
    $set: {
      ...FILTER,
      documentKind: embedding.documentKind,
      documentRef: embedding.documentRef,
      namespace: embedding.namespace,
      textDigest: embedding.textDigest,
      provider: embedding.provenance.provider,
      modelVersion: embedding.provenance.modelVersion,
      dimension: embedding.provenance.dimension,
      embedding,
      source: args.source,
      updatedBy: actor,
    },
  };
  const filter = dedupFilter(embedding);

  try {
    const model = await getEmbeddingModel();
    const existing = await model.findOne(filter).lean();
    await model.updateOne(filter, write, { upsert: true, runValidators: true });
    const saved = embeddingProjection(await model.findOne(filter).lean());
    if (!saved) return { ok: false, error: "unavailable" };
    logger.info("[magazine-embedding] stored", {
      actor,
      documentRef: embedding.documentRef,
      documentKind: embedding.documentKind,
      provider: embedding.provenance.provider,
      modelVersion: embedding.provenance.modelVersion,
      created: !existing,
    });
    return { ok: true, data: saved, created: !existing };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    logger.error("[magazine-embedding] store failed", { error: message });
    return { ok: false, error: "unavailable" };
  }
}

export async function markMagazineEmbeddingsStale(documentRef: string, args: { actor: string }): Promise<MagazineEmbeddingListResult<null>> {
  const ref = documentRef.trim();
  if (!ref) return { ok: true, data: [] };
  try {
    const model = await getEmbeddingModel();
    await model.updateMany({ ...FILTER, documentRef: ref }, { $set: { "embedding.staleAt": new Date().toISOString(), updatedBy: args.actor.trim() || "unknown" } }, { runValidators: true });
    return { ok: true, data: [] };
  } catch (error) {
    logger.error("[magazine-embedding] mark stale failed", { error: error instanceof Error ? error.message : "unknown" });
    return { ok: false, error: "unavailable" };
  }
}

export async function listMagazineEmbeddings(args: { documentKind?: MagazineEmbedding["documentKind"]; documentRef?: string; namespace?: string; limit?: number } = {}): Promise<MagazineEmbeddingListResult<MagazineEmbeddingProjection>> {
  const limit = Math.max(1, Math.min(500, Math.floor(args.limit ?? 100)));
  const filter: Record<string, unknown> = { ...FILTER };
  if (args.documentKind) filter.documentKind = args.documentKind;
  if (args.documentRef?.trim()) filter.documentRef = args.documentRef.trim();
  if (args.namespace?.trim()) filter.namespace = args.namespace.trim();
  try {
    const model = await getEmbeddingModel();
    const documents = await model.find(filter).sort({ documentRef: 1 }).limit(limit).lean();
    const data = documents.map(embeddingProjection).filter((item): item is MagazineEmbeddingProjection => Boolean(item));
    return { ok: true, data };
  } catch (error) {
    logger.error("[magazine-embedding] list failed", { error: error instanceof Error ? error.message : "unknown" });
    return { ok: false, error: "unavailable" };
  }
}

export type MagazineSourceMetaResolver = (candidate: MagazineEmbeddingProjection) => MagazineEmbeddingCandidate["sourceMeta"];

/** resolver 미제공 시 기본 — 공개 자격을 알 수 없으므로 eligible=false(공개 0건) fail-closed. */
const FAIL_CLOSED_SOURCE_META: MagazineEmbeddingCandidate["sourceMeta"] = Object.freeze({
  topics: [],
  entities: [],
  intent: "",
  sourceRevision: "",
  eligible: false,
});

export async function searchMagazineEmbeddings(input: unknown, options: { sourceMetaResolver?: MagazineSourceMetaResolver } = {}): Promise<MagazineEmbeddingSearchResult> {
  const queryParsed = validateMagazineEmbeddingQuery(input);
  if (!queryParsed.ok) return { ok: false, error: "query_invalid", issues: queryParsed.issues };
  const query = queryParsed.query as MagazineEmbeddingQuery;

  const filter: Record<string, unknown> = { ...FILTER };
  if (query.filter?.namespace) filter.namespace = query.filter.namespace;
  if (query.filter?.documentKind) filter.documentKind = query.filter.documentKind;

  const topK = Math.max(1, Math.min(500, query.topK + 50));
  const resolver = options.sourceMetaResolver ?? (() => FAIL_CLOSED_SOURCE_META);

  try {
    const model = await getEmbeddingModel();
    const documents = await model.find(filter).sort({ documentRef: 1 }).limit(topK).lean();
    const projections = documents.map(embeddingProjection).filter((item): item is MagazineEmbeddingProjection => Boolean(item));
    const candidates: MagazineEmbeddingCandidate[] = [];
    let resolved = 0;
    for (const projection of projections) {
      const sourceMeta = resolver(projection);
      const candidate = validateMagazineEmbeddingCandidate({ embedding: projection.embedding, sourceMeta });
      if (!candidate.ok) continue;
      candidates.push(candidate.candidate);
      resolved += 1;
    }
    const ranked = rankMagazineEmbeddingCandidates(query, candidates);
    return { ok: true, data: ranked, resolved, total: projections.length };
  } catch (error) {
    logger.error("[magazine-embedding] search failed", { error: error instanceof Error ? error.message : "unknown" });
    return { ok: false, error: "unavailable" };
  }
}

/** dedup 키를 노출한다(테스트·운영 점검용). 저장 규칙과 동일해야 한다. */
export const magazineEmbeddingDedupKey = magazineEmbeddingKey;
