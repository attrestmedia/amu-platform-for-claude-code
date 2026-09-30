"use client";

import { memo } from "react";
import { ImagePreloader, ScrollArea } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import { cn } from "utils/common";
import { ImagePreviewCard } from "./ImagePreviewCard";
import type { PromptVisibilityType } from "types/app";
import { VisibilityIconButton } from "./VisibilityIconButton";

type ImagePreviewRailProps = {
  images: string[];
  metaBySrc?: Record<string, { visibility?: PromptVisibilityType; canEdit?: boolean }>;
  onSelect: (src: string, index: number) => void;
  onToggleVisibility?: (src: string, next: PromptVisibilityType) => Promise<void> | void;
  togglingSrc?: string | null;
  className?: string;
  innerClassName?: string;
  cardClassName?: string;
  imageProps?: React.ComponentProps<typeof ImagePreviewCard>["imageProps"];
  /**
   * "rail"(기본): 가로 스크롤 레일.
   * "grid": 영역 너비에 맞춰 col-2~col-4로 자동 조절되는 그리드(컨테이너 쿼리 기반).
   */
  layout?: "rail" | "grid";
  isGenerating?: boolean;
};

export const ImagePreviewRail = memo(function ImagePreviewRail({
  images,
  metaBySrc,
  onSelect,
  onToggleVisibility,
  togglingSrc,
  className,
  innerClassName,
  cardClassName,
  imageProps,
  layout = "rail",
  isGenerating = false,
}: ImagePreviewRailProps) {
  if ((!images || images.length === 0) && !isGenerating) return null;

  const loadingPlaceholder = isGenerating ? (
    <ImagePreloader
      key="generation-loading"
      aspect="square"
      rounded={false}
      text={<Lang text={{ ko: "이미지 생성 중", en: "Generating image" }} />}
      label={lang({ ko: "이미지를 생성 중입니다.", en: "Generating image." })}
      className={cn(
        "relative shrink-0 overflow-hidden rounded-2xl border border-primary/20",
        layout === "grid" ? "w-full" : "h-[12rem] w-[12rem]",
      )}
      overlayClassName="text-xs font-medium text-primary-text"
    />
  ) : null;

  const renderCard = (src: string, i: number, extraCardClass?: string, extraImageProps?: typeof imageProps) => {
    const meta = metaBySrc?.[src];
    const visibility = meta?.visibility === "public" ? "public" : "private";
    const canToggle = Boolean(onToggleVisibility && meta?.canEdit);

    return (
      <ImagePreviewCard
        key={src}
        src={src}
        index={i}
        onSelectViewer={onSelect}
        alt={`recent-${i}`}
        className={cn(extraCardClass ?? "h-[12rem]", cardClassName)}
        imageProps={{ ...(extraImageProps ?? { height: "100%", width: "auto" }), ...imageProps }}
        badge={
          canToggle ? (
            <VisibilityIconButton
              size="icon-xs"
              visibility={visibility}
              disabled={togglingSrc === src}
              onToggle={(next) => onToggleVisibility?.(src, next)}
              className="absolute right-1 top-1 z-20"
            />
          ) : undefined
        }
      />
    );
  };

  if (layout === "grid") {
    return (
      <div className={cn("@container w-full", className)}>
        <div className={cn("grid gap-2 px-3", "grid-cols-2 @[28rem]:grid-cols-3 @[40rem]:grid-cols-4", innerClassName)}>
          {loadingPlaceholder}
          {images.map((src, i) =>
            renderCard(src, i, "aspect-square w-full", { height: "100%", width: "100%", className: "h-full w-full" }),
          )}
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className={cn("w-full", className)}>
      <div className={cn("flex gap-2 px-3", innerClassName)}>
        {loadingPlaceholder}
        {images.map((src, i) => renderCard(src, i))}
      </div>
    </ScrollArea>
  );
});
