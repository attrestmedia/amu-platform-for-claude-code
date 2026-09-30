import type { IGetDocumentsData, IGetDocumentsResponse } from "types/data";
import fetchClient from "libs/api/fetchClient";
import { toErrorLike, toUnknownRecord } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose 클라이언트 API 호출 래핑
 * @process 엔드포인트(/get-documents-data) 호출 구성  응답/에러 정리 반환
 * @domain common
 * @scope client
 */

// 에러 처리 함수
export const handleError = (error: unknown, defaultMessage: string): never => {
  const err = toErrorLike(error);
  const response = toUnknownRecord(err.response);
  if (response && Object.keys(response).length > 0) {
    const status = response.status as number | undefined;
    const errorData = toUnknownRecord(response.data) as { error?: string };

    // 상태 코드에 따라 에러 메시지 설정
    let message = defaultMessage;
    if (status === 404) {
      message = "요청한 리소스를 찾을 수 없습니다.";
    } else if (errorData && errorData.error) {
      message = errorData.error;
    }

    throw new Error(message);
  } else {
    throw new Error("네트워크 오류가 발생했습니다.");
  }
};

// mongodb에서 데이터 가져오기
export const getDocumentsData = async (params: IGetDocumentsData): Promise<IGetDocumentsResponse> => {
  // filter 프로퍼티가 있을 경우 JSON 문자열로 변환하여 쿼리스트링에 포함
  const queryParams = {
    ...params,
    filter: params.filter ? JSON.stringify(params.filter) : undefined,
  };

  // /get-documents-data 엔드포인트 호출
  const response = await fetchClient.get<IGetDocumentsResponse>("/get-documents-data", {
    params: queryParams,
  });
  return response.data;
};
