"use client";

import { Button } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import { Eye, Link2 } from "lucide-react";
import { cn, isMobileEnvironment } from "utils/common";

type GeneratedImageActionOverlayProps = {
  onPreview: () => void;
  onOpenTemplate?: () => void;
  className?: string;
  buttonClassName?: string;
};

export function GeneratedImageActionOverlay({
  onPreview,
  onOpenTemplate,
  className,
  buttonClassName,
}: GeneratedImageActionOverlayProps) {
  const isMobile = isMobileEnvironment();
  const buttonBaseClassName = cn(
    "bg-black/40 text-white opacity-0 transition-opacity drop-shadow-md backdrop-blur-sm",
    "hover:bg-black/60",
    "group-hover:opacity-100 group-focus-within:opacity-100",
    isMobile && "opacity-100",
    buttonClassName,
  );

  return (
    <div className={cn("absolute inset-x-0 bottom-3 z-10 flex justify-end gap-2 px-3", className)}>
      <Button
        variant="blank"
        size={isMobile ? "icon-xs" : "icon-sm"}
        rounded="full"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onPreview();
        }}
        aria-label={lang({ ko: "이미지 크게 보기", en: "View larger image" })}
        className={buttonBaseClassName}
      >
        <Eye className={cn(isMobile ? "h-3.5 w-3.5" : "icon-xs")} />
        <span className="sr-only">
          <Lang text={{ ko: "이미지 크게 보기", en: "View larger image" }} />
        </span>
      </Button>

      {onOpenTemplate && (
        <Button
          variant="blank"
          size={isMobile ? "icon-xs" : "icon-sm"}
          rounded="full"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onOpenTemplate();
          }}
          aria-label={lang({ ko: "해당 템플릿 열기", en: "Open this template" })}
          className={buttonBaseClassName}
        >
          <Link2 className={cn(isMobile ? "h-3.5 w-3.5" : "icon-xs")} />
          <span className="sr-only">
            <Lang text={{ ko: "해당 템플릿 열기", en: "Open this template" }} />
          </span>
        </Button>
      )}
    </div>
  );
}
