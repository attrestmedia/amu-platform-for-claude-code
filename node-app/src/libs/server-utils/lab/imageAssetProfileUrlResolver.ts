import "server-only";

import { getImageAssetByAssetId, getImageAssetByStorageUrl } from "libs/database/lab";
import { getPrivateAssetBaseUrl } from "libs/server-utils/lab/imageAssetDisplay";

/**
 * @docHint
 * @purpose 페르소나 profile 이미지 URL을 저장된 Gen-Studio 이미지 자산으로 역조회하는 공통 유틸
 * @process storage.url 정확 일치 -> private Worker URL에서 assetId 파싱 -> assetId 조회
 * @domain lab
 * @scope server
 */

/** {PRIVATE_ASSET_BASE_URL}/images/{assetId}[?v=...] 에서 assetId를 추출한다. */
export function extractAssetIdFromPrivateWorkerUrl(url: string): string | null {
  const base = getPrivateAssetBaseUrl();
  if (!base) return null;

  const prefix = `${base}/images/`;
  const clean = String(url || "").trim();
  if (!clean.startsWith(prefix)) return null;

  const rest = clean.slice(prefix.length);
  const segment = rest.split(/[?/]/)[0];
  if (!segment) return null;

  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** 쿼리스트링을 제거한 형태. 저장값과 표시 URL의 표기가 어긋날 때만 사용한다. */
function stripProfileImageQuery(url: string) {
  const index = url.indexOf("?");
  return index >= 0 ? url.slice(0, index) : url;
}

/**
 * 페르소나 profile URL 문자열을 저장된 Gen-Studio 이미지 자산으로 역조회한다.
 *
 * 1) storage.url 정확 일치 (쿼리스트링 제거 1회 보정)
 * 2) private Worker URL에서 assetId 파싱 -> getImageAssetByAssetId
 *
 * public/private 전환으로 URL 형태가 섞여 있어도 assetId를 정본으로 삼는다.
 */
export async function resolveImageAssetByProfileUrl(url: string) {
  const direct = await getImageAssetByStorageUrl(url);
  if (direct) return direct;

  const stripped = stripProfileImageQuery(url);
  if (stripped !== url) {
    const strippedMatch = await getImageAssetByStorageUrl(stripped);
    if (strippedMatch) return strippedMatch;
  }

  const assetId = extractAssetIdFromPrivateWorkerUrl(url);
  if (assetId) {
    return await getImageAssetByAssetId(assetId);
  }

  return null;
}
