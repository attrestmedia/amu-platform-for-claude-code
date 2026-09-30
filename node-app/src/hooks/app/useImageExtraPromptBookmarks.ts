"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  addImageExtraPromptBookmark,
  clearImageExtraPromptBookmarks,
  listImageExtraPromptBookmarks,
  removeImageExtraPromptBookmark,
} from "libs/api/lab";
import { lang } from "components/module/i18n";
import { logger } from "utils/log";
import { dialog } from "@amu-labs/ui";
import type { ImageExtraPromptBookmarkType } from "types/app";

type UseImageExtraPromptBookmarksArgs = {
  isLoggedIn: boolean;
  templateKey?: string;
  onRequireLogin?: () => void;
  onLogout?: () => void;
};

function normalizeExtraPromptKey(templateKey: string, text: string) {
  return `${String(templateKey || "").trim()}\n${String(text || "").replace(/\s+/g, " ").trim()}`;
}

// 로그아웃 상태에서 노출하는 안정 참조. 매 렌더마다 새 객체를 만들면 하위 useMemo 캐시 무효화됨.
const EMPTY_ITEMS: ImageExtraPromptBookmarkType[] = [];
const EMPTY_PENDING_REMOVE_IDS: Record<string, boolean> = {};

export function useImageExtraPromptBookmarks({
  isLoggedIn,
  templateKey,
  onRequireLogin,
  onLogout,
}: UseImageExtraPromptBookmarksArgs) {
  const [rawItems, setItems] = useState<ImageExtraPromptBookmarkType[]>([]);
  const [rawPendingSaveKey, setPendingSaveKey] = useState("");
  const [rawPendingRemoveIds, setPendingRemoveIds] = useState<Record<string, boolean>>({});
  const [isClearing, setIsClearing] = useState(false);
  const [prevIsLoggedIn, setPrevIsLoggedIn] = useState(isLoggedIn);

  if (prevIsLoggedIn !== isLoggedIn) {
    setPrevIsLoggedIn(isLoggedIn);
    if (!isLoggedIn) {
      setItems([]);
      setPendingSaveKey("");
      setPendingRemoveIds({});
      setIsClearing(false);
    }
  }

  // 로그아웃 상태에서는 노출 값만 비워서 effect 내부의 동기 setState를 제거.
  // 다음 로그인 시 effect가 재실행되며 rawItems가 새로 적재되므로 잔존 데이터 노출은 없음.
  const items = isLoggedIn ? rawItems : EMPTY_ITEMS;
  const pendingSaveKey = isLoggedIn ? rawPendingSaveKey : "";
  const pendingRemoveIds = isLoggedIn ? rawPendingRemoveIds : EMPTY_PENDING_REMOVE_IDS;

  const loadItems = useCallback(async () => {
    if (!isLoggedIn) {
      onLogout?.();
      return;
    }

    try {
      const nextItems = await listImageExtraPromptBookmarks(templateKey ? { templateKey } : undefined);
      setItems(Array.isArray(nextItems) ? nextItems : []);
    } catch (error) {
      logger.warn("[useImageExtraPromptBookmarks] extraPrompt 저장함 로드 실패", error);
    }
  }, [isLoggedIn, onLogout, templateKey]);

  useEffect(() => {
    let cancelled = false;

    if (!isLoggedIn) {
      onLogout?.();
      return;
    }

    listImageExtraPromptBookmarks(templateKey ? { templateKey } : undefined)
      .then((nextItems) => {
        if (!cancelled) setItems(Array.isArray(nextItems) ? nextItems : []);
      })
      .catch((error) => {
        logger.warn("[useImageExtraPromptBookmarks] extraPrompt 저장함 로드 실패", error);
      });

    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, onLogout, templateKey]);

  const itemsByTemplate = useMemo(() => {
    return items.reduce<Record<string, ImageExtraPromptBookmarkType[]>>((acc, item) => {
      const key = String(item.templateKey || "").trim();
      if (!key) return acc;
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});
  }, [items]);

  const promptKeyMap = useMemo(() => {
    return new Map(items.map((item) => [normalizeExtraPromptKey(item.templateKey, item.text), item] as const));
  }, [items]);

  const templateItems = useMemo(() => {
    const key = String(templateKey || "").trim();
    return key ? itemsByTemplate[key] || [] : [];
  }, [itemsByTemplate, templateKey]);

  const findSavedPrompt = useCallback(
    (targetTemplateKey: string, text: string) => {
      return promptKeyMap.get(normalizeExtraPromptKey(targetTemplateKey, text)) || null;
    },
    [promptKeyMap],
  );

  const handleSavePrompt = useCallback(
    async (targetTemplateKey: string, text: string) => {
      const safeTemplateKey = String(targetTemplateKey || "").trim();
      const safeText = String(text || "").trim();
      if (!safeTemplateKey || !safeText) return;

      if (!isLoggedIn) {
        onRequireLogin?.();
        return;
      }

      const saveKey = normalizeExtraPromptKey(safeTemplateKey, safeText);
      if (pendingSaveKey === saveKey) return;

      const previous = items;
      const existing = findSavedPrompt(safeTemplateKey, safeText);
      const now = new Date().toISOString();
      const optimisticItem: ImageExtraPromptBookmarkType =
        existing ||
        ({
          id: `pending-${Date.now()}`,
          templateKey: safeTemplateKey,
          text: safeText,
          createdAt: now,
          updatedAt: now,
        } as ImageExtraPromptBookmarkType);

      setPendingSaveKey(saveKey);
      setItems((prev) => [optimisticItem, ...prev.filter((item) => normalizeExtraPromptKey(item.templateKey, item.text) !== saveKey)]);

      try {
        const nextItems = await addImageExtraPromptBookmark(safeTemplateKey, safeText);
        setItems(Array.isArray(nextItems) ? nextItems : []);
        toast.success(lang({ ko: "이미지 설명을 저장했습니다.", en: "Image description saved." }));
      } catch (error) {
        logger.warn("[useImageExtraPromptBookmarks] extraPrompt 저장 실패", error);
        setItems(previous);
        toast.error(
          lang({
            ko: "이미지 설명을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
            en: "Failed to save the image description. Please try again later.",
          }),
        );
      } finally {
        setPendingSaveKey("");
      }
    },
    [findSavedPrompt, isLoggedIn, items, onRequireLogin, pendingSaveKey],
  );

  const handleRemovePrompt = useCallback(
    async (id: string) => {
      const safeId = String(id || "").trim();
      if (!safeId) return;

      if (!isLoggedIn) {
        onRequireLogin?.();
        return;
      }

      if (pendingRemoveIds[safeId]) return;

      const previous = items;
      setPendingRemoveIds((prev) => ({ ...prev, [safeId]: true }));
      setItems((prev) => prev.filter((item) => item.id !== safeId));

      try {
        const nextItems = await removeImageExtraPromptBookmark(safeId);
        setItems(Array.isArray(nextItems) ? nextItems : []);
      } catch (error) {
        logger.warn("[useImageExtraPromptBookmarks] extraPrompt 삭제 실패", error);
        setItems(previous);
        toast.error(
          lang({
            ko: "저장한 이미지 설명을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.",
            en: "Failed to remove the saved image description. Please try again later.",
          }),
        );
      } finally {
        setPendingRemoveIds((prev) => {
          const { [safeId]: _removed, ...rest } = prev;
          return rest;
        });
      }
    },
    [isLoggedIn, items, onRequireLogin, pendingRemoveIds],
  );

  const handleClearPrompts = useCallback(
    async (targetTemplateKey?: string) => {
      if (!isLoggedIn) {
        onRequireLogin?.();
        return;
      }
      if (items.length === 0) return;

      const safeTemplateKey = String(targetTemplateKey || "").trim();
      const ok = await dialog.confirm({
        variant: "danger",
        message: safeTemplateKey
          ? lang({
              ko: "이 템플릿에 저장한 이미지 설명을 모두 삭제할까요?",
              en: "Clear all saved image descriptions for this template?",
            })
          : lang({
              ko: "저장한 이미지 설명을 모두 삭제할까요?",
              en: "Clear all saved image descriptions?",
            }),
      });
      if (!ok) return;

      const previous = items;
      setIsClearing(true);
      setItems((prev) => (safeTemplateKey ? prev.filter((item) => item.templateKey !== safeTemplateKey) : []));

      try {
        const nextItems = await clearImageExtraPromptBookmarks(safeTemplateKey ? { templateKey: safeTemplateKey } : undefined);
        setItems(Array.isArray(nextItems) ? nextItems : []);
      } catch (error) {
        logger.warn("[useImageExtraPromptBookmarks] extraPrompt 전체 삭제 실패", error);
        setItems(previous);
        toast.error(
          lang({
            ko: "저장한 이미지 설명을 정리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
            en: "Failed to clear saved image descriptions. Please try again later.",
          }),
        );
      } finally {
        setIsClearing(false);
      }
    },
    [isLoggedIn, items, onRequireLogin],
  );

  return {
    items,
    itemsByTemplate,
    templateItems,
    pendingSaveKey,
    pendingRemoveIds,
    isClearing,
    loadItems,
    findSavedPrompt,
    handleSavePrompt,
    handleRemovePrompt,
    handleClearPrompts,
  };
}
