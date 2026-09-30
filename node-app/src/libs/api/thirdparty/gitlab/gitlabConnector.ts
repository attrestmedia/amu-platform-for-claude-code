import fetchClient from "libs/api/fetchClient";
import type { GetGitlabCommitsParamsType, GetGitlabCommitsResponseType } from "types/thirdparty";
import { toErrorLike, toErrorMessage, toUnknownRecord } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose 클라이언트 API 호출 래핑
 * @process 엔드포인트(/thirdparty/gitlab/commits) 호출 구성  응답/에러 정리 반환
 * @domain thirdparty/gitlab
 * @scope client
 */

export async function getGitlabCommits(payload: GetGitlabCommitsParamsType): Promise<GetGitlabCommitsResponseType> {
  try {
    const res = await fetchClient.post<{ success?: boolean; message?: string; data?: GetGitlabCommitsResponseType }>(
      "/thirdparty/gitlab/commits",
      payload,
    );
    if (!res.data?.success) {
      throw new Error(res.data?.message || "커밋 조회 실패");
    }
    return res.data.data as GetGitlabCommitsResponseType;
  } catch (e: unknown) {
    const err = toErrorLike(e);
    const respData = toUnknownRecord(toUnknownRecord(err.response).data) as { message?: string; error?: string };
    const msg = respData.message || respData.error || toErrorMessage(e, "커밋 조회 중 오류가 발생했습니다.");
    throw new Error(msg);
  }
}
