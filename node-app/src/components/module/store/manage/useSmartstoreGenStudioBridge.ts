"use client";

import { useCallback, useEffect, useState } from "react";
import { dialog } from "@amu-labs/ui";
import { lang } from "components/module/i18n";
import { fetchRemoteImageAsBasePayload } from "utils/app/imageFile";
import type { ICharacterReferenceKit } from "types/character";
import {
  getModelReferenceKitImageUrls,
  getImageReferenceName,
  type SmartstoreGenStudioReferenceImage,
} from "./smartstoreDraftUtils";

/**
 * @docHint
 * @purpose P6 책임 단위 분할 — Store와 Gen Studio 사이의 브릿지를 소유한다.
 *          Gen Studio 접근 게이트(ensureGenStudioAccess), 이미지 스튜디오 시트 상태,
 *          참고 이미지(상품 사진·전용 모델) base payload 준비, 생성물 세션 한정(시트 오픈 시각)을 담당한다.
 *          실제 생성 UI는 Gen Studio 시트(ImageStudioEditor 등)에 위임되며 Store가 재구현하지 않는다.
 * @domain commerce.naver
 * @scope client
 */

type UseSmartstoreGenStudioBridgeArgs = {
  generationReadyModelReferenceKits: ICharacterReferenceKit[];
  hasAuthHydrated: boolean;
  isGenStudioLoggedIn: boolean;
};

export function useSmartstoreGenStudioBridge({
  generationReadyModelReferenceKits,
  hasAuthHydrated,
  isGenStudioLoggedIn,
}: UseSmartstoreGenStudioBridgeArgs) {
  const [imageStudioSheetOpen, setImageStudioSheetOpen] = useState(false);
  const [imageStudioSourceUrl, setImageStudioSourceUrl] = useState("");
  const [imageStudioReferenceImages, setImageStudioReferenceImages] = useState<SmartstoreGenStudioReferenceImage[]>([]);
  const [imageStudioModelImages, setImageStudioModelImages] = useState<SmartstoreGenStudioReferenceImage[]>([]);
  const [imageStudioReferenceLoading, setImageStudioReferenceLoading] = useState(false);
  const [imageStudioModelReferenceLoading, setImageStudioModelReferenceLoading] = useState(false);

  const ensureGenStudioAccess = useCallback(() => {
    if (!hasAuthHydrated) {
      void dialog.alert(
        lang({
          ko: "로그인 상태를 확인하는 중입니다. 잠시 후 다시 시도해 주세요.",
          en: "Checking your sign-in state. Please try again shortly.",
        }),
      );
      return false;
    }

    if (!isGenStudioLoggedIn) {
      void dialog.alert(
        lang({ ko: "Gen Studio는 로그인 후 이용할 수 있습니다.", en: "Please log in to use Gen Studio." }),
      );
      return false;
    }

    return true;
  }, [hasAuthHydrated, isGenStudioLoggedIn]);

  const openImageStudioForDetailImage = useCallback(
    (imageUrl: string) => {
      const trimmed = String(imageUrl ?? "").trim();
      if (!trimmed) return;
      if (!ensureGenStudioAccess()) return;

      setImageStudioSourceUrl(trimmed);
      setImageStudioReferenceImages([]);
      setImageStudioModelImages([]);
      setImageStudioReferenceLoading(true);
      setImageStudioModelReferenceLoading(true);
      setImageStudioSheetOpen(true);

      void (async () => {
        try {
          const requestUrl = /^https?:\/\//i.test(trimmed)
            ? `/api/proxy/image?url=${encodeURIComponent(trimmed)}`
            : trimmed;
          const payload = await fetchRemoteImageAsBasePayload(requestUrl, getImageReferenceName(trimmed));
          setImageStudioReferenceImages([
            {
              mimeType: payload.mimeType,
              data: payload.data,
              preview: payload.preview,
              name: getImageReferenceName(trimmed),
            },
          ]);
        } catch {
          setImageStudioReferenceImages([]);
        } finally {
          setImageStudioReferenceLoading(false);
        }
      })();
    },
    [ensureGenStudioAccess],
  );

  const openImageStudioForNewImage = useCallback(() => {
    if (!ensureGenStudioAccess()) return;

    setImageStudioSourceUrl("");
    setImageStudioReferenceImages([]);
    setImageStudioModelImages([]);
    setImageStudioReferenceLoading(false);
    setImageStudioModelReferenceLoading(true);
    setImageStudioSheetOpen(true);
  }, [ensureGenStudioAccess]);

  const prepareSelectedModelReferenceImages = useCallback(async () => {
    if (!imageStudioSheetOpen) return;
    const urls = generationReadyModelReferenceKits.flatMap(getModelReferenceKitImageUrls).slice(0, 5);
    if (urls.length === 0) {
      setImageStudioModelImages([]);
      setImageStudioModelReferenceLoading(false);
      return;
    }

    setImageStudioModelReferenceLoading(true);
    try {
      const payloads = await Promise.allSettled(
        urls.map(async (url) => {
          const requestUrl = /^https?:\/\//i.test(url) ? `/api/proxy/image?url=${encodeURIComponent(url)}` : url;
          const payload = await fetchRemoteImageAsBasePayload(requestUrl, getImageReferenceName(url));
          return {
            mimeType: payload.mimeType,
            data: payload.data,
            preview: payload.preview,
            name: getImageReferenceName(url),
          };
        }),
      );
      setImageStudioModelImages(
        payloads
          .filter(
            (result): result is PromiseFulfilledResult<SmartstoreGenStudioReferenceImage> =>
              result.status === "fulfilled",
          )
          .map((result) => result.value),
      );
    } finally {
      setImageStudioModelReferenceLoading(false);
    }
  }, [imageStudioSheetOpen, generationReadyModelReferenceKits]);

  useEffect(() => {
    if (!imageStudioSheetOpen) return;
    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      if (!cancelled) void prepareSelectedModelReferenceImages();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [imageStudioSheetOpen, prepareSelectedModelReferenceImages]);

  return {
    ensureGenStudioAccess,
    imageStudioSheetOpen,
    setImageStudioSheetOpen,
    imageStudioSourceUrl,
    imageStudioReferenceImages,
    imageStudioModelImages,
    imageStudioReferenceLoading,
    imageStudioModelReferenceLoading,
    openImageStudioForDetailImage,
    openImageStudioForNewImage,
  };
}

