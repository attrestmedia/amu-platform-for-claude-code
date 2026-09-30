"use client";

import { useEffect, useMemo, useState } from "react";
import { listStudioImageMetas } from "libs/api/lab/imagePrompts";
import type { ImagePromptMetaType } from "types/app";
import { logger } from "utils/log";

export function usePublicStudioImageMetas({
  limit = 8,
  templateKey,
  generationMode = "template",
}: {
  limit?: number;
  templateKey?: string;
  generationMode?: "template" | "custom";
}) {
  const [images, setImages] = useState<ImagePromptMetaType[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setIsLoading(true);
        const nextImages = await listStudioImageMetas({
          scope: "all",
          visibility: "public",
          templateKey,
          generationMode,
          limit,
        });

        if (!mounted) return;
        setImages(nextImages.filter((item) => Boolean(item?.url)));
      } catch (error) {
        logger.error("[usePublicStudioImageMetas] public studio image load failed", error);
        if (!mounted) return;
        setImages([]);
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [generationMode, limit, templateKey]);

  const urls = useMemo(() => images.map((item) => item.url).filter(Boolean), [images]);

  return {
    images,
    urls,
    isLoading,
  };
}
