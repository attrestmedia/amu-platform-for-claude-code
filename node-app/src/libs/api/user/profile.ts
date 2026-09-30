import type { IProfile } from "types/catalog";
import fetchClient from "libs/api/fetchClient";
import { getResponseStatus, toErrorLike, toErrorMessage, toUnknownRecord } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose 클라이언트 API 호출 래핑
 * @process 요청 구성/호출  응답/에러 정리 반환
 * @domain user
 * @scope client
 */

// ** 프로필 가져오기
export async function getProfile(userId: string): Promise<IProfile | null> {
  try {
    const res = await fetchClient.get<IProfile>(`/user/profile/${encodeURIComponent(userId)}`, {
      cache: "no-store",
    });
    return res.data;
  } catch (e: unknown) {
    if (getResponseStatus(e) === 404) return null;

    const err = toErrorLike(e);
    const data = toUnknownRecord(toUnknownRecord(err.response).data) as { error?: string; message?: string };
    const msg = data?.error || data?.message || toErrorMessage(e, "프로필 데이터를 가져오는 데 실패했습니다.");
    throw new Error(msg);
  }
}
