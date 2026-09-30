"use client";

import { useCallback, type RefObject } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import fetchClient from "libs/api/fetchClient";
import type { SmartstoreDetailEditorHandle } from "../SmartstoreDetailEditor";
import type { ICommerceProductDraft } from "types/commerce";
import type { ContentStudioApplyContentArgsType } from "types/app";
import {
  buildSmartstoreDetailImageHtml,
  markdownToSmartstoreHtmlWithImages,
  sanitizeSmartstoreDetailHtml,
} from "utils/commerce/smartstoreDetailHtmlUtils";
import {
  appendDetailImageUrlText,
  removeDetailImageUrlText,
  type DraftFormState,
  type SmartstoreImageRailItem,
} from "./smartstoreDraftUtils";

/**
 * @docHint
 * @purpose P6 책임 단위 분할 — draft 자산(이미지) 변경을 소유한다.
 *          업로드, apply-asset 승인(대표/추가), rail 카드 액션(대표·추가·제거·본문 삽입)을 제공하며,
 *          폼 상태(draftForm)는 패널 소유로 유지해 편집 셸과 create shell이 공유한다.
 *          본문 삽입은 에디터 ref에 위임하고 실패 시 폼 patch로 폴백한다(SSM-104).
 * @domain commerce.naver
 * @scope client
 */

type UseCommerceDraftAssetsArgs = {
  universeId: string;
  draftId: string;
  setDraftForm: (updater: (prev: DraftFormState) => DraftFormState) => void;
  handleDraftMutationError: (error: unknown) => void;
  openImageStudioForDetailImage: (imageUrl: string) => void;
  jumpToSection: (section: "product" | "required" | "images") => void;
  smartstoreDetailEditorRef: RefObject<SmartstoreDetailEditorHandle | null>;
};

