"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listStudioImageMetas, setStudioImageVisibility, setStudioImageTemplateKey, deleteStudioImage } from "libs/api/lab";
import type { UserExtendedScopeType } from "types/ai";
import type { ImagePromptMetaType, PromptVisibilityType } from "types/app";
import { mergeStudioRecentMetaRows } from "utils/app";
import type { RecentOwnerFilterType, RecentVisibilityFilterType } from "../types";

const STUDIO_RECENT_IMAGE_PAGE_SIZE = 200;

type ListStudioImageMetasParams = Parameters<typeof listStudioImageMetas>[0];

function mergeStableImageOrder(prev: string[], next: string[]) {
  if (!next.length) return [];

  const nextSet = new Set(next);
  const prevSet = new Set(prev);
  const fresh = next.filter((src) => !prevSet.has(src));
  const kept = prev.filter((src) => nextSet.has(src));
  const orderedSet = new Set([...fresh, ...kept]);
  const recovered = next.filter((src) => !orderedSet.has(src));

  return [...fresh, ...kept, ...recovered];
}

async function listAllStudioImageMetas(params?: ListStudioImageMetasParams) {
  const rows: ImagePromptMetaType[] = [];
  let skip = 0;

  while (true) {
    const page = await listStudioImageMetas({
      ...params,
      limit: STUDIO_RECENT_IMAGE_PAGE_SIZE,
      skip,
    });

    if (!Array.isArray(page) || page.length === 0) break;
    rows.push(...page);

    if (page.length < STUDIO_RECENT_IMAGE_PAGE_SIZE) break;
    skip += page.length;
  }

  return rows;
}

type Args = {
  mode: "user" | "universe";
  universeId?: string;
  templateKey?: string;
  isLoggedIn: boolean;
  fallbackImages: string[];
};

type GeneratedRecentMetaType = {
  templateKey?: string;
  templateTitle?: string;
  provider?: ImagePromptMetaType["provider"];
  modelName?: string;
  assets?: ImagePromptMetaType[];
};

