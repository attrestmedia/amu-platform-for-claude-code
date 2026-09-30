import "server-only";

import {
  KNOWLEDGE_ARTICLE_SCHEMA_VERSION,
  KNOWLEDGE_POLICY_VERSION,
  KNOWLEDGE_UNIT_SCHEMA_VERSION,
  type MagazineKnowledgeArticle,
  type MagazineKnowledgeUnit,
} from "./magazineKnowledgeContract";
import {
  isPubliclyExposableKnowledgeArticle,
  isStaleKnowledgeUnit,
  publicKnowledgeArticleProjection,
  publicKnowledgeUnitProjection,
  type PublicKnowledgeArticle,
  type PublicKnowledgeUnit,
} from "./magazineKnowledgeValidate";

/**
 * @docHint
 * @purpose Knowledge Corpus 조회 계약 — envelope·cursor·공개 노출 게이트 — MIR-203
 * @process 노출 자격 fail-closed 판정 -> 공개 projection -> envelope/cursor 직렬화
 * @domain magazine-knowledge-corpus
 * @scope server-contract
 *
 * 이 모듈은 **읽기만** 소유한다. 적재·판정 갱신은 MIR-204(`magazineKnowledgeIngest`·agent/admin 쓰기 경로)가,
 * Intelligence Pattern Registry 조회는 통합 원장 AIR-802가 소유한다. 여기에 Pattern 조회를 만들지 않는다.
 */

export const KNOWLEDGE_READ_API_VERSION = "magazine-knowledge-read.v1" as const;
export const KNOWLEDGE_READ_DEFAULT_LIMIT = 20;
export const KNOWLEDGE_READ_MAX_LIMIT = 50;

export type KnowledgeReadErrorCode =
  | "INVALID_INPUT"
  | "INVALID_CURSOR"
  | "NOT_FOUND"
  | "UNAUTHORIZED"
  | "SERVICE_UNAVAILABLE";

export type KnowledgeReadCursor = { updatedAt: string; contentId: string };

export type KnowledgeReadPage = {
  limit: number;
  hasMore: boolean;
  nextCursor: string | null;
};

export type KnowledgeReadEnvelope<T> = {
  ok: true;
  apiVersion: typeof KNOWLEDGE_READ_API_VERSION;
  schemaVersion: { article: string; unit: string };
  policyVersion: typeof KNOWLEDGE_POLICY_VERSION;
  /** 응답에 담긴 자료의 최신 갱신 시각. 비어 있으면 null이며 현재 시각으로 대체하지 않는다. */
  updatedAt: string | null;
  data: T;
  page?: KnowledgeReadPage;
};

export type KnowledgeReadErrorEnvelope = {
  ok: false;
  apiVersion: typeof KNOWLEDGE_READ_API_VERSION;
  error: { code: KnowledgeReadErrorCode; message: string; field?: string };
};

export function knowledgeReadEnvelope<T>(data: T, args: { updatedAt?: string | null; page?: KnowledgeReadPage } = {}): KnowledgeReadEnvelope<T> {
  return {
    ok: true,
    apiVersion: KNOWLEDGE_READ_API_VERSION,
    schemaVersion: { article: KNOWLEDGE_ARTICLE_SCHEMA_VERSION, unit: KNOWLEDGE_UNIT_SCHEMA_VERSION },
    policyVersion: KNOWLEDGE_POLICY_VERSION,
    updatedAt: args.updatedAt ?? null,
    data,
    ...(args.page ? { page: args.page } : {}),
  };
}

/** 오류는 항상 구조화해 반환한다. 원시 provider·DB 오류 문구를 그대로 싣지 않는다. */
export function knowledgeReadError(code: KnowledgeReadErrorCode, message: string, field?: string): KnowledgeReadErrorEnvelope {
  return { ok: false, apiVersion: KNOWLEDGE_READ_API_VERSION, error: { code, message, ...(field ? { field } : {}) } };
}

