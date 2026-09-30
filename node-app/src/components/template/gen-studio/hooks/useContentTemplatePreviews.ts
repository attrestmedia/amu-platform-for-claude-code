"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  listOwnedStudioContentTemplatePreviewMetas,
  listStudioContentTemplatePreviewMetas,
} from "libs/api/lab";
import type { ContentAssetPreviewType } from "types/app";
import { runAfterCurrentRender, toErrorMessage } from "utils/common";
import { mergeContentAssetPreviewMaps } from "utils/lab/contentAssetPreview";
import { logger } from "utils/log";
import { createContentPreviewLoadErrors } from "./contentPreviewLoadState";

export const CONTENT_TEMPLATE_PREVIEW_LIMIT = 3;

type UseContentTemplatePreviewsOptions = {
  isLoggedIn?: boolean;
  scope?: "user" | "universe";
  universeId?: string;
};

export function useContentTemplatePreviews(
  templateKeys: string[],
  perTemplate = CONTENT_TEMPLATE_PREVIEW_LIMIT,
  options: UseContentTemplatePreviewsOptions = {},
) {
  const normalizedKeys = useMemo(
    () => Array.from(new Set(templateKeys.map((key) => String(key || "").trim()).filter(Boolean))),
    [templateKeys],
  );
  const requestKey = normalizedKeys.join("\u0000");
  const [previewsByTemplate, setPreviewsByTemplate] = useState<Record<string, ContentAssetPreviewType[]>>({});
  const [loading, setLoading] = useState(false);
  const [loadErrors, setLoadErrors] = useState(createContentPreviewLoadErrors);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const reload = useCallback(() => setRefreshNonce((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;
    const keys = requestKey.split("\u0000").filter(Boolean);

    runAfterCurrentRender(() => {
      if (cancelled) return;
      if (!keys.length) {
        setPreviewsByTemplate({});
        setLoadErrors(createContentPreviewLoadErrors());
        setLoading(false);
        return;
      }

      setLoading(true);
      setLoadErrors(createContentPreviewLoadErrors());
      void Promise.allSettled([
        listStudioContentTemplatePreviewMetas({ templateKeys: keys, perTemplate }),
        options.isLoggedIn
          ? listOwnedStudioContentTemplatePreviewMetas({
              templateKeys: keys,
              perTemplate,
              scope: options.scope,
              universeId: options.universeId,
            })
          : Promise.resolve({} as Record<string, ContentAssetPreviewType[]>),
      ])
        .then(([publicResult, ownedResult]) => {
          if (cancelled) return;
          const publicRows = publicResult.status === "fulfilled" ? publicResult.value : {};
          const ownedRows = ownedResult.status === "fulfilled" ? ownedResult.value : {};
          const publicFailed = publicResult.status === "rejected";
          const ownedFailed = options.isLoggedIn && ownedResult.status === "rejected";
          setLoadErrors(createContentPreviewLoadErrors({ public: publicFailed, owned: ownedFailed }));
          if (publicFailed) {
            logger.warn("Gen Studio 공개 콘텐츠 미리보기 조회 실패", {
              error: toErrorMessage(publicResult.reason),
            });
          }
          if (ownedFailed && ownedResult.status === "rejected") {
            logger.warn("Gen Studio 본인 콘텐츠 미리보기 조회 실패", {
              error: toErrorMessage(ownedResult.reason),
            });
          }
          setPreviewsByTemplate(mergeContentAssetPreviewMaps(keys, publicRows, ownedRows, perTemplate));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    });

    return () => {
      cancelled = true;
    };
  }, [options.isLoggedIn, options.scope, options.universeId, perTemplate, refreshNonce, requestKey]);

  return { previewsByTemplate, loading, loadErrors, reload };
}
