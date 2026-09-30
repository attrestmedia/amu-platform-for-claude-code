import "server-only";

import {
  INTELLIGENCE_PATTERN_POLICY_VERSION,
  INTELLIGENCE_PATTERN_SCHEMA_VERSION,
} from "./magazineIntelligencePatternContract";

/**
 * @docHint
 * @purpose AIR-802 read-only Pattern API의 version·cursor·error envelope
 * @process 불투명 cursor와 일관된 success/error envelope를 제공하고 원시 DB 오류를 숨김
 * @domain intelligence-pattern-registry
 * @scope server-contract
 */

export const INTELLIGENCE_PATTERN_READ_API_VERSION = "intelligence-pattern-read.v1" as const;
export const INTELLIGENCE_PATTERN_MARKETING_OOPS_CONSUMER_VERSION = "marketing-oops-intelligence-pattern.v1" as const;
export const INTELLIGENCE_PATTERN_READ_DEFAULT_LIMIT = 20;
export const INTELLIGENCE_PATTERN_READ_MAX_LIMIT = 50;

export type IntelligencePatternReadErrorCode =
  | "INVALID_INPUT"
  | "INVALID_CURSOR"
  | "NOT_FOUND"
  | "UNAUTHORIZED"
  | "SERVICE_UNAVAILABLE";

export type IntelligencePatternReadCursor = { updatedAt: string; patternId: string };
export type IntelligencePatternReadPage = { limit: number; hasMore: boolean; nextCursor: string | null };
export type IntelligencePatternReadConsumer = "public" | typeof INTELLIGENCE_PATTERN_MARKETING_OOPS_CONSUMER_VERSION;

export type IntelligencePatternReadEnvelope<T> = {
  ok: true;
  apiVersion: typeof INTELLIGENCE_PATTERN_READ_API_VERSION;
  schemaVersion: typeof INTELLIGENCE_PATTERN_SCHEMA_VERSION;
  policyVersion: typeof INTELLIGENCE_PATTERN_POLICY_VERSION;
  /** 단건 응답이면 연결된 revision, 목록 응답이면 null. 각 link에도 articleRevision을 유지한다. */
  articleRevision: string | null;
  updatedAt: string | null;
  /** AIR-803이 사용할 때만 consumer contract version을 명시한다. */
  consumer?: IntelligencePatternReadConsumer;
  data: T;
  page?: IntelligencePatternReadPage;
};

export type IntelligencePatternReadErrorEnvelope = {
  ok: false;
  apiVersion: typeof INTELLIGENCE_PATTERN_READ_API_VERSION;
  schemaVersion: typeof INTELLIGENCE_PATTERN_SCHEMA_VERSION;
  policyVersion: typeof INTELLIGENCE_PATTERN_POLICY_VERSION;
  error: { code: IntelligencePatternReadErrorCode; message: string; field?: string };
};

export function patternReadEnvelope<T>(data: T, args: { articleRevision?: string | null; updatedAt?: string | null; consumer?: IntelligencePatternReadConsumer; page?: IntelligencePatternReadPage } = {}): IntelligencePatternReadEnvelope<T> {
  return {
    ok: true,
    apiVersion: INTELLIGENCE_PATTERN_READ_API_VERSION,
    schemaVersion: INTELLIGENCE_PATTERN_SCHEMA_VERSION,
    policyVersion: INTELLIGENCE_PATTERN_POLICY_VERSION,
    articleRevision: args.articleRevision ?? null,
    updatedAt: args.updatedAt ?? null,
    ...(args.consumer ? { consumer: args.consumer } : {}),
    data,
    ...(args.page ? { page: args.page } : {}),
  };
}

export function patternReadError(code: IntelligencePatternReadErrorCode, message: string, field?: string): IntelligencePatternReadErrorEnvelope {
  return {
    ok: false,
    apiVersion: INTELLIGENCE_PATTERN_READ_API_VERSION,
    schemaVersion: INTELLIGENCE_PATTERN_SCHEMA_VERSION,
    policyVersion: INTELLIGENCE_PATTERN_POLICY_VERSION,
    error: { code, message, ...(field ? { field } : {}) },
  };
}

export function patternReadErrorStatus(code: IntelligencePatternReadErrorCode): number {
  if (code === "NOT_FOUND") return 404;
  if (code === "UNAUTHORIZED") return 401;
  if (code === "SERVICE_UNAVAILABLE") return 503;
  return 400;
}

export function encodePatternReadCursor(cursor: IntelligencePatternReadCursor): string {
  return Buffer.from(JSON.stringify({ u: cursor.updatedAt, p: cursor.patternId }), "utf8").toString("base64url");
}

export function decodePatternReadCursor(raw: string): IntelligencePatternReadCursor | null {
  const value = String(raw || "").trim();
  if (!value || value.length > 512) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as { u?: unknown; p?: unknown };
    const updatedAt = typeof parsed.u === "string" ? parsed.u.trim() : "";
    const patternId = typeof parsed.p === "string" ? parsed.p.trim() : "";
    if (!updatedAt || !patternId || Number.isNaN(new Date(updatedAt).getTime())) return null;
    return { updatedAt, patternId };
  } catch {
    return null;
  }
}

export function parsePatternReadLimit(raw: string | null): { ok: true; limit: number } | { ok: false } {
  if (raw === null || raw.trim() === "") return { ok: true, limit: INTELLIGENCE_PATTERN_READ_DEFAULT_LIMIT };
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > INTELLIGENCE_PATTERN_READ_MAX_LIMIT) return { ok: false };
  return { ok: true, limit: value };
}

export function newestPatternUpdatedAt(values: Array<string | null | undefined>): string | null {
  let newest: string | null = null;
  for (const value of values) {
    if (!value || Number.isNaN(new Date(value).getTime())) continue;
    if (!newest || new Date(value).getTime() > new Date(newest).getTime()) newest = value;
  }
  return newest;
}
