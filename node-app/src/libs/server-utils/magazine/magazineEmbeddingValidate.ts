import "server-only";

import {
  MAGAZINE_EMBEDDING_CONTRACT_TYPE,
  MAGAZINE_EMBEDDING_DIGEST_PATTERN,
  MAGAZINE_EMBEDDING_DOCUMENT_KINDS,
  MAGAZINE_EMBEDDING_LIMITS,
  MAGAZINE_EMBEDDING_POLICY_VERSION,
  MAGAZINE_EMBEDDING_PROVIDERS,
  MAGAZINE_EMBEDDING_SCHEMA_VERSION,
  type MagazineEmbedding,
  type MagazineEmbeddingCandidate,
} from "./magazineEmbeddingContract";
import {
  DATE_PATTERN,
  MagazineKnowledgeContractError,
  assertKeys,
  enumValue,
  fail,
  isRecord,
  safeText,
  textList,
} from "./magazineKnowledgeSafety";

/**
 * @docHint
 * @purpose Semantic Index embedding 저장·검색 쿼리의 fail-closed 검증 (MIR-202)
 * @process vector·provenance·dedup 키 검증 -> 쿼리·필터·공개 gate 검증 -> dedup 키 생성
 * @domain magazine-semantic-index
 * @scope server-contract
 */

function provenance(value: unknown): { provider: string; modelRole: string; modelVersion: string; dimension: number } {
  if (!isRecord(value)) fail("provenance", "객체가 필요합니다.");
  assertKeys(value, ["provider", "modelRole", "modelVersion", "dimension"], ["provider", "modelRole", "modelVersion", "dimension"], "provenance");
  const provider = enumValue(value.provider, MAGAZINE_EMBEDDING_PROVIDERS, "provenance.provider");
  const modelRole = safeText(value.modelRole, MAGAZINE_EMBEDDING_LIMITS.modelRoleLength, "provenance.modelRole");
  const modelVersion = safeText(value.modelVersion, MAGAZINE_EMBEDDING_LIMITS.modelVersionLength, "provenance.modelVersion");
  if (!Number.isInteger(value.dimension) || Number(value.dimension) <= 0 || Number(value.dimension) > MAGAZINE_EMBEDDING_LIMITS.dimensionMax) {
    fail("provenance.dimension", "양의 정수 차원이 필요합니다.");
  }
  return { provider, modelRole, modelVersion, dimension: Number(value.dimension) };
}

function vectorValue(value: unknown, field: string): number[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAGAZINE_EMBEDDING_LIMITS.vectorLength) {
    fail(field, `비어 있지 않은 1~${MAGAZINE_EMBEDDING_LIMITS.vectorLength}차원 배열이 필요합니다.`);
  }
  return value.map((item, index) => {
    if (typeof item !== "number" || !Number.isFinite(item)) fail(`${field}[${index}]`, "유한한 수가 필요합니다.");
    if (Math.abs(item) > MAGAZINE_EMBEDDING_LIMITS.vectorValueMax) fail(`${field}[${index}]`, "벡터 값 범위를 벗어났습니다.");
    return item;
  });
}

export type MagazineEmbeddingValidation =
  | { ok: true; embedding: MagazineEmbedding }
  | { ok: false; reasonCode: "magazine_embedding_invalid"; issues: string[] };

