"use client";

import { Button } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import { Lock, Unlock } from "lucide-react";
import { cn } from "utils/common";
import type { PromptVisibilityType } from "types/app";

type Props = {
  visibility: PromptVisibilityType;
  onToggle?: (next: PromptVisibilityType) => void | Promise<void>;
  disabled?: boolean;
  size?: "icon-xs" | "icon-sm";
  className?: string;
};

export function VisibilityIconButton({ visibility, onToggle, disabled, size = "icon-sm", className }: Props) {
  const isPublic = visibility === "public";
  const next = isPublic ? "private" : "public";
  const iconSize = size === "icon-sm" ? "icon-xs" : "h-3 w-3";

  return (
    <Button
      variant="blank"
      rounded="full"
      size={size}
      disabled={disabled}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!disabled) void onToggle?.(next);
      }}
      aria-label={
        isPublic
          ? lang({ ko: "공개 상태, 클릭하면 비공개", en: "Public, click for private" })
          : lang({ ko: "비공개 상태, 클릭하면 공개", en: "Private, click for public" })
      }
      className={cn("bg-black/30 text-white hover:bg-black/60 disabled:opacity-60 disabled:bg-transparent", className)}
    >
      {isPublic ? <Unlock className={iconSize} /> : <Lock className={iconSize} />}
      <span className="sr-only">
        <Lang text={isPublic ? { ko: "공개", en: "Public" } : { ko: "비공개", en: "Private" }} />
      </span>
    </Button>
  );
}
