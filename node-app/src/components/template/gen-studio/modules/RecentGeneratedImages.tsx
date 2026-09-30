"use client";

import { memo, useState } from "react";
import { Button, Label } from "@amu-labs/ui";
import { lang } from "components/module/i18n";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { PromptVisibilityType } from "types/app";
import { ImagePreviewRail } from "./ImagePreviewRail";

type RecentGeneratedImagesProps = {
  images: string[];
  metaBySrc?: Record<string, { visibility?: PromptVisibilityType; canEdit?: boolean }>;
  onSelect: (src: string, index: number) => void;
  onToggleVisibility?: (src: string, next: PromptVisibilityType) => Promise<void> | void;
  togglingSrc?: string | null;
  maxItems?: number;
  variant?: "full" | "slide-only";
  className?: string;
  innerClassName?: string;
};

export const RecentGeneratedImages = memo(function RecentGeneratedImages({
  images,
  metaBySrc,
  onSelect,
  onToggleVisibility,
  togglingSrc,
  maxItems,
  variant = "full",
  className,
  innerClassName,
}: RecentGeneratedImagesProps) {
  const [open, setOpen] = useState(false);
  if (!images || images.length === 0) return null;
  const visibleImages = typeof maxItems === "number" ? images.slice(0, maxItems) : images;

  const imageSlide = (
    <ImagePreviewRail
      images={visibleImages}
      metaBySrc={metaBySrc}
      onToggleVisibility={onToggleVisibility}
      togglingSrc={togglingSrc}
      onSelect={onSelect}
      className={className}
      innerClassName={innerClassName}
    />
  );

  if (variant === "slide-only") return imageSlide;

  return (
    <div className="space-y-2">
      <Label
        label={lang({ ko: "최근 생성 이미지", en: "Recent Images" })}
        suffix={
          <Button
            variant="blank"
            onClick={() => setOpen((v) => !v)}
            aria-label={lang({ ko: "최근 이미지 토글", en: "Toggle recent images" })}
          >
            {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </Button>
        }
      />
      {open && imageSlide}
    </div>
  );
});
