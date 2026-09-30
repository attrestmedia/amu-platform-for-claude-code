"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import type { ImagePromptMetaType } from "types/app";
import { cn } from "utils/common";

export type AdaptiveHeroImageItem = Pick<ImagePromptMetaType, "url" | "width" | "height">;

type LoadedAspectRatioState = {
  url: string;
  value: number;
};

type AdaptiveHeroImageStageProps = {
  images: AdaptiveHeroImageItem[];
  index?: number;
  alt: string;
  className?: string;
  frameClassName?: string;
  imageClassName?: string;
  fallbackClassName?: string;
  fallbackAspectRatio?: number;
  loading?: "eager" | "lazy";
  fetchPriority?: "high" | "low" | "auto";
};

export function AdaptiveHeroImageStage({
  images,
  index = 0,
  alt,
  className,
  frameClassName,
  imageClassName,
  fallbackClassName,
  fallbackAspectRatio = 4 / 5,
  loading = "eager",
  fetchPriority = "auto",
}: AdaptiveHeroImageStageProps) {
  const safeImages = useMemo(() => images.filter((item) => Boolean(item?.url)).map((item) => ({ ...item })), [images]);
  const activeImage = safeImages.length > 0 ? safeImages[index % safeImages.length] : null;
  const activeImageUrl = activeImage?.url || "";
  const [loadedAspectRatioState, setLoadedAspectRatioState] = useState<LoadedAspectRatioState | null>(null);

  const metaAspectRatio = useMemo(() => {
    const width = Number(activeImage?.width || 0);
    const height = Number(activeImage?.height || 0);
    return width > 0 && height > 0 ? width / height : null;
  }, [activeImage?.height, activeImage?.width]);

  const loadedAspectRatio = loadedAspectRatioState?.url === activeImageUrl ? loadedAspectRatioState.value : null;

  const aspectRatio = metaAspectRatio ?? loadedAspectRatio ?? fallbackAspectRatio;

  return (
    <div className={cn("relative w-full", className)}>
      <div className={cn("relative w-full overflow-hidden", frameClassName)} style={{ aspectRatio }}>
        {activeImage?.url ? (
          <AnimatePresence mode="sync">
            <motion.img
              key={activeImage.url}
              src={activeImage.url}
              alt={alt}
              draggable={false}
              initial={{ opacity: 0, scale: 1.03 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ opacity: { duration: 0.9 }, scale: { duration: 5.5, ease: "linear" } }}
              className={cn("absolute inset-0 h-full w-full", imageClassName)}
              loading={loading}
              fetchPriority={fetchPriority}
              decoding="async"
              onLoad={(event) => {
                const nextWidth = event.currentTarget.naturalWidth || 0;
                const nextHeight = event.currentTarget.naturalHeight || 0;
                if (!nextWidth || !nextHeight) return;
                const nextAspectRatio = nextWidth / nextHeight;
                setLoadedAspectRatioState((prev) =>
                  prev?.url === activeImageUrl && prev.value === nextAspectRatio
                    ? prev
                    : { url: activeImageUrl, value: nextAspectRatio },
                );
              }}
            />
          </AnimatePresence>
        ) : (
          <div
            className={cn(
              "absolute inset-0 bg-gradient-to-br from-primary/15 via-background to-accent/10",
              fallbackClassName,
            )}
          />
        )}
      </div>
    </div>
  );
}
