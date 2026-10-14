import type { AgeStepUpMockResult, AgeStepUpMockScenario } from "consts/system/ageStepUpMock";

/**
 * @docHint
 * @purpose 관리자 모의 step-up 화면 상태 전이
 * @process 선택  내부 확인  대기  결과 또는 요청 오류
 * @domain identity-mock
 * @scope admin-ui-state
 */
export type AgeStepUpMockFlowState =
  | { step: "idle" }
  | { step: "consent"; scenario: AgeStepUpMockScenario }
  | { step: "pending"; scenario: AgeStepUpMockScenario }
  | { step: "result"; result: AgeStepUpMockResult }
  | { step: "request_error"; scenario: AgeStepUpMockScenario; status: number | null };

export type AgeStepUpMockFlowEvent =
  | { type: "START"; scenario: AgeStepUpMockScenario }
  | { type: "CONFIRM" }
  | { type: "BACK" }
  | { type: "RESOLVED"; result: AgeStepUpMockResult }
  | { type: "FAILED"; status: number | null }
  | { type: "RETRY" }
  | { type: "RESET" };

const IDLE_STATE: AgeStepUpMockFlowState = { step: "idle" };

export function reduceAgeStepUpMockFlow(
  state: AgeStepUpMockFlowState,
  event: AgeStepUpMockFlowEvent,
): AgeStepUpMockFlowState {
  if (event.type === "RESET") return IDLE_STATE;

  switch (state.step) {
    case "idle":
      return event.type === "START" ? { step: "consent", scenario: event.scenario } : state;
    case "consent":
      if (event.type === "CONFIRM") return { step: "pending", scenario: state.scenario };
      return event.type === "BACK" ? IDLE_STATE : state;
    case "pending":
      if (event.type === "RESOLVED") return { step: "result", result: event.result };
      return event.type === "FAILED"
        ? { step: "request_error", scenario: state.scenario, status: event.status }
        : state;
    case "result":
      return event.type === "RETRY" && state.result.retryable
        ? { step: "consent", scenario: state.result.scenario }
        : state;
    case "request_error":
      return event.type === "RETRY" && state.status !== 403
        ? { step: "consent", scenario: state.scenario }
        : state;
  }
}

export function getAgeStepUpMockStepNumber(state: AgeStepUpMockFlowState): 1 | 2 | 3 {
  if (state.step === "idle") return 1;
  if (state.step === "consent") return 2;
  return 3;
}
