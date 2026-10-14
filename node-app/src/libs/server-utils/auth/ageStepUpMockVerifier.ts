import "server-only";
import { randomUUID } from "crypto";
import { USER_ROLES } from "consts/auth";
import { AGE_ASSURANCE_FEATURE_KEYS } from "consts/system/featureRollout";
import {
  AGE_STEP_UP_MOCK_ADMIN_ONLY_ERROR_CODE,
  AGE_STEP_UP_MOCK_INVALID_SCENARIO_ERROR_CODE,
  AGE_STEP_UP_MOCK_OUTCOME_BY_SCENARIO,
  isAgeStepUpMockScenario,
  type AgeStepUpMockResult,
} from "consts/system/ageStepUpMock";
import { assertFeatureAccessOrThrow } from "./featureAccessPolicy";
import { getUserRole } from "./userRoleUtils";
import type { IUpdateUserData } from "types/user";
import { logger } from "utils/log";

/**
 * @docHint
 * @purpose 저장·외부 provider 호출 없이 Admin-only 성인 확인 mock 결과 생성
 * @process feature 접근 확인  독립 Admin 확인  scenario 검증  synthetic 결과 반환
 * @domain identity
 * @scope server
 */

export type AgeStepUpMockVerifierDeps = {
  assertFeatureAccess?: (args: { featureKey: string; user: unknown }) => Promise<unknown>;
  now?: () => Date;
  createAttemptId?: () => string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createMockError(message: string, errorCode: string, status: number) {
  return Object.assign(new Error(message), { errorCode, status });
}

export async function dispatchAgeStepUpMockVerification(
  args: { user: unknown; scenario: unknown },
  deps: AgeStepUpMockVerifierDeps = {},
): Promise<AgeStepUpMockResult> {
  await (deps.assertFeatureAccess ?? assertFeatureAccessOrThrow)({
    featureKey: AGE_ASSURANCE_FEATURE_KEYS.stepUp,
    user: args.user,
  });

  const user = args.user;
  const isAdmin = isRecord(user) && getUserRole(user as unknown as IUpdateUserData).includes(USER_ROLES.ADMINISTRATOR);
  if (!isAdmin) {
    throw createMockError("관리자 전용 모의 흐름입니다.", AGE_STEP_UP_MOCK_ADMIN_ONLY_ERROR_CODE, 403);
  }

  if (!isAgeStepUpMockScenario(args.scenario)) {
    throw createMockError("지원하지 않는 모의 시나리오입니다.", AGE_STEP_UP_MOCK_INVALID_SCENARIO_ERROR_CODE, 400);
  }

  const scenario = args.scenario;
  const outcome = AGE_STEP_UP_MOCK_OUTCOME_BY_SCENARIO[scenario];
  const result: AgeStepUpMockResult = {
    syntheticOnly: true,
    persisted: false,
    attemptId: deps.createAttemptId?.() ?? `mock_${randomUUID()}`,
    scenario,
    outcome,
    retryable: outcome !== "synthetic_pass",
    completedAt: (deps.now?.() ?? new Date()).toISOString(),
  };

  logger.info("성인 확인 모의 흐름", { featureKey: AGE_ASSURANCE_FEATURE_KEYS.stepUp, scenario, outcome });
  return result;
}
