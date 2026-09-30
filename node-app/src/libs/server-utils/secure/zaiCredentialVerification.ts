/**
 * @docHint
 * @purpose Z.ai 자격증명 인증 응답의 무과금 검증 결과 판정
 * @process upstream HTTP status 분류  인증 성공·실패 결과 반환
 * @domain ai-credential
 * @scope secure-server
 */

export type ZaiCredentialVerificationResult = {
  valid: boolean;
  code: string;
};

export function classifyZaiChatAuthStatus(status: number): ZaiCredentialVerificationResult {
  if (status === 401 || status === 403) {
    return { valid: false, code: `UPSTREAM_HTTP_${status}` };
  }
  if ((status >= 200 && status < 300) || status === 400 || status === 415 || status === 422) {
    return { valid: true, code: `AUTH_ACCEPTED_HTTP_${status}` };
  }
  return { valid: false, code: `UPSTREAM_HTTP_${status}` };
}
