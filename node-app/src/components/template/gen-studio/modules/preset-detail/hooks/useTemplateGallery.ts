"use client";

import { useCallback, useMemo, useState } from "react";
import type { ImagePromptMetaType } from "types/app";
import { toSafeString, toSortIndex, toTimestamp } from "utils/common";

export type TemplateGallerySortType = "newest" | "oldest" | "public-first" | "private-first";

const TEMPLATE_GALLERY_SORT_SEQUENCE: TemplateGallerySortType[] = [
  "newest",
  "oldest",
  "public-first",
  "private-first",
];

export const TEMPLATE_GALLERY_SORT_TEXT: Record<TemplateGallerySortType, { ko: string; en: string }> = {
  newest: { ko: "최신순", en: "Newest first" },
  oldest: { ko: "오래된순", en: "Oldest first" },
  "public-first": { ko: "공개 우선", en: "Public first" },
  "private-first": { ko: "비공개 우선", en: "Private first" },
};

function getNextTemplateGallerySort(current: TemplateGallerySortType): TemplateGallerySortType {
  const currentIndex = TEMPLATE_GALLERY_SORT_SEQUENCE.indexOf(current);
  const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % TEMPLATE_GALLERY_SORT_SEQUENCE.length : 0;
  return TEMPLATE_GALLERY_SORT_SEQUENCE[nextIndex] || TEMPLATE_GALLERY_SORT_SEQUENCE[0];
}

export function useTemplateGallery({
  galleryImages,
  recentMetaBySrc,
  effectiveTemplateKey,
}: {
  galleryImages: string[];
  recentMetaBySrc: Record<string, ImagePromptMetaType>;
  effectiveTemplateKey?: string;
}) {
  const [sort, setSort] = useState<TemplateGallerySortType>("newest");

  const images = useMemo(() => {
    const rows = galleryImages.map((src, index) => ({ src, index, meta: recentMetaBySrc[src] }));
    const jobTimeByJobId = rows.reduce<Record<string, number>>((acc, row) => {
      const jobId = toSafeString(row.meta?.jobId);
      if (!jobId) return acc;
      acc[jobId] = Math.max(acc[jobId] || 0, toTimestamp(row.meta?.createdAt));
      return acc;
    }, {});

    return rows
      .sort((a, b) => {
        const aTime = toTimestamp(a.meta?.createdAt);
        const bTime = toTimestamp(b.meta?.createdAt);
        const aJobId = toSafeString(a.meta?.jobId);
        const bJobId = toSafeString(b.meta?.jobId);
        const sameJob = Boolean(aJobId && bJobId && aJobId === bJobId);
        const aGroupTime = aJobId ? (jobTimeByJobId[aJobId] ?? aTime) : aTime;
        const bGroupTime = bJobId ? (jobTimeByJobId[bJobId] ?? bTime) : bTime;
        const aVisibility = a.meta?.visibility === "public" ? 1 : 0;
        const bVisibility = b.meta?.visibility === "public" ? 1 : 0;

        if (sort === "public-first" && aVisibility !== bVisibility) return bVisibility - aVisibility;
        if (sort === "private-first" && aVisibility !== bVisibility) return aVisibility - bVisibility;

        if (sameJob) {
          const sameJobIndexDiff = toSortIndex(a.meta?.outputIndex) - toSortIndex(b.meta?.outputIndex);
          if (sameJobIndexDiff !== 0) return sameJobIndexDiff;
          if (aTime !== bTime) return aTime - bTime;
          return a.index - b.index;
        }

        if (sort === "oldest") {
          if (aGroupTime !== bGroupTime) return aGroupTime - bGroupTime;
        } else if (aGroupTime !== bGroupTime) {
          return bGroupTime - aGroupTime;
        }

        const outputIndexDiff = toSortIndex(a.meta?.outputIndex) - toSortIndex(b.meta?.outputIndex);
        if (outputIndexDiff !== 0) return outputIndexDiff;
        return a.index - b.index;
      })
      .map((row) => row.src);
  }, [galleryImages, recentMetaBySrc, sort]);

  const currentTemplateImageCount = useMemo(() => {
    if (!effectiveTemplateKey) return 0;
    return images.filter((src) => recentMetaBySrc[src]?.templateKey === effectiveTemplateKey).length;
  }, [effectiveTemplateKey, images, recentMetaBySrc]);

  const cycleSort = useCallback(() => {
    setSort((current) => getNextTemplateGallerySort(current));
  }, []);

  return {
    sort,
    sortText: TEMPLATE_GALLERY_SORT_TEXT[sort],
    images,
    currentTemplateImageCount,
    cycleSort,
  };
}
