/**
 * @docHint
 * @purpose ElevenLabs 자격증명 조회 검증 응답의 원인 분류
 * @process upstream HTTP status·detail.status 분류  키·권한·quota·IP 원인 구분
 * @domain ai-credential
 * @scope secure-server
 *
 * 정책 정본: node-app `rules/platform-credentials.md` §3 —
 * **자격증명 문제와 IP 문제를 다른 코드로 구분한다.** 뭉뚱그리면 IP 미등록일 때 멀쩡한 키를 재발급하게 된다.
 * 여기에 권한(scope) 부족과 크레딧 소진을 더해 네 원인을 각각 다른 코드로 돌려준다 (EL-201).
 *
 * 순수 함수로 분리한 이유는 zaiCredentialVerification.ts와 같다 — 네트워크 없이 분류 규칙만 테스트한다.
 */

export type ElevenLabsCredentialVerificationResult = {
  valid: boolean;
  code: string;
};

/** ElevenLabs 오류 본문은 `{ detail: { status, message } }` 형태다. status 문자열이 원인을 구분한다. */
export function readElevenLabsDetailStatus(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const detail = (body as { detail?: unknown }).detail;
  if (typeof detail === "string") return detail.trim().toLowerCase();
  if (detail && typeof detail === "object") {
    return String((detail as { status?: unknown }).status || "").trim().toLowerCase();
  }
  return "";
}

/**
 * IP allowlist 차단은 키를 다시 발급해도 해결되지 않는다.
 * 정확한 detail.status 문자열을 실호출로 확인하지 못했으므로(추정) `ip` 토큰을 포함하는 status를 넓게 잡는다.
 * `missing_permissions`·`invalid_api_key` 같은 다른 원인에는 이 토큰이 없다.
 */
const IP_STATUS_PATTERN = /(^|_)ip(_|$)/;

const INVALID_KEY_STATUSES = new Set([
  "invalid_api_key",
  "missing_api_key",
  "needs_authorization",
  "api_key_not_found",
]);

const MISSING_PERMISSION_STATUSES = new Set(["missing_permissions", "missing_permission"]);

export function classifyElevenLabsAuthStatus(
  status: number,
  detailStatus = "",
): ElevenLabsCredentialVerificationResult {
  if (status >= 200 && status < 300) return { valid: true, code: "MODELS_OK" };

  const detail = String(detailStatus || "").trim().toLowerCase();

  if (detail && IP_STATUS_PATTERN.test(detail)) {
    return { valid: false, code: "ELEVENLABS_IP_NOT_ALLOWED" };
  }
  if (MISSING_PERMISSION_STATUSES.has(detail)) {
    // 키 자체는 유효하다. 재발급이 아니라 권한 추가가 조치다.
    return { valid: false, code: "ELEVENLABS_MISSING_PERMISSION" };
  }
  if (INVALID_KEY_STATUSES.has(detail)) {
    return { valid: false, code: "ELEVENLABS_INVALID_KEY" };
  }
  if (detail === "quota_exceeded") {
    return { valid: false, code: "ELEVENLABS_QUOTA_EXCEEDED" };
  }
  if (detail === "detected_unusual_activity") {
    return { valid: false, code: "ELEVENLABS_ACTIVITY_BLOCKED" };
  }
  if (detail === "too_many_concurrent_requests") {
    return { valid: false, code: "ELEVENLABS_CONCURRENCY_LIMIT" };
  }

  if (status === 401 || status === 403) {
    // detail을 못 읽은 인증 실패. 키 문제로 단정하지 않는다 — IP·권한도 같은 status로 온다.
    return { valid: false, code: `ELEVENLABS_UNAUTHORIZED_HTTP_${status}` };
  }
  return { valid: false, code: `UPSTREAM_HTTP_${status}` };
}

/**
 * 구독 조회 응답에서 잔여 크레딧 상태를 읽는다.
 * Grant는 33,000,000 크레딧·12개월 한정이므로 소진 여부가 곧 실호출 가능 여부다 (EL-004).
 * 권한이 없거나 형식이 다르면 `unknown`이며, 이를 소진으로 해석하지 않는다.
 */
export function readElevenLabsQuotaState(body: unknown): "available" | "exhausted" | "unknown" {
  if (!body || typeof body !== "object") return "unknown";
  const record = body as Record<string, unknown>;
  const used = Number(record.character_count);
  const limit = Number(record.character_limit);
  if (!Number.isFinite(used) || !Number.isFinite(limit) || limit <= 0) return "unknown";
  return used >= limit ? "exhausted" : "available";
}
