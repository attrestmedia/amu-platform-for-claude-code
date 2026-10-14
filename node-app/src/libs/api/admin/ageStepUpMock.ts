import fetchClient from "libs/api/fetchClient";
import type { AgeStepUpMockResponse, AgeStepUpMockResult, AgeStepUpMockScenario } from "consts/system/ageStepUpMock";

/**
 * @docHint
 * @purpose 관리자 전용 모의 step-up API 요청
 * @process 시나리오 전송  synthetic 결과 반환
 * @domain identity-mock
 * @scope admin-client-api
 */
export async function postAgeStepUpMock(scenario: AgeStepUpMockScenario): Promise<AgeStepUpMockResult> {
  const response = await fetchClient.post<AgeStepUpMockResponse>(
    "/admin/age-step-up/mock",
    { scenario },
    { responseType: "json" },
  );
  return response.data.result;
}
