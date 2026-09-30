"use client";

import { useCallback, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import fetchClient from "libs/api/fetchClient";
import { getCommerceDraftRevision } from "./smartstoreDraftUtils";
import type { ICommerceDraftPublishPreview, ICommerceProductDraft } from "types/commerce";

/**
 * @docHint
 * @purpose P6 책임 단위 분할 — readiness·publish-preview·publish mutation과
 *          등록 점검 Review Sheet 상태(반영의 단일 관문, 설계 제안 §6)를 소유한다.
 *          preview는 검토 시점 revision에 결합되며, draft revision이 바뀌면 무효화된다.
 *          dirty 상태에서 반영을 누르면 먼저 draft PATCH로 최신 revision을 확보한다 —
 *          저장 실패·conflict 시 Review Sheet를 열지 않는다(§6.1 계약).
 * @domain commerce.naver
 * @scope client
 */

export type PublishPreviewResponse = {
  mode: string;
  categoryPolicyGroup?: string;
  validation: ICommerceProductDraft["validation"];
  preview: ICommerceDraftPublishPreview;
};

export type DraftReviewChecklistItem = {
  key: "factualConfirmed" | "representativeImageConfirmed" | "aiDisclosureChecked";
  label: { ko: string; en: string };
  checked: boolean;
};

type UseCommerceDraftPublishArgs = {
  universeId: string;
  draftId: string;
  selectedDraftQuery: { data?: ICommerceProductDraft | null };
  saveDraftSnapshot: () => Promise<ICommerceProductDraft | null>;
  handleDraftMutationError: (error: unknown) => void;
  /** 성공 시 오류 밴드를 지운다 — 패널의 setDraftActionError(null) */
  onActionSuccess: () => void;
  setPreviewData: (data: PublishPreviewResponse | null) => void;
  checklistFlags: {
    factualConfirmed: boolean;
    representativeImageConfirmed: boolean;
    aiDisclosureChecked: boolean;
  };
  onChecklistChange: (key: DraftReviewChecklistItem["key"], checked: boolean) => void;
};

export function useCommerceDraftPublish({
  universeId,
  draftId,
  selectedDraftQuery,
  saveDraftSnapshot,
  handleDraftMutationError,
  onActionSuccess,
  setPreviewData,
  checklistFlags,
  onChecklistChange,
}: UseCommerceDraftPublishArgs) {
  const queryClient = useQueryClient();
  const [reviewSheetOpen, setReviewSheetOpen] = useState(false);
  const [reviewPreparing, setReviewPreparing] = useState(false);
  const [reviewRevision, setReviewRevision] = useState<number | null>(null);

  const readinessMutation = useMutation({
    mutationFn: async () => {
      const saved = await saveDraftSnapshot();
      if (!saved) return null;
      const response = await fetchClient.post<{ data?: { draft?: ICommerceProductDraft | null } }>(
        `/universe/${universeId}/commerce/drafts/${saved.draftId}/readiness`,
        {
          mode: saved.smartstore?.channelProductNo || saved.smartstore?.originProductNo ? "update" : "create",
          categoryPolicyGroup: String(saved.smartstore?.categoryPolicyGroup ?? ""),
          expectedRevision: getCommerceDraftRevision(saved),
        },
      );
      return (response?.data?.data || null) as { draft?: ICommerceProductDraft | null } | null;
    },
    onSuccess: async (result) => {
      onActionSuccess();
      if (result?.draft) queryClient.setQueryData(["commerce-draft-detail", universeId, draftId], result.draft);
      await queryClient.invalidateQueries({ queryKey: ["commerce-draft-detail", universeId, draftId] });
    },
    onError: handleDraftMutationError,
  });

  const previewMutation = useMutation({
    mutationFn: async () => {
      const saved = await saveDraftSnapshot();
      if (!saved) return null;
      const response = await fetchClient.post<{ data?: PublishPreviewResponse }>(
        `/universe/${universeId}/commerce/drafts/${saved.draftId}/publish-preview`,
        {
          mode: saved.smartstore?.channelProductNo || saved.smartstore?.originProductNo ? "update" : "create",
          categoryPolicyGroup: String(saved.smartstore?.categoryPolicyGroup ?? ""),
          expectedRevision: getCommerceDraftRevision(saved),
        },
      );
      return (response?.data?.data || null) as PublishPreviewResponse | null;
    },
    onSuccess: (data) => {
      onActionSuccess();
      setPreviewData(data);
    },
    onError: handleDraftMutationError,
  });

  const publishMutation = useMutation({
    mutationFn: async () => {
      const saved = await saveDraftSnapshot();
      if (!saved) return null;
      const response = await fetchClient.post<{ data?: unknown }>(
        `/universe/${universeId}/commerce/drafts/${saved.draftId}/publish`,
        {
          mode: saved.smartstore?.channelProductNo || saved.smartstore?.originProductNo ? "update" : "create",
          categoryPolicyGroup: String(saved.smartstore?.categoryPolicyGroup ?? ""),
          expectedRevision: getCommerceDraftRevision(saved),
        },
      );
      return response?.data?.data ?? null;
    },
    onSuccess: () => onActionSuccess(),
    onError: handleDraftMutationError,
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["commerce-drafts", universeId] }),
        queryClient.invalidateQueries({ queryKey: ["commerce-draft-detail", universeId, draftId] }),
        queryClient.invalidateQueries({ queryKey: ["commerce-draft-publish-jobs", universeId, draftId] }),
      ]);
    },
  });

  const reviewChecklist: DraftReviewChecklistItem[] = [
    {
      key: "factualConfirmed",
      label: {
        ko: "브랜드·제조사·원산지·구성 등 상품 정보의 사실값을 확인했습니다.",
        en: "I confirmed the factual values (brand, manufacturer, origin, composition).",
      },
      checked: checklistFlags.factualConfirmed,
    },
    {
      key: "representativeImageConfirmed",
      label: {
        ko: "대표 이미지를 확인했습니다.",
        en: "I confirmed the representative image.",
      },
      checked: checklistFlags.representativeImageConfirmed,
    },
    {
      key: "aiDisclosureChecked",
      label: {
        ko: "AI 생성 이미지의 고지 상태를 확인했습니다.",
        en: "I confirmed the AI image disclosure status.",
      },
      checked: checklistFlags.aiDisclosureChecked,
    },
  ];
  const handleChecklistChange = useCallback(
    (key: DraftReviewChecklistItem["key"], checked: boolean) => {
      onChecklistChange(key, checked);
    },
    [onChecklistChange],
  );

  const openReviewSheet = useCallback(async () => {
    if (!draftId) return;
    setReviewPreparing(true);
    setPreviewData(null);
    setReviewRevision(null);
    try {
      await readinessMutation.mutateAsync();
      const preview = await previewMutation.mutateAsync();
      if (!preview) return;
      const current = selectedDraftQuery.data;
      if (!current) return;
      setPreviewData(preview);
      setReviewRevision(getCommerceDraftRevision(current));
      setReviewSheetOpen(true);
    } catch {
      // 저장 실패·revision conflict는 handleDraftMutationError가 오류 밴드로 표시한다 — 시트를 열지 않는다.
    } finally {
      setReviewPreparing(false);
    }
  }, [draftId, previewMutation, readinessMutation, selectedDraftQuery.data, setPreviewData]);

  const handleReviewPublish = useCallback(() => {
    // publish는 preview가 검토한 revision 기준으로만 실행한다 — 바뀌었으면 시트가 invalid 상태를 표시한다.
    const current = selectedDraftQuery.data;
    if (current && reviewRevision !== null && getCommerceDraftRevision(current) !== reviewRevision) return;
    setReviewSheetOpen(false);
    publishMutation.mutate();
  }, [publishMutation, reviewRevision, selectedDraftQuery.data]);

  // preview 결합 revision과 현재 revision이 어긋나면 검토를 무효로 표시한다.
  const reviewInvalid = useMemo(() => {
    if (!reviewSheetOpen || reviewRevision === null || !selectedDraftQuery.data) return false;
    return getCommerceDraftRevision(selectedDraftQuery.data) !== reviewRevision;
  }, [reviewRevision, reviewSheetOpen, selectedDraftQuery.data]);

  return {
    readinessMutation,
    previewMutation,
    publishMutation,
    reviewSheetOpen,
    setReviewSheetOpen,
    reviewPreparing,
    reviewRevision,
    reviewInvalid,
    openReviewSheet,
    handleReviewPublish,
    reviewChecklist,
    handleChecklistChange,
  };
}
