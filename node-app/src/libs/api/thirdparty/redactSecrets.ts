import "server-only";

/**
 * @docHint
 * @purpose 외부 provider 오류 본문을 로그/응답에 전파하기 전에 비밀값 키를 마스킹
 * @process 알려진 secret 키의 JSON 값 패턴을 [redacted]로 치환 (절단 전 적용)
 * @domain marketing
 * @scope server
 */

const SECRET_KEYS = [
  "access_token",
  "refresh_token",
  "id_token",
  "client_secret",
  "clientSecret",
  "developer-token",
  "developerToken",
  "secretKey",
  "authorization",
] as const;

const SECRET_PATTERNS = SECRET_KEYS.map((key) => new RegExp(`("${key}"\\s*:\\s*")[^"]*(")`, "gi"));

export function redactSecrets(raw: string) {
  return SECRET_PATTERNS.reduce((acc, pattern) => acc.replace(pattern, "$1[redacted]$2"), raw);
}
