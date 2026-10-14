/**
 * @docHint
 * @purpose 관리자 Toss Cert 테스트 UI 상태 전이
 * @process 요청 준비  인증창 진행  서버 결과 확인 또는 오류
 * @domain age-assurance
 * @scope admin-ui-state
 */
export type AgeStepUpTossFlowState =
  | { step: "idle" }
  | { step: "starting" }
  | { step: "authorizing"; attemptId: string }
  | { step: "completing"; attemptId: string }
  | { step: "result_not_ready"; attemptId: string }
  | { step: "cancelled" }
  | { step: "complete" }
  | { step: "error"; stage: "start" | "authorization" | "complete" };

export type AgeStepUpTossFlowEvent =
  | { type: "START" }
  | { type: "STARTED"; attemptId: string }
  | { type: "START_FAILED" }
  | { type: "AUTH_SUCCEEDED" }
  | { type: "AUTH_CANCELLED" }
  | { type: "AUTH_FAILED" }
  | { type: "COMPLETE_SUCCEEDED" }
  | { type: "RESULT_NOT_READY" }
  | { type: "COMPLETE_FAILED" }
  | { type: "RETRY_RESULT" }
  | { type: "RESET" };

const IDLE_STATE: AgeStepUpTossFlowState = { step: "idle" };

export function reduceAgeStepUpTossFlow(
  state: AgeStepUpTossFlowState,
  event: AgeStepUpTossFlowEvent,
): AgeStepUpTossFlowState {
  if (event.type === "RESET") return IDLE_STATE;
  if (event.type === "START") {
    return isAgeStepUpTossFlowBusy(state) ? state : { step: "starting" };
  }

  switch (state.step) {
    case "idle":
    case "cancelled":
    case "complete":
    case "error":
      return state;
    case "starting":
      if (event.type === "STARTED") return { step: "authorizing", attemptId: event.attemptId };
      return event.type === "START_FAILED" ? { step: "error", stage: "start" } : state;
    case "authorizing":
      if (event.type === "AUTH_SUCCEEDED") return { step: "completing", attemptId: state.attemptId };
      if (event.type === "AUTH_CANCELLED") return { step: "cancelled" };
      return event.type === "AUTH_FAILED" ? { step: "error", stage: "authorization" } : state;
    case "completing":
      if (event.type === "COMPLETE_SUCCEEDED") return { step: "complete" };
      if (event.type === "RESULT_NOT_READY") return { step: "result_not_ready", attemptId: state.attemptId };
      return event.type === "COMPLETE_FAILED" ? { step: "error", stage: "complete" } : state;
    case "result_not_ready":
      return event.type === "RETRY_RESULT" ? { step: "completing", attemptId: state.attemptId } : state;
  }
}

export function isAgeStepUpTossFlowBusy(state: AgeStepUpTossFlowState): boolean {
  return state.step === "starting" || state.step === "authorizing" || state.step === "completing";
}

export function getAgeStepUpTossPendingAttemptId(state: AgeStepUpTossFlowState): string | null {
  return state.step === "result_not_ready" ? state.attemptId : null;
}