export function useStudioRecentImages({ mode, universeId, templateKey, isLoggedIn, fallbackImages }: Args) {
  const [recentImages, setRecentImages] = useState<string[]>([]);
  const [recentMetaBySrc, setRecentMetaBySrc] = useState<Record<string, ImagePromptMetaType>>({});
  const [recentOwnerFilter, setRecentOwnerFilter] = useState<RecentOwnerFilterType>("all");
  const [recentVisibilityFilter, setRecentVisibilityFilter] = useState<RecentVisibilityFilterType>("public");

  const reloadTimerRef = useRef<number | null>(null);
  const sourceGalleryImages = useMemo(
    () => (recentImages.length > 0 ? recentImages : fallbackImages),
    [recentImages, fallbackImages],
  );
  const hasRecentImages = sourceGalleryImages.length > 0;
  const isMineOnlyMode = recentOwnerFilter === "mine";
  const showFilterModule = isLoggedIn;
  const showVisibilityFilterButtons = isLoggedIn && isMineOnlyMode;

  const galleryImages = useMemo(() => {
    return sourceGalleryImages.filter((src) => {
      const meta = recentMetaBySrc[src];
      if (!meta) return false;

      // 비로그인: 공개 이미지 전체
      if (!isLoggedIn) {
        return meta.visibility === "public";
      }

      // 로그인 + 전체 모드: visibility 구분 없이 현재 scope 이미지 전체
      if (!isMineOnlyMode) {
        return true;
      }

      // 로그인 + 내 이미지만
      if (!meta.canEdit) return false;
      return meta.visibility === recentVisibilityFilter;
    });
  }, [sourceGalleryImages, recentVisibilityFilter, recentMetaBySrc, isLoggedIn, isMineOnlyMode]);

  const clearRecentReload = useCallback(() => {
    if (reloadTimerRef.current != null) {
      window.clearTimeout(reloadTimerRef.current);
      reloadTimerRef.current = null;
    }
  }, []);

  const resetRecentState = useCallback(() => {
    clearRecentReload();
    setRecentImages([]);
    setRecentMetaBySrc({});
    setRecentOwnerFilter("all");
    setRecentVisibilityFilter("public");
  }, [clearRecentReload]);

  const loadRecentForPrompt = useCallback(async () => {
    const scope: UserExtendedScopeType = mode === "universe" ? "universe" : "user";

    if (!templateKey) {
      resetRecentState();
      return;
    }

    const base = {
      scope,
      ...(scope === "universe" && universeId ? { universeId } : {}),
    };

    const [ownedResult, publicResult] = await Promise.allSettled([
      isLoggedIn ? listAllStudioImageMetas({ ...base, templateKey }) : Promise.resolve([]),
      listAllStudioImageMetas({ scope: "all", templateKey, visibility: "public" }),
    ]);

    const ownedRows = ownedResult.status === "fulfilled" && Array.isArray(ownedResult.value) ? ownedResult.value : [];
    const publicRows =
      publicResult.status === "fulfilled" && Array.isArray(publicResult.value) ? publicResult.value : [];

    const { images: next, metaBySrc: nextMeta } = mergeStudioRecentMetaRows({
      ownedRows,
      publicRows,
    });

    setRecentImages((prev) => mergeStableImageOrder(prev, next));
    setRecentMetaBySrc(nextMeta);
  }, [mode, universeId, templateKey, isLoggedIn, resetRecentState]);

  const scheduleRecentReload = useCallback(
    (delayMs = 700) => {
      clearRecentReload();
      reloadTimerRef.current = window.setTimeout(() => {
        void loadRecentForPrompt().finally(() => {
          reloadTimerRef.current = null;
        });
      }, delayMs);
    },
    [clearRecentReload, loadRecentForPrompt],
  );

  useEffect(() => {
    return () => {
      clearRecentReload();
    };
  }, [clearRecentReload]);

  const applyGeneratedRecent = useCallback(
    (images: string[], visibility: PromptVisibilityType, meta?: GeneratedRecentMetaType) => {
      if (!Array.isArray(images) || images.length === 0) return;

      const createdAt = Date.now();
      const assetByUrl = new Map((meta?.assets || []).map((asset) => [String(asset?.url || "").trim(), asset] as const));
      setRecentImages((prev) => Array.from(new Set([...(images || []), ...(prev || [])])));
      setRecentMetaBySrc((prev) => {
        const next = { ...prev };
        (images || []).forEach((src, outputIndex) => {
          const key = String(src || "").trim();
          if (!key) return;
          const asset = assetByUrl.get(key);
          next[key] = {
            ...(next[key] || {}),
            ...(asset || {}),
            url: key,
            visibility: asset?.visibility || visibility,
            createdAt: asset?.createdAt || createdAt,
            outputIndex: typeof asset?.outputIndex === "number" ? asset.outputIndex : outputIndex,
            templateKey: String(asset?.templateKey || meta?.templateKey || next[key]?.templateKey || "").trim(),
            templateTitle: String(asset?.templateTitle || meta?.templateTitle || next[key]?.templateTitle || "").trim(),
            provider: asset?.provider || meta?.provider || next[key]?.provider,
            modelName: String(asset?.modelName || meta?.modelName || next[key]?.modelName || "").trim(),
            storage: asset?.storage || next[key]?.storage,
            canEdit: isLoggedIn,
            isOwner: isLoggedIn,
          };
        });
        return next;
      });
    },
    [isLoggedIn],
  );

  const updateRecentVisibility = useCallback(
    async (src: string, visibility: PromptVisibilityType) => {
      const row = recentMetaBySrc[src];
      if (!row?.assetId) throw new Error("asset_id_not_found");
      if (!row?.canEdit) throw new Error("forbidden");

      const updated = await setStudioImageVisibility(row.assetId, visibility);
      const nextSrc = String(updated?.url || src).trim() || src;
      if (nextSrc !== src) {
        setRecentImages((prev) => prev.map((v) => (v === src ? nextSrc : v)));
      }
      setRecentMetaBySrc((prev) => ({
        ...Object.fromEntries(Object.entries(prev).filter(([key]) => key !== src || nextSrc === src)),
        [nextSrc]: {
          ...prev[src],
          ...(updated || {}),
          url: nextSrc,
          visibility,
        },
      }));
    },
    [recentMetaBySrc],
  );

  const removeRecentImage = useCallback(
    async (src: string) => {
      const row = recentMetaBySrc[src];
      if (!row?.assetId) throw new Error("asset_id_not_found");
      if (!row?.canEdit) throw new Error("forbidden");

      await deleteStudioImage(row.assetId, { policy: "soft", reason: "user_delete" });

      setRecentImages((prev) => prev.filter((v) => v !== src));
      setRecentMetaBySrc((prev) => {
        const next = { ...prev };
        delete next[src];
        return next;
      });
    },
    [recentMetaBySrc],
  );

  const updateRecentTemplateKey = useCallback(
    async (src: string, nextTemplateKey: string) => {
      const row = recentMetaBySrc[src];
      if (!row?.assetId) throw new Error("asset_id_not_found");

      const updated = await setStudioImageTemplateKey(row.assetId, nextTemplateKey);
      const updatedTemplateKey =
        updated && typeof updated === "object" && "templateKey" in (updated as Record<string, unknown>)
          ? (updated as Record<string, unknown>).templateKey
          : undefined;
      const normalizedNextTemplateKey = String(updatedTemplateKey || nextTemplateKey || "").trim();

      setRecentMetaBySrc((prev) => ({
        ...prev,
        [src]: {
          ...prev[src],
          templateKey: normalizedNextTemplateKey,
        },
      }));

      if (templateKey && normalizedNextTemplateKey !== templateKey) {
        setRecentImages((prev) => prev.filter((value) => value !== src));
      }
    },
    [recentMetaBySrc, templateKey],
  );

  return {
    recentImages,
    recentMetaBySrc,
    recentOwnerFilter,
    setRecentOwnerFilter,
    recentVisibilityFilter,
    setRecentVisibilityFilter,
    sourceGalleryImages,
    galleryImages,
    hasRecentImages,
    showFilterModule,
    showVisibilityFilterButtons,
    isMineOnlyMode,
    resetRecentState,
    loadRecentForPrompt,
    scheduleRecentReload,
    clearRecentReload,
    applyGeneratedRecent,
    updateRecentVisibility,
    updateRecentTemplateKey,
    removeRecentImage,
  };
}
