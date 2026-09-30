import fetchClient from "libs/api/fetchClient";
import type { IStageDoc, IStageResponse, IStagesListResponse, IStageListParams } from "types/game";
import { logger } from "utils/log";
import { toErrorLike, toErrorMessage, toUnknownRecord } from "utils/common/typeUtils";
import { prepareStageCoordinateV2Write } from "utils/game/stageCoordinateContract";

/**
 * @docHint
 * @purpose 클라이언트 API 호출 래핑
 * @process 엔드포인트(/game/stages) 호출 구성  응답/에러 정리 반환
 * @domain game
 * @scope client
 */

type StageSingleApiResponse = IStageResponse;
type StageMutationResponse = Partial<IStageResponse>;

// Stage 목록
export async function listStages(params: IStageListParams = {}): Promise<IStagesListResponse> {
  try {
    const res = await fetchClient.get<IStagesListResponse>("/game/stages", {
      params: params as unknown as Record<string, unknown>,
    });
    return res.data;
  } catch (error: unknown) {
    const err = toErrorLike(error);
    logger.error(
      "[stageAdminClient] Stage 목록 조회 실패:",
      toUnknownRecord(err.response).data || toErrorMessage(error),
    );
    throw error;
  }
}

// 단일 Stage 조회
export async function getStageById(id: string): Promise<IStageDoc> {
  const res = await fetchClient.get<StageSingleApiResponse>(`/game/stages/${id}`);
  if (!res.data.success) {
    throw new Error(res.data.message || "StageDoc을 가져오는데 실패했습니다.");
  }
  return res.data.data;
}

// Stage 생성
export async function createStage(payload: Partial<IStageDoc> & { stageId: string; stageName: string }) {
  const res = await fetchClient.post<StageMutationResponse>(
    "/game/stages",
    prepareStageCoordinateV2Write(payload),
  );
  if (!res.data.success || !res.data.data) {
    throw new Error(res.data.message || "StageDoc 생성에 실패했습니다.");
  }
  return res.data.data;
}

// Stage 수정
export async function updateStage(id: string, payload: Partial<IStageDoc>) {
  const body = payload;
  const res = await fetchClient.put<StageMutationResponse>(`/game/stages/${id}`, body);
  if (!res.data.success || !res.data.data) {
    throw new Error(res.data.message || "StageDoc 수정에 실패했습니다.");
  }
  return res.data.data;
}

// Stage 삭제
export async function deleteStage(id: string): Promise<void> {
  const res = await fetchClient.delete<StageMutationResponse>(`/game/stages/${id}`);
  if (!res.data.success) {
    throw new Error(res.data.message || "StageDoc 삭제에 실패했습니다.");
  }
}
