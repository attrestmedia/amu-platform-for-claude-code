"use client";

import Image from "next/image";
import type { IPersonaSprite } from "types/ai";
import type { DirectionBaseType } from "types/game";
import { SpriteSheetPreview } from "components/module/game";
import { cn } from "utils/common";

interface CharacterSpriteAvatarProps {
  sprite?: IPersonaSprite | null;
  portraitSrc?: string | null;
  alt: string;
  direction?: DirectionBaseType;
  sequenceIndex?: number;
  className?: string;
  imageClassName?: string;
  onClick?: () => void;
}

export function CharacterSpriteAvatar({
  sprite,
  portraitSrc,
  alt,
  direction = "down",
  sequenceIndex = 0,
  className,
  imageClassName,
  onClick,
}: CharacterSpriteAvatarProps) {
  const baseClassName = cn(
    "relative block overflow-hidden bg-white/10",
    onClick && "cursor-pointer active:opacity-80 transition-opacity",
    className,
  );

  if (sprite?.url) {
    return (
      <SpriteSheetPreview
        sprite={sprite}
        direction={direction}
        sequenceIndex={sequenceIndex}
        alt={alt}
        className={baseClassName}
        imageClassName={imageClassName}
        onClick={onClick}
      />
    );
  }

  if (portraitSrc) {
    return (
      <span className={baseClassName} onClick={onClick}>
        <Image src={portraitSrc} alt={alt} fill className={cn("object-cover", imageClassName)} sizes="96px" />
      </span>
    );
  }

  return <span className={baseClassName} onClick={onClick} aria-label={alt} />;
}
