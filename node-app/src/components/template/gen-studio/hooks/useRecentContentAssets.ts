"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { lang } from "components/module/i18n";
import { dialog } from "@amu-labs/ui";
import { deleteStudioContent, listStudioContentMetas, setStudioContentVisibility } from "libs/api/lab";
import type { UserScopeType } from "types/ai";
import type { ContentAssetMetaType, ContentAssetPreviewType, PromptVisibilityType } from "types/app";
import { runAfterCurrentRender, toErrorMessage } from "utils/common";
import { logger } from "utils/log";
import { createContentPreviewLoadErrors } from "./contentPreviewLoadState";

export type RecentContentOwnerFilter = "all" | "mine";
export type RecentContentVisibilityFilter = "all" | PromptVisibilityType;

function toTimestamp(value: ContentAssetPreviewType["createdAt"]) {
  const timestamp = value ? new Date(value).getTime() : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function mergeRecentContentRows(ownedRows: ContentAssetPreviewType[], publicRows: ContentAssetPreviewType[]) {
  const rowsByAssetId = new Map<string, ContentAssetPreviewType>();
  [...publicRows, ...ownedRows].forEach((row) => {
    const assetId = String(row?.assetId || "").trim();
    if (!assetId) return;
    const current = rowsByAssetId.get(assetId);
    if (!current || (row.canEdit && !current.canEdit)) rowsByAssetId.set(assetId, row);
  });
  return Array.from(rowsByAssetId.values()).sort((a, b) => toTimestamp(b.createdAt) - toTimestamp(a.createdAt));
}

export function useRecentContentAssets({
  isLoggedIn,
  mode,
  universeId,
  templateKey,
}: {
  isLoggedIn: boolean;
  mode: UserScopeType;
  universeId?: string;
  templateKey: string;
}) {
  const [rows, setRows] = useState<ContentAssetPreviewType[]>([]);
  const [ownerFilter, setOwnerFilter] = useState<RecentContentOwnerFilter>("all");
  const [visibilityFilter, setVisibilityFilter] = useState<RecentContentVisibilityFilter>("all");
  const [loading, setLoading] = useState(false);
  const [managingAssetId, setManagingAssetId] = useState("");
  const [loadErrors, setLoadErrors] = useState(createContentPreviewLoadErrors);

  const load = useCallback(async () => {
    const key = String(templateKey || "").trim();
    if (!key) {
      setRows([]);
      setLoadErrors(createContentPreviewLoadErrors());
      return;
    }

    const onlyCurrentTemplate = (items: ContentAssetPreviewType[]) =>
      items.filter((row) => String(row?.templateKey || "").trim() === key);

    setLoading(true);
    setLoadErrors(createContentPreviewLoadErrors());
    try {
      if (!isLoggedIn) {
        const publicRows = await listStudioContentMetas({
          scope: "all",
          templateKey: key,
          limit: 20,
          visibility: "public",
        });
        setRows(onlyCurrentTemplate(Array.isArray(publicRows) ? publicRows : []));
        return;
      }

      const scope = mode === "universe" ? "universe" : "user";
      const baseParams = { templateKey: key, limit: 20 };
      const [ownedResult, publicResult] = await Promise.allSettled([
        listStudioContentMetas({
          scope,
          ...(scope === "universe" && universeId ? { universeId } : {}),
          ...baseParams,
        }),
        listStudioContentMetas({ scope: "all", visibility: "public", ...baseParams }),
      ]);
      const ownedRows = ownedResult.status === "fulfilled" && Array.isArray(ownedResult.value) ? ownedResult.value : [];
      const publicRows = publicResult.status === "fulfilled" && Array.isArray(publicResult.value) ? publicResult.value : [];
      const ownedFailed = ownedResult.status === "rejected";
      const publicFailed = publicResult.status === "rejected";
      setLoadErrors(createContentPreviewLoadErrors({ owned: ownedFailed, public: publicFailed }));
      if (ownedFailed) {
        logger.warn("Gen Studio 본인 최근 콘텐츠 조회 실패", {
          error: toErrorMessage(ownedResult.reason),
        });
      }
      if (publicFailed) {
        logger.warn("Gen Studio 공개 최근 콘텐츠 조회 실패", {
          error: toErrorMessage(publicResult.reason),
        });
      }
      setRows(onlyCurrentTemplate(mergeRecentContentRows(ownedRows, publicRows)));
    } catch (error) {
      setRows([]);
      setLoadErrors(createContentPreviewLoadErrors({ public: true }));
      logger.warn("Gen Studio 공개 최근 콘텐츠 조회 실패", { error: toErrorMessage(error) });
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn, mode, templateKey, universeId]);

  useEffect(() => {
    let cancelled = false;
    runAfterCurrentRender(() => {
      if (!cancelled) void load();
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    runAfterCurrentRender(() => {
      if (cancelled) return;
      if (!isLoggedIn) {
        setOwnerFilter("all");
        setVisibilityFilter("public");
        return;
      }
      setVisibilityFilter("all");
    });
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn]);

  const filteredRows = useMemo(() => {
    if (!isLoggedIn) return rows.filter((row) => row.visibility === "public");
    return rows.filter((row) => {
      if (ownerFilter === "mine" && !row.isOwner) return false;
      if (visibilityFilter !== "all" && row.visibility !== visibilityFilter) return false;
      return true;
    });
  }, [isLoggedIn, ownerFilter, rows, visibilityFilter]);

  const updateVisibility = useCallback(async (row: ContentAssetMetaType) => {
    if (!row?.assetId || !row?.canEdit) return null;
    const visibility: PromptVisibilityType = row.visibility === "public" ? "private" : "public";
    setManagingAssetId(row.assetId);
    try {
      await setStudioContentVisibility(row.assetId, visibility);
      const updated = { ...row, visibility };
      setRows((current) => current.map((item) => (item.assetId === row.assetId ? { ...item, visibility } : item)));
      return updated;
    } catch (error: unknown) {
      void dialog.alert({
        variant: "danger",
        message:
          toErrorMessage(error) || lang({ ko: "공개 상태 변경 실패", en: "Failed to change visibility" }),
      });
      return null;
    } finally {
      setManagingAssetId("");
    }
  }, []);

  const remove = useCallback(async (row: ContentAssetMetaType) => {
    if (!row?.assetId || !row?.canEdit) return false;
    const confirmed = await dialog.confirm({
      variant: "danger",
      message: lang({ ko: "이 콘텐츠를 삭제할까요?", en: "Delete this content?" }),
    });
    if (!confirmed) return false;

    setManagingAssetId(row.assetId);
    try {
      await deleteStudioContent(row.assetId, { policy: "soft", reason: "user_delete" });
      setRows((current) => current.filter((item) => item.assetId !== row.assetId));
      return true;
    } catch (error: unknown) {
      void dialog.alert({
        variant: "danger",
        message: toErrorMessage(error) || lang({ ko: "콘텐츠 삭제 실패", en: "Failed to delete content" }),
      });
      return false;
    } finally {
      setManagingAssetId("");
    }
  }, []);

  return {
    filteredRows,
    ownerFilter,
    setOwnerFilter,
    visibilityFilter,
    setVisibilityFilter,
    loading,
    managingAssetId,
    loadErrors,
    load,
    updateVisibility,
    remove,
  };
}
