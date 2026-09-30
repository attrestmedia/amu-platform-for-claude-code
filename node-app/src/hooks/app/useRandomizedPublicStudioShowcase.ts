"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { listStudioImageMetas } from "libs/api/lab/imagePrompts";
import type { ImagePromptMetaType } from "types/app";
import { logger } from "utils/log";

function shuffleImageMetas(items: ImagePromptMetaType[]) {
  const nextItems = [...items];

  for (let index = nextItems.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [nextItems[index], nextItems[randomIndex]] = [nextItems[randomIndex], nextItems[index]];
  }

  return nextItems;
}

function appendUniqueImageMetas(currentItems: ImagePromptMetaType[], incomingItems: ImagePromptMetaType[]) {
  const seenKeys = new Set(currentItems.map((item) => item.assetId || item.url).filter(Boolean));
  const nextItems = [...currentItems];

  for (const item of incomingItems) {
    const key = item.assetId || item.url;
    if (!key || seenKeys.has(key)) continue;
    seenKeys.add(key);
    nextItems.push(item);
  }

  return nextItems;
}

export function useRandomizedPublicStudioShowcase({
  initialLimit = 12,
  pageSize = 10,
  templateKey,
  generationMode = "template",
}: {
  initialLimit?: number;
  pageSize?: number;
  templateKey?: string;
  generationMode?: "template" | "custom";
}) {
  const [images, setImages] = useState<ImagePromptMetaType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const nextSkipRef = useRef(0);
  const isFetchingRef = useRef(false);

  const fetchPage = useCallback(
    async (skip: number, limit: number) => {
      const nextItems = await listStudioImageMetas({
        scope: "all",
        visibility: "public",
        templateKey,
        generationMode,
        limit,
        skip,
      });

      return nextItems.filter((item) => Boolean(item?.url));
    },
    [generationMode, templateKey],
  );

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setIsLoading(true);
        nextSkipRef.current = 0;

        const initialItems = await fetchPage(0, initialLimit);
        if (!mounted) return;

        nextSkipRef.current = initialItems.length;
        setImages(shuffleImageMetas(initialItems));
        setHasMore(initialItems.length >= initialLimit);
      } catch (error) {
        logger.error("[useRandomizedPublicStudioShowcase] initial load failed", error);
        if (!mounted) return;
        setImages([]);
        setHasMore(false);
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [fetchPage, initialLimit]);

  const loadMore = useCallback(async () => {
    if (isFetchingRef.current || !hasMore) return;

    isFetchingRef.current = true;
    setIsLoadingMore(true);

    try {
      const nextItems = await fetchPage(nextSkipRef.current, pageSize);
      nextSkipRef.current += nextItems.length;

      setImages((prev) => appendUniqueImageMetas(prev, shuffleImageMetas(nextItems)));
      setHasMore(nextItems.length >= pageSize);
    } catch (error) {
      logger.error("[useRandomizedPublicStudioShowcase] load more failed", error);
      setHasMore(false);
    } finally {
      isFetchingRef.current = false;
      setIsLoadingMore(false);
    }
  }, [fetchPage, hasMore, pageSize]);

  return {
    images,
    isLoading,
    isLoadingMore,
    hasMore,
    loadMore,
  };
}
