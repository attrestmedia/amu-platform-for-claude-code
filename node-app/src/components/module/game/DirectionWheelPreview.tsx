"use client";

import { useEffect, useState } from "react";
import { SPRITE_FRAME_COUNTS, SPRITE_SHEET_V2_CONTRACT } from "consts/game/gameAssetTemplates";
import { Lang } from "components/module/i18n";
import { cn } from "utils/common";
import { Pause, Play } from "lucide-react";

const FRAME_INTERVAL_MS = 160;
const WHEEL_LAYOUT: Array<string | null> = [
  "up-left",
  "up",
  "up-right",
  "left",
  null,
  "right",
  "down-left",
  "down",
  "down-right",
];
const DIRECTION_LABEL: Record<string, string> = {
  down: "↓",
  up: "↑",
  left: "←",
  right: "→",
  "down-left": "↙",
  "up-left": "↖",
  "up-right": "↗",
  "down-right": "↘",
};

/**
 * @docHint
 * @purpose 합성 시트의 8방향 walk 프레임을 사용자·관리자 화면에서 동일 계약으로 미리보기
 * @process v2 rowOrder로 셀 좌표 산출  프레임 순환  방향 휠 선택
 * @domain game.asset-pipeline
 * @scope shared-client
 */
export function DirectionWheelPreview({
  sheetUrl,
  frameCount = 4,
  className,
}: {
  sheetUrl: string;
  frameCount?: number;
  className?: string;
}) {
  const [direction, setDirection] = useState<string>("down");
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const columns = (SPRITE_FRAME_COUNTS as readonly number[]).includes(Number(frameCount))
    ? Number(frameCount)
    : 4;
  const { rows, rowOrder } = SPRITE_SHEET_V2_CONTRACT;
  const row = Math.max(0, (rowOrder as readonly string[]).indexOf(direction));
  const visibleFrame = frame % columns;

  useEffect(function followReducedMotionPreference() {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setPlaying(!media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  useEffect(function cycleWalkFrames() {
    if (!playing) return;
    const timer = window.setInterval(() => setFrame((prev) => (prev + 1) % columns), FRAME_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [columns, playing]);

  if (!sheetUrl) return null;

  return (
    <div className={cn("flex flex-col items-center gap-3 sm:flex-row sm:items-start", className)}>
      <span
        role="img"
        aria-label={`sprite preview ${direction}`}
        className="block h-32 w-32 shrink-0 overflow-hidden rounded-lg border border-border bg-surface"
        style={{
          backgroundImage: `url(${sheetUrl})`,
          backgroundRepeat: "no-repeat",
          backgroundSize: `${columns * 100}% ${rows * 100}%`,
          backgroundPosition: `${(visibleFrame / (columns - 1)) * 100}% ${(row / (rows - 1)) * 100}%`,
          imageRendering: "pixelated",
        }}
      />
      <div className="grid w-36 grid-cols-3 gap-1">
        {WHEEL_LAYOUT.map((dir, index) =>
          dir ? (
            <button
              key={dir}
              type="button"
              onClick={() => setDirection(dir)}
              className={cn(
                "flex h-11 items-center justify-center rounded-md border text-sm transition-colors",
                direction === dir
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-surface hover:bg-muted",
              )}
              aria-label={dir}
            >
              {DIRECTION_LABEL[dir]}
            </button>
          ) : (
            <span
              key={`center-${index}`}
              className="flex h-11 items-center justify-center text-[10px] text-muted-foreground"
            >
              <Lang text={{ ko: "8방향", en: "8-dir" }} />
            </span>
          ),
        )}
      </div>
      <button
        type="button"
        className="flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md border border-border bg-surface px-3 text-sm transition-colors hover:bg-muted focus-visible-ring"
        aria-pressed={playing}
        onClick={() => setPlaying((current) => !current)}
      >
        {playing ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
        {playing ? <Lang text={{ ko: "일시정지", en: "Pause" }} /> : <Lang text={{ ko: "재생", en: "Play" }} />}
      </button>
    </div>
  );
}
