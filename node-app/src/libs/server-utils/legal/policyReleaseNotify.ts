/**
 * @docHint
 * @purpose 정책 릴리스 검증 경보를 서버 로그로 남긴다.
 * @process 이벤트 최소 필드 구성  외부 발송 없이 구조화 오류 로그 기록
 * @domain legal-policy
 * @scope policy-release-notify
 */

import "server-only";

export type PolicyReleaseOpsEvent = {
  kind: "mismatch" | "run_failed" | "hold_set" | "revision_mismatch";
  runId: string;
  releaseId?: string;
  detail?: string;
  errorCode?: string;
};

export function notifyOps(event: PolicyReleaseOpsEvent): void {
  console.error("[policy-release-alert]", JSON.stringify({
    kind: event.kind,
    runId: event.runId,
    ...(event.releaseId ? { releaseId: event.releaseId } : {}),
    ...(event.detail ? { detail: event.detail.slice(0, 500) } : {}),
    ...(event.errorCode ? { errorCode: event.errorCode.slice(0, 80) } : {}),
  }));
}
