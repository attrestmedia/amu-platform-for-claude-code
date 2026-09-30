import "server-only";
import { toUnknownRecord, type UnknownRecord } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose 서버 유틸/핸들러 핵심 처리
 * @process pickChannelProduct 중심 처리  입력 검증  핵심 로직  결과 포맷팅  이미지 파이프라인 호출 포함
 * @domain thirdparty
 * @scope shared
 */

type AnyJson = UnknownRecord;

export function pickChannelProduct(x: AnyJson): AnyJson | null {
  if (!x || typeof x !== "object") return null;

  // 평탄 이미 channelProductNo가 있으면 그대로 사용
  if (x.channelProductNo && !x.smartstoreChannelProduct) return x;

  // 흔한 중첩 형태들
  if (x.smartstoreChannelProduct) {
    const smartstoreChannelProduct = toUnknownRecord(x.smartstoreChannelProduct);
    const originProduct = toUnknownRecord(x.originProduct);
    return {
      ...smartstoreChannelProduct,
      channelProductNo: x.channelProductNo,
      originProductNo: x.originProductNo || originProduct.originProductNo,
    };
  }
  if (Array.isArray(x.channelProducts) && x.channelProducts.length) return toUnknownRecord(x.channelProducts[0]);
  if (x.channelProduct) return toUnknownRecord(x.channelProduct);
  if (x.channelProductSummary) return toUnknownRecord(x.channelProductSummary);
  if (x.channelProductInfo) return toUnknownRecord(x.channelProductInfo);

  // originProduct 밑에만 있는 케이스
  const originProduct = toUnknownRecord(x.originProduct);
  if (Array.isArray(originProduct.channelProducts) && originProduct.channelProducts.length) {
    return toUnknownRecord(originProduct.channelProducts[0]);
  }
  return null;
}

export function toMainImage(cp: AnyJson): string {
  if (!cp) return "";

  if (cp.images && !Array.isArray(cp.images)) {
    const images = toUnknownRecord(cp.images);
    const representative = images.representativeImage;
    if (representative) {
      if (typeof representative === "string") return representative;
      const representativeRecord = toUnknownRecord(representative);
      const fromObj = representativeRecord.url || representativeRecord.imageUrl;
      if (fromObj) return String(fromObj);
    }
  }

  // v1: images[] (type === "REPRESENT") 또는 첫 번째
  if (Array.isArray(cp?.images) && cp.images.length) {
    const rep = cp.images.find((i: AnyJson) => i?.type === "REPRESENT") ?? cp.images[0];
    const fromRep = (rep && (rep.url || rep.imageUrl)) || (typeof rep === "string" ? rep : "");
    if (fromRep) return String(fromRep);
  }

  // v1 대안: imageUrls: string[]
  if (Array.isArray(cp?.imageUrls) && cp.imageUrls[0]) {
    return String(cp.imageUrls[0]);
  }

  // v2(channel-products): representativeImage 객체 형태 지원
  const r = cp?.representativeImage || cp?.mainImage || cp?.image;
  if (r) {
    if (typeof r === "string") return r;
    const image = toUnknownRecord(r);
    const fromObj = image.url || image.imageUrl || image.fullImageUrl || image.mobileImageUrl || image.thumbnailUrl;
    if (fromObj) return String(fromObj);
  }

  return "";
}
