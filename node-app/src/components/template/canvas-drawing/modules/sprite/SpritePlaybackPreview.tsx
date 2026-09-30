"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Pause, Play } from "lucide-react";
import { Lang, lang } from "components/module/i18n";
import { Button } from "@amu-labs/ui";
import { SpriteSheetPreview } from "components/module/game";
import type { IPersonaSprite, PersonaSpriteDirection } from "types/ai";

export function SpritePlaybackPreview({
  sprite,
  direction,
}: {
  sprite: IPersonaSprite;
  direction: PersonaSpriteDirection;
}) {
  const frames = sprite.animations?.[direction]?.frames || [];
  const [sequenceIndex, setSequenceIndex] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(
    function followReducedMotionPreference() {
      const media = window.matchMedia("(prefers-reduced-motion: reduce)");
      const update = () => setPlaying(!media.matches);
      update();
      media.addEventListener?.("change", update);
      return () => media.removeEventListener?.("change", update);
    },
    [],
  );

  useEffect(
    function cycleFrames() {
      if (!playing || frames.length < 2) return;
      const fps = Math.max(1, Math.min(24, Number(sprite.fps || 8)));
      const timer = window.setInterval(
        () => setSequenceIndex((current) => (current + 1) % frames.length),
        Math.round(1000 / fps),
      );
      return () => window.clearInterval(timer);
    },
    [frames.length, playing, sprite.fps],
  );

  const move = (delta: number) => {
    setPlaying(false);
    setSequenceIndex((current) => (current + delta + Math.max(1, frames.length)) % Math.max(1, frames.length));
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background p-2">
      <SpriteSheetPreview
        sprite={sprite}
        direction={direction}
        sequenceIndex={sequenceIndex}
        className="size-20 shrink-0 rounded-md border border-border bg-white"
        imageClassName="bg-white"
        alt={lang({ ko: `${direction} 스프라이트 미리보기`, en: `${direction} sprite preview` })}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="icon-md"
          className="min-h-11 min-w-11"
          aria-label={lang({ ko: "이전 프레임", en: "Previous frame" })}
          disabled={frames.length < 2}
          onClick={() => move(-1)}
        >
          <ArrowLeft className="size-4" aria-hidden />
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="min-h-11"
          aria-pressed={playing}
          disabled={frames.length < 2}
          onClick={() => setPlaying((current) => !current)}
        >
          {playing ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
          {playing ? <Lang text={{ ko: "일시정지", en: "Pause" }} /> : <Lang text={{ ko: "재생", en: "Play" }} />}
        </Button>
        <Button
          variant="outline"
          size="icon-md"
          className="min-h-11 min-w-11"
          aria-label={lang({ ko: "다음 프레임", en: "Next frame" })}
          disabled={frames.length < 2}
          onClick={() => move(1)}
        >
          <ArrowRight className="size-4" aria-hidden />
        </Button>
        <span className="text-xs tabular-nums text-muted-foreground">
          {Math.min(sequenceIndex + 1, Math.max(1, frames.length))}/{Math.max(1, frames.length)}
        </span>
      </div>
    </div>
  );
}
