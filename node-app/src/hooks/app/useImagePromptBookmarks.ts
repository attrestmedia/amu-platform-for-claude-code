"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  clearContentPromptBookmarks,
  clearImagePromptBookmarks,
  listContentPromptBookmarks,
  listImagePromptBookmarks,
  setContentPromptBookmark,
  setImagePromptBookmark,
} from "libs/api/lab";
import { lang } from "components/module/i18n";
import { dialog } from "@amu-labs/ui";
import { logger } from "utils/log";

type UsePromptBookmarksArgs = {
  isLoggedIn: boolean;
  onRequireLogin?: () => void;
  onLogout?: () => void;
};
type PromptBookmarkKindType = "image" | "content";

// 로그아웃 상태에서 노출하는 안정 참조. 매 렌더마다 새 객체를 만들면 하위 useMemo 캐시 무효화됨.
const EMPTY_BOOKMARKED_KEYS: string[] = [];
const EMPTY_BOOKMARK_PENDING_KEYS: Record<string, boolean> = {};

export function usePromptBookmarks({
  kind,
  isLoggedIn,
  onRequireLogin,
  onLogout,
}: UsePromptBookmarksArgs & { kind: PromptBookmarkKindType }) {
  const [rawBookmarkedKeys, setBookmarkedKeys] = useState<string[]>([]);
  const [rawBookmarkPendingKeys, setBookmarkPendingKeys] = useState<Record<string, boolean>>({});
  const [prevIsLoggedIn, setPrevIsLoggedIn] = useState(isLoggedIn);

  if (prevIsLoggedIn !== isLoggedIn) {
    setPrevIsLoggedIn(isLoggedIn);
    if (!isLoggedIn) {
      setBookmarkedKeys([]);
      setBookmarkPendingKeys({});
    }
  }

  useEffect(() => {
    let cancelled = false;

    if (!isLoggedIn) {
      onLogout?.();
      return;
    }

    const listBookmarks = kind === "content" ? listContentPromptBookmarks : listImagePromptBookmarks;
    listBookmarks()
      .then((keys) => {
        if (!cancelled) setBookmarkedKeys(Array.isArray(keys) ? keys : []);
      })
      .catch((error) => {
        logger.warn(`[usePromptBookmarks:${kind}] 북마크 로드 실패`, error);
      });

    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, kind, onLogout]);

  // 로그아웃 상태에서는 노출 값만 비워서 effect 내부의 동기 setState를 제거.
  const bookmarkedKeys = isLoggedIn ? rawBookmarkedKeys : EMPTY_BOOKMARKED_KEYS;
  const bookmarkPendingKeys = isLoggedIn ? rawBookmarkPendingKeys : EMPTY_BOOKMARK_PENDING_KEYS;

  const bookmarkedKeySet = useMemo(() => new Set(bookmarkedKeys), [bookmarkedKeys]);
  const bookmarkOrderMap = useMemo(() => new Map(bookmarkedKeys.map((key, index) => [key, index])), [bookmarkedKeys]);

  const handleToggleBookmark = useCallback(
    async (templateKey: string, nextBookmarked?: boolean) => {
      const key = String(templateKey || "").trim();
      if (!key) return;

      if (!isLoggedIn) {
        onRequireLogin?.();
        return;
      }

      if (bookmarkPendingKeys[key]) return;

      const wasBookmarked = bookmarkedKeySet.has(key);
      const targetBookmarked = typeof nextBookmarked === "boolean" ? nextBookmarked : !wasBookmarked;

      setBookmarkPendingKeys((prev) => ({ ...prev, [key]: true }));
      setBookmarkedKeys((prev) => {
        const next = new Set(prev);
        if (targetBookmarked) next.add(key);
        else next.delete(key);
        return Array.from(next);
      });

      try {
        const setBookmark = kind === "content" ? setContentPromptBookmark : setImagePromptBookmark;
        const keys = await setBookmark(key, targetBookmarked);
        setBookmarkedKeys(Array.isArray(keys) ? keys : []);
      } catch (error) {
        logger.warn(`[usePromptBookmarks:${kind}] 북마크 저장 실패`, error);
        setBookmarkedKeys((prev) => {
          const next = new Set(prev);
          if (wasBookmarked) next.add(key);
          else next.delete(key);
          return Array.from(next);
        });
        toast.error(
          lang({
            ko: "북마크 상태를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
            en: "Failed to save bookmark status. Please try again later.",
          }),
        );
      } finally {
        setBookmarkPendingKeys((prev) => {
          const { [key]: _removed, ...rest } = prev;
          return rest;
        });
      }
    },
    [bookmarkPendingKeys, bookmarkedKeySet, isLoggedIn, kind, onRequireLogin],
  );

  const handleClearAllBookmarks = useCallback(async () => {
    if (!isLoggedIn) {
      onRequireLogin?.();
      return;
    }
    if (bookmarkedKeys.length === 0) return;

    const ok = await dialog.confirm({
      variant: "danger",
      message: lang({
        ko: kind === "content" ? "북마크한 콘텐츠 템플릿을 모두 해제할까요?" : "북마크한 이미지 템플릿을 모두 해제할까요?",
        en: kind === "content" ? "Clear all bookmarked content templates?" : "Clear all bookmarked image templates?",
      }),
    });
    if (!ok) return;

    const prevKeys = bookmarkedKeys;
    setBookmarkedKeys([]);

    try {
      const clearBookmarks = kind === "content" ? clearContentPromptBookmarks : clearImagePromptBookmarks;
      const keys = await clearBookmarks();
      setBookmarkedKeys(Array.isArray(keys) ? keys : []);
    } catch (error) {
      logger.warn(`[usePromptBookmarks:${kind}] 북마크 전체 해제 실패`, error);
      setBookmarkedKeys(prevKeys);
      toast.error(
        lang({
          ko: "북마크를 정리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
          en: "Failed to clear bookmarks. Please try again later.",
        }),
      );
    }
  }, [bookmarkedKeys, isLoggedIn, kind, onRequireLogin]);

  return {
    bookmarkedKeys,
    bookmarkPendingKeys,
    bookmarkedKeySet,
    bookmarkOrderMap,
    handleToggleBookmark,
    handleClearAllBookmarks,
  };
}

export function useImagePromptBookmarks(args: UsePromptBookmarksArgs) {
  return usePromptBookmarks({ ...args, kind: "image" });
}

export function useContentPromptBookmarks(args: UsePromptBookmarksArgs) {
  return usePromptBookmarks({ ...args, kind: "content" });
}
