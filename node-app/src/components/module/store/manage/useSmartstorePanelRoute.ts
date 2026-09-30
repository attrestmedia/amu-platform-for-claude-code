"use client";

import { useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toSafeString } from "utils/common";

/**
 * @docHint
 * @purpose P6 책임 단위 분할 — manage 패널의 URL ↔ 상태 동기화를 소유한다.
 *          view(list/edit/create)·draftId·studio intent 파라미터 읽기와 목록/편집/create 전환,
 *          선택 draft 상태(selectedDraftId)를 관리한다.
 *          studio intent의 값·의미는 보존되며(설계 제안 D9), destination 재매핑만 소비층에서 한다.
 * @domain commerce.naver
 * @scope client
 */

export type StoreManageView = "list" | "edit" | "create";
export type StudioIntent = "images" | "content";

export function useSmartstorePanelRoute() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const viewParam = (searchParams.get("view") || "list") as StoreManageView;
  const draftIdParam = toSafeString(searchParams.get("draftId"));
  const studioIntentParam = (() => {
    const value = toSafeString(searchParams.get("studio"));
    return value === "images" || value === "content" ? value : "";
  })();

  const [selectedDraftId, setSelectedDraftId] = useState(draftIdParam);

  const navigateToList = useCallback(
    function navigateToList() {
      const next = new URLSearchParams(searchParams.toString());
      next.set("mode", "manage");
      next.set("view", "list");
      next.delete("draftId");
      router.replace(`?${next.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const navigateToView = useCallback(
    function navigateToView(view: StoreManageView, draftId: string, studioIntent?: StudioIntent) {
      if (!draftId) return;
      const next = new URLSearchParams(searchParams.toString());
      next.set("mode", "manage");
      next.set("view", view);
      next.set("draftId", draftId);
      if (studioIntent) next.set("studio", studioIntent);
      else next.delete("studio");
      router.replace(`?${next.toString()}`, { scroll: false });
      setSelectedDraftId(draftId);
    },
    [router, searchParams],
  );

  const navigateToEdit = useCallback(
    (draftId: string, studioIntent?: StudioIntent) => navigateToView("edit", draftId, studioIntent),
    [navigateToView],
  );

  const navigateToCreate = useCallback(
    (draftId: string) => navigateToView("create", draftId),
    [navigateToView],
  );

  /** studio intent는 시트를 연 뒤 지운다 — 오픈 전 재마운트에도 intent가 복구되도록(일회성). */
  const clearStudioIntent = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("studio");
    router.replace(`?${next.toString()}`, { scroll: false });
  }, [router, searchParams]);

  return {
    viewParam,
    draftIdParam,
    studioIntentParam,
    selectedDraftId,
    setSelectedDraftId,
    navigateToList,
    navigateToEdit,
    navigateToCreate,
    clearStudioIntent,
  };
}