export function validateMagazineEmbedding(value: unknown): MagazineEmbeddingValidation {
  try {
    if (!isRecord(value)) fail("embedding", "객체가 필요합니다.");
    const required = [
      "contractType", "schemaVersion", "policyVersion", "documentRef", "documentKind",
      "namespace", "textDigest", "provenance", "vector", "indexedAt", "staleAt",
    ];
    assertKeys(value, required, required, "embedding");
    if (value.contractType !== MAGAZINE_EMBEDDING_CONTRACT_TYPE) fail("contractType", "지원하지 않는 contractType입니다.");
    if (value.schemaVersion !== MAGAZINE_EMBEDDING_SCHEMA_VERSION) fail("schemaVersion", "지원하지 않는 schemaVersion입니다.");
    if (value.policyVersion !== MAGAZINE_EMBEDDING_POLICY_VERSION) fail("policyVersion", "지원하는 policyVersion이 아닙니다.");

    enumValue(value.documentKind, MAGAZINE_EMBEDDING_DOCUMENT_KINDS, "documentKind");
    safeText(value.documentRef, MAGAZINE_EMBEDDING_LIMITS.documentRefLength, "documentRef");
    safeText(value.namespace, MAGAZINE_EMBEDDING_LIMITS.namespaceLength, "namespace");
    if (typeof value.textDigest !== "string" || !MAGAZINE_EMBEDDING_DIGEST_PATTERN.test(value.textDigest.trim())) {
      fail("textDigest", "sha256 hex 다이제스트가 필요합니다.");
    }

    const prov = provenance(value.provenance);
    const vector = vectorValue(value.vector, "vector");
    if (vector.length !== prov.dimension) fail("vector", `dimension(${prov.dimension})과 벡터 길이가 일치해야 합니다.`);

    if (typeof value.indexedAt !== "string" || !DATE_PATTERN.test(value.indexedAt.trim())) fail("indexedAt", "ISO 날짜가 필요합니다.");
    if (value.staleAt !== null && (typeof value.staleAt !== "string" || !DATE_PATTERN.test(value.staleAt.trim()))) {
      fail("staleAt", "null 또는 ISO 날짜여야 합니다.");
    }

    return { ok: true, embedding: value as unknown as MagazineEmbedding };
  } catch (error) {
    const message = error instanceof MagazineKnowledgeContractError ? error.message : "계약 검증에 실패했습니다.";
    return { ok: false, reasonCode: "magazine_embedding_invalid", issues: [message] };
  }
}

function filterValue(value: unknown): void {
  if (!isRecord(value)) fail("filter", "객체가 필요합니다.");
  const allowed = ["namespace", "documentKind", "topics", "entities", "intent", "excludeStale"];
  assertKeys(value, [], allowed, "filter");
  if (value.namespace !== undefined) safeText(value.namespace, MAGAZINE_EMBEDDING_LIMITS.namespaceLength, "filter.namespace");
  if (value.documentKind !== undefined) enumValue(value.documentKind, MAGAZINE_EMBEDDING_DOCUMENT_KINDS, "filter.documentKind");
  if (value.topics !== undefined) textList(value.topics, "filter.topics", MAGAZINE_EMBEDDING_LIMITS.filterValues, MAGAZINE_EMBEDDING_LIMITS.filterValueLength);
  if (value.entities !== undefined) textList(value.entities, "filter.entities", MAGAZINE_EMBEDDING_LIMITS.filterValues, MAGAZINE_EMBEDDING_LIMITS.filterValueLength);
  if (value.intent !== undefined) safeText(value.intent, MAGAZINE_EMBEDDING_LIMITS.filterValueLength, "filter.intent");
  if (value.excludeStale !== undefined && typeof value.excludeStale !== "boolean") fail("filter.excludeStale", "boolean이 필요합니다.");
}

function queryVector(value: unknown): number[] {
  if (value === undefined) return [];
  const vector = vectorValue(value, "vector");
  if (vector.length === 0) fail("vector", "쿼리 벡터는 비어 있으면 안 됩니다.");
  return vector;
}

export interface ValidatedMagazineEmbeddingQuery {
  text: string;
  vector: number[];
  topK: number;
  minScore: number;
  filter?: Record<string, unknown>;
  isPublicOnly: boolean;
}

export type MagazineEmbeddingQueryValidation =
  | { ok: true; query: ValidatedMagazineEmbeddingQuery }
  | { ok: false; reasonCode: "magazine_embedding_query_invalid"; issues: string[] };

