import fetchClient from "../fetchClient";

/**
 * @docHint
 * @purpose 클라이언트 API 호출 래핑
 * @process 요청 구성/호출  응답/에러 정리 반환
 * @domain payment
 * @scope client
 */

// 유니버스 membership/charged 코인을 가져오기
export async function fetchUniverseWallet(universeId: string) {
  const res = await fetchClient.get(`/admin/${universeId}/wallet`);
  return res.data;
}
