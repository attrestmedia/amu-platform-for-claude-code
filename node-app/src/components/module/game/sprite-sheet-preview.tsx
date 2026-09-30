"use client";

import type { CSSProperties } from "react";
import type { IPersonaSprite, PersonaSpriteDirection } from "types/ai";
import { cn } from "utils/common";
import { getSpritePreviewStyle } from "utils/game";

interface SpriteSheetPreviewProps {
  sprite?: IPersonaSprite | null;
  direction?: PersonaSpriteDirection;
  sequenceIndex?: number;
  alt?: string;
  className?: string;
  imageClassName?: string;
  onClick?: () => void;
}

export function SpriteSheetPreview({
  sprite,
  direction = "down",
  sequenceIndex = 0,
  alt = "",
  className,
  imageClassName,
  onClick,
}: SpriteSheetPreviewProps) {
  const style = getSpritePreviewStyle({ sprite, direction, sequenceIndex });

  if (!style) {
    return (
      <span
        className={cn(
          "relative block overflow-hidden rounded-full bg-white/10 border border-white/10",
          className,
          onClick && "cursor-pointer active:opacity-80 transition-opacity",
        )}
        onClick={onClick}
      />
    );
  }

  return (
    <span
      role="img"
      aria-label={alt}
      className={cn("relative block overflow-hidden", className, onClick && "cursor-pointer active:opacity-80 transition-opacity")}
      onClick={onClick}
    >
      <span
        className={cn("absolute inset-0 block", imageClassName)}
        style={style as CSSProperties}
      />
    </span>
  );
}
