/**
 * @docHint
 * @purpose 로그에 남기기 전 인증 토큰의 원문 노출을 차단
 * @process URL·헤더·구조화 응답의 토큰 형태 문자열을 길이 보존 마커로 치환
 * @domain security
 * @scope logging
 */

export const TOKEN_LOG_MASK = "***";

const MAX_DEPTH = 12;
const SENSITIVE_KEYS = new Set([
  "token",
  "jwt",
  "authtoken",
  "accesstoken",
  "idtoken",
  "refreshtoken",
  "authorization",
  "proxyauthorization",
]);

const QUERY_TOKEN_PATTERN = /([?&](?:token|jwt|authToken|access_token)=)([^&#\s"'<>]*)/gi;
const AUTHORIZATION_HEADER_PATTERN = /(["']?(?:authorization|proxy-authorization)["']?\s*[:=]\s*["']?)(?:(\w+)\s+)?([A-Za-z0-9._~+\/-]+)/gi;
const BEARER_PATTERN = /\bBearer\s+([A-Za-z0-9._~+\/-]+)/gi;
const JWT_CANDIDATE_PATTERN = /\b[A-Za-z0-9_-]{3,}\.[A-Za-z0-9_-]{3,}\.[A-Za-z0-9_-]{3,}\b/g;
const INLINE_TOKEN_PATTERN = /(["']?(?:token|jwt|authToken|access_token|id_token|refresh_token)["']?\s*[:=]\s*["']?)([^"',\s}&]+)/gi;

function maskToken(value: string) {
  return `${TOKEN_LOG_MASK} (len=${value.length})`;
}

/** 문자열에 섞인 URL·헤더·JWT 토큰을 마스킹한다. */
export function maskSensitiveLogText(text: string): string {
  return text
    .replace(QUERY_TOKEN_PATTERN, (_match, prefix: string, value: string) => `${prefix}${maskToken(value)}`)
    .replace(
      AUTHORIZATION_HEADER_PATTERN,
      (_match, prefix: string, scheme: string | undefined, value: string) =>
        `${prefix}${scheme ? `${scheme} ` : ""}${maskToken(value)}`,
    )
    .replace(BEARER_PATTERN, (_match, value: string) => `Bearer ${maskToken(value)}`)
    .replace(JWT_CANDIDATE_PATTERN, (value: string) => {
      const [header] = value.split(".");
      const isLikelyJwt = header.startsWith("eyJ") || header.length >= 8 || /[0-9_-]/.test(value);
      return isLikelyJwt ? maskToken(value) : value;
    })
    .replace(INLINE_TOKEN_PATTERN, (_match, prefix: string, value: string) => `${prefix}${maskToken(value)}`);
}

function normalizeKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isSensitiveKey(key: string) {
  return SENSITIVE_KEYS.has(normalizeKey(key));
}

/** 구조화된 로그 인자를 보존하면서 토큰 문자열을 재귀적으로 마스킹한다. */
export function maskSensitiveLogValue(value: unknown): unknown {
  return maskValue(value, 0, new WeakSet<object>());
}

function maskValue(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (depth > MAX_DEPTH) return TOKEN_LOG_MASK;
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return maskSensitiveLogText(value);
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return value;
  if (value instanceof Date) return value;
  if (value instanceof Error) {
    return { name: value.name, message: maskSensitiveLogText(value.message) };
  }
  if (typeof value !== "object") return TOKEN_LOG_MASK;
  if (seen.has(value)) return "[circular]";
  seen.add(value);

  if (Array.isArray(value)) return value.map((item) => maskValue(item, depth + 1, seen));

  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (isSensitiveKey(key) && item !== null && item !== undefined) {
      result[key] = maskToken(String(item));
      continue;
    }
    result[key] = maskValue(item, depth + 1, seen);
  }
  return result;
}
