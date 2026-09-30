"use client";

import { useEffect, useState } from "react";
import { fetchRemoteImageAsBasePayload } from "utils/app/imageFile";
import { getImageReferenceName, type SmartstoreGenStudioReferenceImage } from "../manage/smartstoreDraftUtils";

/**
 * preflight가 판정한 참조 번들을 그대로 Gen Studio 첨부 payload로 만든다 (SSM-203).
 *
 * 이 훅이 있는 이유: 판정과 첨부가 서로 다른 출처를 보면, 서버는 "참고 이미지 N장으로 생성 가능"이라고
 * 판정했는데 에디터에는 아무것도 붙지 않는 상태가 만들어진다. 사용자는 통과 배지를 보고 코인을 쓰지만
 * 결과는 참조 없는 생성이다. **판정한 목록과 첨부한 목록을 같은 배열 하나로 고정한다.**
 */

export type SmartstoreVariantReferenceItem = {
  url: string;
  kind: string;
};

export type SmartstoreVariantReferenceImagesType = {
  productImages: SmartstoreGenStudioReferenceImage[];
  /** 모델 kit 참조만. 포즈 프록시는 최소 기준 계산이 달라서 따로 센다. */
  modelImages: SmartstoreGenStudioReferenceImage[];
  /** 포즈 프록시. 에디터에는 모델 이미지와 함께 넘기지만 kit 최소치에는 계상하지 않는다. */
  poseImages: SmartstoreGenStudioReferenceImage[];
  loading: boolean;
  /** 내려받지 못해 첨부되지 않은 장수. 0이 아니면 판정과 첨부가 어긋난 상태다. */
  failedCount: number;
};

type ReferenceCacheType = SmartstoreVariantReferenceImagesType & { signature: string };

const EMPTY_CACHE: ReferenceCacheType = {
  signature: "",
  productImages: [],
  modelImages: [],
  poseImages: [],
  loading: false,
  failedCount: 0,
};

function buildSignature(items: SmartstoreVariantReferenceItem[] | undefined) {
  // 구분자 모호성을 없애기 위해 직렬화로 서명을 만든다. 구분자 방식은 URL 내용에 따라 충돌할 수 있다.
  return JSON.stringify((items || []).map((item) => [item.kind, item.url]));
}

export function useSmartstoreVariantReferenceImages(
  items: SmartstoreVariantReferenceItem[] | undefined,
): SmartstoreVariantReferenceImagesType {
  const [cache, setCache] = useState<ReferenceCacheType>(EMPTY_CACHE);
  // preflight는 조회할 때마다 새 배열을 만든다. 내용 서명으로 비교해야 같은 조합을 다시 내려받지 않는다.
  const signature = buildSignature(items);
  const resolved = cache.signature === signature;

  useEffect(
    function materializeVariantReferences() {
      if (!signature || resolved) return;

      let cancelled = false;
      void (async () => {
        const list = items || [];
        const results = await Promise.allSettled(
          list.map(async (item) => {
            const requestUrl = /^https?:\/\//i.test(item.url)
              ? `/api/proxy/image?url=${encodeURIComponent(item.url)}`
              : item.url;
            const name = getImageReferenceName(item.url);
            const payload = await fetchRemoteImageAsBasePayload(requestUrl, name);
            return {
              kind: item.kind,
              image: {
                mimeType: payload.mimeType,
                data: payload.data,
                preview: payload.preview,
                name,
              } as SmartstoreGenStudioReferenceImage,
            };
          }),
        );
        if (cancelled) return;

        const fulfilled = results
          .filter(
            (result): result is PromiseFulfilledResult<{ kind: string; image: SmartstoreGenStudioReferenceImage }> =>
              result.status === "fulfilled",
          )
          .map((result) => result.value);

        setCache({
          signature,
          productImages: fulfilled.filter((entry) => entry.kind === "product_photo").map((entry) => entry.image),
          modelImages: fulfilled
            .filter((entry) => entry.kind !== "product_photo" && entry.kind !== "pose_proxy")
            .map((entry) => entry.image),
          poseImages: fulfilled.filter((entry) => entry.kind === "pose_proxy").map((entry) => entry.image),
          loading: false,
          failedCount: results.length - fulfilled.length,
        });
      })();

      return () => {
        cancelled = true;
      };
    },
    [signature, resolved, items],
  );

  if (!resolved) {
    // 아직 이 조합을 준비하지 못했다. 이전 조합의 payload를 흘려보내면 다른 참조로 생성된다.
    return { productImages: [], modelImages: [], poseImages: [], loading: Boolean(signature), failedCount: 0 };
  }
  return {
    productImages: cache.productImages,
    modelImages: cache.modelImages,
    poseImages: cache.poseImages,
    loading: false,
    failedCount: cache.failedCount,
  };
}
