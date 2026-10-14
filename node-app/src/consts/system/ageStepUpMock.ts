/**
 * @docHint
 * @purpose Admin-only 성인 확인 mock 흐름의 공유 상수와 client-safe 타입 제공
 * @process scenario 검증  synthetic outcome 매핑  요청·응답 타입 공유
 * @domain identity
 * @scope client-safe
 */

export const AGE_STEP_UP_MOCK_SCENARIOS = ["success", "failure", "cancelled", "expired", "provider_error"] as const;
export type AgeStepUpMockScenario = (typeof AGE_STEP_UP_MOCK_SCENARIOS)[number];

export const AGE_STEP_UP_MOCK_OUTCOMES = ["synthetic_pass", "synthetic_fail", "cancelled", "expired", "error"] as const;
export type AgeStepUpMockOutcome = (typeof AGE_STEP_UP_MOCK_OUTCOMES)[number];

/** scenario별 결과는 고정 매핑이며 무작위·외부 입력으로 바뀌지 않는다. */
export const AGE_STEP_UP_MOCK_OUTCOME_BY_SCENARIO: Readonly<Record<AgeStepUpMockScenario, AgeStepUpMockOutcome>> = Object.freeze({
  success: "synthetic_pass",
  failure: "synthetic_fail",
  cancelled: "cancelled",
  expired: "expired",
  provider_error: "error",
});

export type AgeStepUpMockResult = {
  syntheticOnly: true;
  persisted: false;
  /** mock_ prefix가 붙은 계정·실제 거래와 무관한 synthetic 식별자. */
  attemptId: string;
  scenario: AgeStepUpMockScenario;
  outcome: AgeStepUpMockOutcome;
  /** synthetic_pass만 false. */
  retryable: boolean;
  /** ISO 8601. */
  completedAt: string;
};

export type AgeStepUpMockResponse = { ok: true; result: AgeStepUpMockResult };

export const AGE_STEP_UP_MOCK_ADMIN_ONLY_ERROR_CODE = "AGE_STEP_UP_MOCK_ADMIN_ONLY" as const;
export const AGE_STEP_UP_MOCK_INVALID_SCENARIO_ERROR_CODE = "AGE_STEP_UP_MOCK_INVALID_SCENARIO" as const;

export function isAgeStepUpMockScenario(value: unknown): value is AgeStepUpMockScenario {
  return typeof value === "string" && (AGE_STEP_UP_MOCK_SCENARIOS as readonly string[]).includes(value);
}
