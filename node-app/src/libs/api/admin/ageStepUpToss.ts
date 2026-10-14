import fetchClient from "libs/api/fetchClient";
import type {
  AgeAssuranceCompleteRequest,
  AgeAssuranceCompleteResponse,
  AgeAssuranceStartResponse,
  AgeAssuranceStateResponse,
} from "types/identity/ageAssurance";

/**
 * @docHint
 * @purpose 관리자 Toss Cert 테스트 API 요청
 * @process 시작·결과 확인·상태 조회·테스트 상태 삭제
 * @domain age-assurance
 * @scope admin-client-api
 */
export async function getAgeStepUpTossState() {
  const response = await fetchClient.get<AgeAssuranceStateResponse>(
    "/admin/age-step-up/toss/state",
    { responseType: "json" },
  );
  return response.data.state;
}

export async function startAgeStepUpToss() {
  const response = await fetchClient.post<AgeAssuranceStartResponse>(
    "/admin/age-step-up/toss/start",
    {},
    { responseType: "json" },
  );
  return response.data;
}

export async function completeAgeStepUpToss(attemptId: string) {
  const body: AgeAssuranceCompleteRequest = { attemptId };
  const response = await fetchClient.post<AgeAssuranceCompleteResponse>(
    "/admin/age-step-up/toss/complete",
    body,
    { responseType: "json" },
  );
  return response.data.state;
}

export async function deleteAgeStepUpTossState() {
  const response = await fetchClient.delete<AgeAssuranceStateResponse>(
    "/admin/age-step-up/toss/state",
    { responseType: "json" },
  );
  return response.data.state;
}