export function knowledgeReadErrorStatus(code: KnowledgeReadErrorCode): number {
  if (code === "NOT_FOUND") return 404;
  if (code === "UNAUTHORIZED") return 401;
  if (code === "SERVICE_UNAVAILABLE") return 503;
  return 400;
}

/**
 * cursor는 정렬 키(`updatedAt`, `contentId`)를 그대로 담은 불투명 문자열이다.
 * 내부 `_id`나 offset을 노출하지 않으며, 형식이 깨진 값은 조용히 무시하지 않고 INVALID_CURSOR로 되돌린다.
 */
export function encodeKnowledgeCursor(cursor: KnowledgeReadCursor): string {
  const raw = JSON.stringify({ u: cursor.updatedAt, c: cursor.contentId });
  return Buffer.from(raw, "utf8").toString("base64url");
}

export function decodeKnowledgeCursor(raw: string): KnowledgeReadCursor | null {
  const value = String(raw || "").trim();
  if (!value || value.length > 512) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const record = parsed as { u?: unknown; c?: unknown };
    const updatedAt = typeof record.u === "string" ? record.u.trim() : "";
    const contentId = typeof record.c === "string" ? record.c.trim() : "";
    if (!updatedAt || !contentId) return null;
    if (Number.isNaN(new Date(updatedAt).getTime())) return null;
    return { updatedAt, contentId };
  } catch {
    return null;
  }
}

/** 잘못된 limit을 기본값으로 덮지 않는다 — 요청자가 무엇을 받는지 착각하지 않게 오류로 되돌린다. */
export function parseKnowledgeReadLimit(raw: string | null): { ok: true; limit: number } | { ok: false } {
  if (raw === null || raw.trim() === "") return { ok: true, limit: KNOWLEDGE_READ_DEFAULT_LIMIT };
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > KNOWLEDGE_READ_MAX_LIMIT) return { ok: false };
  return { ok: true, limit: value };
}

export type PublicKnowledgeArticleView = {
  article: PublicKnowledgeArticle;
  updatedAt: string;
};

export type PublicKnowledgeArticleDetail = PublicKnowledgeArticleView & {
  units: PublicKnowledgeUnit[];
};

/**
 * 공개 노출 판정 — allowlist가 아니라 **자격을 갖춘 것만** 통과시킨다.
 * `qualified` + `approved` + 추출 정상이 아닌 기사는 존재 자체를 응답하지 않는다(G-MIR-08, AIR-802 승계 규칙).
 */
export function toPublicKnowledgeArticleView(input: { article: MagazineKnowledgeArticle; updatedAt: string }): PublicKnowledgeArticleView | null {
  if (!isPubliclyExposableKnowledgeArticle(input.article)) return null;
  return { article: publicKnowledgeArticleProjection(input.article), updatedAt: input.updatedAt };
}

/**
 * 소속 기사가 공개 자격을 갖추고, unit이 그 기사의 현재 `sourceRevision`에서 추출된 것일 때만 노출한다.
 * 리뉴얼로 원문이 바뀌면 옛 revision의 unit이 collection에 남는데, 그 문장을 현재 기사의 지식으로 내보내지 않는다.
 */
export function toPublicKnowledgeUnits(article: MagazineKnowledgeArticle, units: MagazineKnowledgeUnit[]): PublicKnowledgeUnit[] {
  if (!isPubliclyExposableKnowledgeArticle(article)) return [];
  return units.filter((unit) => !isStaleKnowledgeUnit(unit, article)).map(publicKnowledgeUnitProjection);
}

export function newestUpdatedAt(values: Array<string | null | undefined>): string | null {
  let newest: string | null = null;
  for (const value of values) {
    if (!value) continue;
    const time = new Date(value).getTime();
    if (Number.isNaN(time)) continue;
    if (!newest || time > new Date(newest).getTime()) newest = value;
  }
  return newest;
}
