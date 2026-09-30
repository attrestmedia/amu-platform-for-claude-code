"use client";

import { useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import fetchClient from "libs/api/fetchClient";
import type { DraftFormState } from "./smartstoreDraftUtils";

/**
 * @docHint
 * @purpose 기본 정보 AI 자동완성 — 1단계에서 등록한 상품 이미지를 멀티모달 모델로 분석해
 *          기본 정보 필드(상품명·스마트스토어 상품명·소개·판매가·재고)를 채운다.
 *          Gen Studio 템플릿 시스템이 아니라 필드 자동완성 목적의 경량 흐름이다.
 * @domain commerce.naver
 * @scope client
 */

type SuggestBasicInfoResult = {
  fields?: {
    title?: string;
    channelProductName?: string;
    productName?: string;
    summary?: string;
    price?: number | null;
    stockQuantity?: number | null;
  };
  assetId?: string;
  model?: string;
};

type UseBasicInfoAiAssistArgs = {
  universeId: string;
  draftId: string;
  setDraftForm: (updater: (prev: DraftFormState) => DraftFormState) => void;
  handleDraftMutationError: (error: unknown) => void;
};

export function collectBasicInfoImageUrls(form: DraftFormState) {
  const urls = [
    form.representativeImageUrl,
    ...form.detailImageUrlsText.split("\n"),
  ]
    .map((url) => url.trim())
    .filter((url) => /^https?:\/\//i.test(url));
  return Array.from(new Set(urls)).slice(0, 4);
}

export function useBasicInfoAiAssist({
  universeId,
  draftId,
  setDraftForm,
  handleDraftMutationError,
}: UseBasicInfoAiAssistArgs) {
  const suggestBasicInfoMutation = useMutation({
    mutationFn: async (imageUrls: string[]) => {
      const response = await fetchClient.post<{ data?: { data?: SuggestBasicInfoResult | null } }>(
        `/universe/${universeId}/commerce/drafts/${draftId}/suggest-basic-info`,
        { imageUrls },
      );
      return (response?.data?.data || null) as SuggestBasicInfoResult | null;
    },
    onSuccess: (result) => {
      const fields = result?.fields;
      if (!fields) return;

      // 텍스트 필드는 AI 제안으로 채우고, 판매가·재고는 이미지에서 판단된 값(0 초과)만
      // 비어 있거나 0인 필드에 채운다 — 운영자가 입력한 값이 AI로 덮이지 않게 한다.
      setDraftForm((prev) => {
        const title = String(fields.title || "").trim();
        const channelProductName = String(fields.channelProductName || "").trim();
        const productName = String(fields.productName || "").trim();
        const summary = String(fields.summary || "").trim();
        const price = Number(fields.price);
        const stockQuantity = Number(fields.stockQuantity);
        const nextPrice = Number.isFinite(price) && price > 0 && (!prev.price.trim() || Number(prev.price) === 0) ? String(price) : prev.price;
        const nextStock =
          Number.isFinite(stockQuantity) && stockQuantity > 0 && (!prev.stockQuantity.trim() || Number(prev.stockQuantity) === 0)
            ? String(stockQuantity)
            : prev.stockQuantity;
        return {
          ...prev,
          title: title || prev.title,
          channelProductName: channelProductName || prev.channelProductName,
          productName: productName || prev.productName,
          summary: summary || prev.summary,
          price: nextPrice,
          stockQuantity: nextStock,
        };
      });
    },
    onError: handleDraftMutationError,
  });

  const handleAiAssist = useCallback(
    (form: DraftFormState) => {
      if (!draftId) {
        handleDraftMutationError(new Error("초안을 만든 뒤 사용할 수 있습니다."));
        return;
      }
      const imageUrls = collectBasicInfoImageUrls(form);
      if (imageUrls.length === 0) {
        handleDraftMutationError(new Error("기본 정보를 작성하려면 먼저 상품 이미지를 등록해 주세요."));
        return;
      }
      suggestBasicInfoMutation.mutate(imageUrls);
    },
    [draftId, handleDraftMutationError, suggestBasicInfoMutation],
  );

  return { suggestBasicInfoMutation, handleAiAssist };
}
