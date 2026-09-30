import fetchClient from "libs/api/fetchClient";
import type { IUniverse, IUniverseResponse, IUniverseDetail, IUniverseDetailResponse } from "types/game";
import { logger } from "utils/log";
import { getResponseStatus, toErrorLike, toErrorMessage, toUnknownRecord } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose 클라이언트 API 호출 래핑
 * @process 요청 구성/호출  응답/에러 정리 반환
 * @domain universe
 * @scope client
 */

// 유니버스 목록 가져오기
export const getUniverseList = async (
  options: {
    enabledOnly?: boolean;
    sortByOrder?: boolean;
    displayFor?: string;
  } = {},
): Promise<IUniverse[]> => {
  try {
    const { enabledOnly = true, sortByOrder = true, displayFor = "" } = options;

    const params = new URLSearchParams();
    if (enabledOnly) params.append("enabled", "true");
    if (!sortByOrder) params.append("sort", "false");
    if (displayFor) params.append("for", displayFor);

    const response = await fetchClient.get<IUniverseResponse>(`/universe?${params.toString()}`);

    logger.log("[getUniverseList]", { enabledOnly, sortByOrder, displayFor, params, response });

    return response.data.data;
  } catch (error: unknown) {
    const err = toErrorLike(error);
    const respData = toUnknownRecord(toUnknownRecord(err.response).data) as { message?: string };
    logger.error("유니버스 목록 가져오기 오류:", respData.message || toErrorMessage(error));
    throw error;
  }
};

// 특정 유니버스 상세 정보 가져오기
export const getUniverseDetail = async (universeId: string): Promise<IUniverseDetail | null> => {
  try {
    const response = await fetchClient.get<IUniverseDetailResponse>(`/universe/${universeId}/details`);
    return response.data.data;
  } catch (error: unknown) {
    if (getResponseStatus(error) === 404) {
      return null;
    }
    const err = toErrorLike(error);
    const respData = toUnknownRecord(toUnknownRecord(err.response).data) as { message?: string };
    logger.error(`유니버스 상세 정보 가져오기 오류 (${universeId}):`, respData.message || toErrorMessage(error));
    throw error;
  }
};