function referenceImageToFile(image: NonNullable<ContentStudioApplyContentArgsType["referenceImages"]>[number], index: number) {
  const rawData = String(image?.data || "").trim();
  if (!rawData || typeof atob !== "function" || typeof File === "undefined") return null;

  try {
    const base64 = rawData.includes(",") ? rawData.slice(rawData.indexOf(",") + 1) : rawData;
    const binary = atob(base64.replace(/\s/g, ""));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const fallbackName = `gen-studio-reference-${index + 1}.${String(image.mimeType || "image/png").split("/")[1] || "png"}`;
    const name = String(image.name || fallbackName).replace(/[\\/:*?"<>|]+/g, "_").trim() || fallbackName;
    return new File([bytes], name, { type: String(image.mimeType || "image/png") });
  } catch {
    return null;
  }
}

export function useCommerceDraftAssets({
  universeId,
  draftId,
  setDraftForm,
  handleDraftMutationError,
  openImageStudioForDetailImage,
  jumpToSection,
  smartstoreDetailEditorRef,
}: UseCommerceDraftAssetsArgs) {
  const queryClient = useQueryClient();
  const uploadDraftImageMutation = useMutation({
    mutationFn: async (params: {
      file: File;
      target: "representative" | "detail";
      editAfter?: boolean;
      syncDraftForm?: boolean;
    }) => {
      const formData = new FormData();
      formData.append("file", params.file);
      formData.append("kind", "commerce-draft");
      formData.append("pid", draftId || "draft_new");
      const response = await fetchClient.post<{ data?: { url?: string } }>(
        `/universe/${universeId}/upload`,
        formData,
      );
      return {
        target: params.target,
        editAfter: Boolean(params.editAfter),
        syncDraftForm: params.syncDraftForm !== false,
        upload: (response?.data?.data || null) as { url?: string } | null,
      };
    },
    onSuccess: (data) => {
      const url = String(data?.upload?.url ?? "");
      if (!url || data?.syncDraftForm === false) return;

      if (data?.target === "representative") {
        setDraftForm((prev) => ({ ...prev, representativeImageUrl: url }));
      } else {
        setDraftForm((prev) => {
          const current = prev.detailImageUrlsText
            .split("\n")
            .map((item) => item.trim())
            .filter(Boolean);
          return {
            ...prev,
            detailImageUrlsText: Array.from(new Set([...current, url])).join("\n"),
          };
        });
      }

      if (data?.editAfter) {
        openImageStudioForDetailImage(url);
      }
    },
  });

  const applyAssetMutation = useMutation({
    mutationFn: async (params: {
      assetType: "content" | "image";
      assetId: string;
      targetField: string;
      referenceImageUrls?: string[];
    }) => {
      if (!draftId) return null;
      const response = await fetchClient.post<{ data?: { draft?: ICommerceProductDraft } }>(
        `/universe/${universeId}/commerce/drafts/${draftId}/apply-asset`,
        params,
      );
      return (response?.data?.data?.draft || null) as ICommerceProductDraft | null;
    },
    onSuccess: async () => {
      // apply-asset 결과는 서버가 draft에 반영한다 — detail query 무효화로 hydrate 흐름을 태운다.
      await queryClient.invalidateQueries({ queryKey: ["commerce-drafts", universeId] });
      await queryClient.invalidateQueries({ queryKey: ["commerce-draft-detail", universeId, draftId] });
    },
    onError: handleDraftMutationError,
  });

  const applyContentAssetToDetail = useCallback(
    async (args: ContentStudioApplyContentArgsType) => {
      if (!draftId || !args.assetId || !args.text.trim()) return false;

      const referenceImages = (args.referenceImages || []).slice(0, 4);
      const uploadedUrls: string[] = [];
      for (const [index, image] of referenceImages.entries()) {
        const file = referenceImageToFile(image, index);
        if (!file) {
          handleDraftMutationError(new Error("Gen Studio 참고 이미지를 읽을 수 없습니다."));
          return false;
        }

        try {
          const uploadResult = await uploadDraftImageMutation.mutateAsync({ file, target: "detail", syncDraftForm: false });
          const url = String(uploadResult?.upload?.url || "").trim();
          if (!url) throw new Error("Gen Studio 참고 이미지 업로드 응답이 없습니다.");
          uploadedUrls.push(url);
        } catch (error) {
          handleDraftMutationError(error);
          return false;
        }
      }

      let applied = false;
      try {
        await applyAssetMutation.mutateAsync({
          assetType: "content",
          assetId: args.assetId,
          targetField: "detailHtml",
          referenceImageUrls: uploadedUrls,
        });
        applied = true;
      } catch {
        // applyAssetMutation의 onError가 사용자에게 API 오류를 표시한다.
        return false;
      }

      if (!applied) return false;
      const detailHtml = markdownToSmartstoreHtmlWithImages(args.text, uploadedUrls);
      setDraftForm((prev) => ({
        ...prev,
        detailHtml,
        detailImageUrlsText: uploadedUrls.reduce(
          (value, url) => appendDetailImageUrlText(value, url),
          prev.detailImageUrlsText,
        ),
      }));
      jumpToSection("product");
      requestAnimationFrame(() => smartstoreDetailEditorRef.current?.focus());
      return true;
    },
    [applyAssetMutation, draftId, handleDraftMutationError, jumpToSection, setDraftForm, smartstoreDetailEditorRef, uploadDraftImageMutation],
  );

  // 레일은 서버 draft이 아니라 draftForm에서 만들어진다. draftForm은 draftId당 1회만 hydrate되므로
  // apply-asset 성공만으로는 화면이 갱신되지 않는다 — 폼을 즉시 정렬해 대표 승격을 반영한다.
  // (기존 대표는 서버 apply-asset과 같은 규칙으로 추가 목록 선두로 강등, 클릭 대상은 추가 목록에서 제거)
  const promoteImageItemToRepresentative = useCallback(
    (item: SmartstoreImageRailItem) => {
      setDraftForm((prev) => {
        const url = item.url.trim();
        if (!url) return prev;
        const previousRepresentative = prev.representativeImageUrl.trim();
        const details = prev.detailImageUrlsText
          .split("\n")
          .map((row) => row.trim())
          .filter(Boolean);
        const nextDetails = details.filter((row) => row !== url);
        if (previousRepresentative && previousRepresentative !== url && !nextDetails.includes(previousRepresentative)) {
          nextDetails.unshift(previousRepresentative);
        }
        return {
          ...prev,
          representativeImageUrl: url,
          detailImageUrlsText: nextDetails.join("\n"),
        };
      });
    },
    [setDraftForm],
  );

  const setRepresentativeFromImageItem = useCallback(
    (item: SmartstoreImageRailItem) => {
      if (item.assetId) {
        // 서버 반영(asset lineage·images 배열 재구성)은 apply-asset이 담당한다. 실패 시 에러 배너로 안내되고,
        // 폼이 단일 출처이므로 저장 시점에 폼 상태가 최종 반영된다.
        applyAssetMutation.mutate({
          assetType: "image",
          assetId: item.assetId,
          targetField: "representative",
        });
      }
      promoteImageItemToRepresentative(item);
    },
    [applyAssetMutation, promoteImageItemToRepresentative],
  );

  const addDetailFromImageItem = useCallback(
    (item: SmartstoreImageRailItem) => {
      if (item.assetId) {
        applyAssetMutation.mutate({
          assetType: "image",
          assetId: item.assetId,
          targetField: "detail",
        });
      }
      setDraftForm((prev) => ({
        ...prev,
        detailImageUrlsText: appendDetailImageUrlText(prev.detailImageUrlsText, item.url),
      }));
    },
    [applyAssetMutation, setDraftForm],
  );

  const removeDetailFromImageItem = useCallback(
    (item: SmartstoreImageRailItem) => {
      setDraftForm((prev) => ({
        ...prev,
        detailImageUrlsText: removeDetailImageUrlText(prev.detailImageUrlsText, item.url),
      }));
    },
    [setDraftForm],
  );

  const uploadDetailBodyImage = useCallback(
    async (file: File) => {
      const data = await uploadDraftImageMutation.mutateAsync({ file, target: "detail" });
      return String(data?.upload?.url ?? "");
    },
    [uploadDraftImageMutation],
  );

  const insertImageItemToDetailBody = useCallback(
    (item: SmartstoreImageRailItem) => {
      const imageHtml = buildSmartstoreDetailImageHtml(item.url);
      if (!imageHtml) return;
      // 본문 삽입은 의도적 재삽입을 허용한다 — URL·assetId 중복 제거를 하지 않는다 (SSM-104)
      const inserted = Boolean(smartstoreDetailEditorRef.current?.insertImageUrl(item.url));
      if (!inserted) {
        setDraftForm((prev) => ({
          ...prev,
          detailHtml: sanitizeSmartstoreDetailHtml([prev.detailHtml, imageHtml].filter(Boolean).join("")),
        }));
      }
      // 삽입 후 상품 정보 탭(상세 설명 섹션)으로 복귀해 편집기 스크롤·포커스를 되찾는다 (SSM-104)
      jumpToSection("product");
      requestAnimationFrame(() => {
        smartstoreDetailEditorRef.current?.focus();
      });
    },
    [jumpToSection, setDraftForm, smartstoreDetailEditorRef],
  );

  return {
    uploadDraftImageMutation,
    applyAssetMutation,
    applyContentAssetToDetail,
    setRepresentativeFromImageItem,
    addDetailFromImageItem,
    removeDetailFromImageItem,
    uploadDetailBodyImage,
    insertImageItemToDetailBody,
  };
}