export function validateMagazineEmbeddingQuery(value: unknown): MagazineEmbeddingQueryValidation {
  try {
    if (!isRecord(value)) fail("query", "객체가 필요합니다.");
    assertKeys(value, ["text", "topK", "minScore"], ["text", "vector", "topK", "minScore", "filter", "isPublicOnly"], "query");
    const text = safeText(value.text, MAGAZINE_EMBEDDING_LIMITS.queryStringLength, "text", true);
    if (!text.trim() && value.vector === undefined) fail("text", "text 또는 vector 중 하나는 제공해야 합니다.");
    const vector = queryVector(value.vector);

    if (!Number.isInteger(value.topK) || Number(value.topK) <= 0 || Number(value.topK) > MAGAZINE_EMBEDDING_LIMITS.topKMax) {
      fail("topK", `1~${MAGAZINE_EMBEDDING_LIMITS.topKMax} 정수가 필요합니다.`);
    }
    if (typeof value.minScore !== "number" || !Number.isFinite(value.minScore) || value.minScore < -1 || value.minScore > 1) {
      fail("minScore", "-1~1 숫자가 필요합니다.");
    }
    if (value.filter !== undefined) filterValue(value.filter);
    if (value.isPublicOnly !== undefined && typeof value.isPublicOnly !== "boolean") fail("isPublicOnly", "boolean이 필요합니다.");

    return {
      ok: true,
      query: {
        text,
        vector,
        topK: Number(value.topK),
        minScore: Number(value.minScore),
        filter: value.filter as Record<string, unknown> | undefined,
        isPublicOnly: value.isPublicOnly === true,
      },
    };
  } catch (error) {
    const message = error instanceof MagazineKnowledgeContractError ? error.message : "계약 검증에 실패했습니다.";
    return { ok: false, reasonCode: "magazine_embedding_query_invalid", issues: [message] };
  }
}

export type MagazineEmbeddingCandidateValidation =
  | { ok: true; candidate: MagazineEmbeddingCandidate }
  | { ok: false; reasonCode: "magazine_embedding_candidate_invalid"; issues: string[] };

export function validateMagazineEmbeddingCandidate(value: unknown): MagazineEmbeddingCandidateValidation {
  try {
    if (!isRecord(value)) fail("candidate", "객체가 필요합니다.");
    assertKeys(value, ["embedding", "sourceMeta"], ["embedding", "sourceMeta"], "candidate");
    const embeddingResult = validateMagazineEmbedding(value.embedding);
    if (!embeddingResult.ok) return { ok: false, reasonCode: "magazine_embedding_candidate_invalid", issues: embeddingResult.issues };
    if (!isRecord(value.sourceMeta)) fail("sourceMeta", "객체가 필요합니다.");
    const sourceMeta = value.sourceMeta as Record<string, unknown>;
    assertKeys(sourceMeta, ["topics", "entities", "intent", "sourceRevision", "eligible"], ["topics", "entities", "intent", "sourceRevision", "eligible"], "sourceMeta");
    textList(sourceMeta.topics, "sourceMeta.topics", MAGAZINE_EMBEDDING_LIMITS.filterValues, MAGAZINE_EMBEDDING_LIMITS.filterValueLength);
    textList(sourceMeta.entities, "sourceMeta.entities", MAGAZINE_EMBEDDING_LIMITS.filterValues, MAGAZINE_EMBEDDING_LIMITS.filterValueLength);
    safeText(sourceMeta.intent, MAGAZINE_EMBEDDING_LIMITS.filterValueLength, "sourceMeta.intent", true);
    safeText(sourceMeta.sourceRevision, 400, "sourceMeta.sourceRevision");
    if (typeof sourceMeta.eligible !== "boolean") fail("sourceMeta.eligible", "boolean이 필요합니다.");
    return { ok: true, candidate: value as unknown as MagazineEmbeddingCandidate };
  } catch (error) {
    const message = error instanceof MagazineKnowledgeContractError ? error.message : "계약 검증에 실패했습니다.";
    return { ok: false, reasonCode: "magazine_embedding_candidate_invalid", issues: [message] };
  }
}

/** dedup 키 — (documentRef, textDigest, modelVersion, namespace). 재계산 중복 방지(unique 인덱스와 동일 규칙). */
export function magazineEmbeddingKey(documentRef: string, textDigest: string, modelVersion: string, namespace: string): string {
  return [namespace, documentRef, modelVersion, textDigest].join("|");
}
