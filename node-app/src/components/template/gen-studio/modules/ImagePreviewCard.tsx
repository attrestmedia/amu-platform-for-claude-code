"use client";

import React from "react";
import { Button } from "@amu-labs/ui";
import { ImageBox } from "components/module/image";
import { Lang, lang } from "components/module/i18n";
import { Download, Eye } from "lucide-react";
import { cn, isMobileEnvironment } from "utils/common";
import { downloadImageByUrl } from "utils/common/imageDownloadUtils";

type ImagePreviewCardProps = {
  src: string;
  index: number;
  onSelectViewer: (src: string, index: number) => void;
  alt?: string;
  className?: string;
  overlayClassName?: string;
  badge?: React.ReactNode;
  imageProps?: Omit<React.ComponentProps<typeof ImageBox>, "src" | "alt" | "className"> & {
    className?: string;
  };
};

export function ImagePreviewCard({
  src,
  index,
  onSelectViewer,
  alt,
  className,
  overlayClassName,
  badge,
  imageProps,
}: ImagePreviewCardProps) {
  const { className: imageClassName, ...restImageProps } = imageProps || {};
  const [downloading, setDownloading] = React.useState(false);

  const handleSelect = React.useCallback(() => {
    onSelectViewer(src, index);
  }, [onSelectViewer, src, index]);

  const handleDownload = React.useCallback(
    async (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (!src || downloading) return;

      setDownloading(true);
      try {
        const downloaded = await downloadImageByUrl(src, index);
        if (!downloaded) {
          window.open(src, "_blank", "noopener,noreferrer");
        }
      } finally {
        setDownloading(false);
      }
    },
    [src, index, downloading],
  );
  const buttonHoverClass = cn(
    "bg-black/20 text-white opacity-0 transition-opacity drop-shadow-md",
    "hover:bg-black/40",
    "group-hover:opacity-100 group-focus-within:opacity-100",
  );

  return (
    <div
      className={cn(
        "group relative shrink-0 overflow-hidden rounded-2xl",
        "transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        className,
      )}
    >
      <ImageBox
        src={src}
        alt={alt ?? `image-${index}`}
        objectFit="object-cover"
        {...restImageProps}
        className={cn("rounded-2xl", imageClassName)}
      />

      {badge}

      <div
        className={cn(
          "absolute",
          "flex items-center",
          "transition-colors",
          isMobileEnvironment() ? "bottom-2 right-2 justify-end gap-1" : "inset-0 justify-center gap-2",
          overlayClassName,
        )}
      >
        <Button
          variant="blank"
          size={isMobileEnvironment() ? "icon-xs" : "icon-sm"}
          rounded="full"
          onClick={handleSelect}
          aria-label={lang({ ko: "이미지 크게 보기", en: "View larger image" })}
          className={cn(buttonHoverClass, isMobileEnvironment() && "opacity-100")}
        >
          <Eye className={cn(isMobileEnvironment() ? "w-3.5 h-3.5" : "icon-xs")} />
        </Button>
        <Button
          variant="blank"
          size={isMobileEnvironment() ? "icon-xs" : "icon-sm"}
          rounded="full"
          onClick={handleDownload}
          aria-label={lang({ ko: "이미지 다운로드", en: "Download image" })}
          disabled={downloading || !src}
          className={cn(buttonHoverClass, isMobileEnvironment() && "opacity-100")}
        >
          <Download className={cn(isMobileEnvironment() ? "w-3.5 h-3.5" : "icon-xs")} />
        </Button>
      </div>

      <span className="sr-only">
        <Lang text={{ ko: "이미지 크게 보기", en: "View image" }} />
      </span>
    </div>
  );
}
