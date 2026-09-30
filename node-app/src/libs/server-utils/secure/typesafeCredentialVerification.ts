/**
 * @docHint
 * @purpose TypeSafe 모델 목록 검증 결과를 안전 코드로 분류
 * @process 모델 목록 GET probe(킬 스위치 포함)의 HTTP 상태만 판정
 * @domain ai-credential
 * @scope secure-server
 */

export const TYPESAFE_API_BASE_URL = "https://api.typesafe.ai/v1";

// OD-JEV-05(2026-09-26 사용자 결정): GET /v1/models는 과금 여부와 무관하게 허용한다(공식 문서상 과금은 inference input token 기준).
// false로 되돌리면 verifier는 네트워크 호출 없이 TYPESAFE_VERIFY_DEFERRED를 반환한다(킬 스위치).
export const TYPESAFE_MODELS_PROBE_ENABLED = true;

export const TYPESAFE_VERIFY_DEFERRED_CODE = "TYPESAFE_VERIFY_DEFERRED";

export function classifyTypesafeModelsStatus(status: number): { valid: boolean; code: string } {
  if (status >= 200 && status < 300) return { valid: true, code: "MODELS_OK" };
  if (status === 401) return { valid: false, code: "TYPESAFE_INVALID_KEY" };
  if (status === 403) return { valid: false, code: "TYPESAFE_FORBIDDEN" };
  if (status === 429) return { valid: false, code: "TYPESAFE_RATE_LIMITED" };
  return { valid: false, code: `UPSTREAM_HTTP_${status}` };
}
