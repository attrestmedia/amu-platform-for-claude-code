"use client";

import { Check } from "lucide-react";
import { Lang } from "components/module/i18n";
import type { ForgeSummary } from "libs/api/game/forgeSummaryClient";
import { cn } from "utils/common";

type Preset = {
  key: string;
  label: string;
  disabled?: boolean;
  checkWhenDone?: boolean;
};

// D5 매핑: Idle/Hit는 미보유(준비 중), Walk는 파이프라인 완료 시 체크, Run/Attack은 추가 생성(코인).
const PRESETS: Preset[] = [
  { key: "idle", label: "Idle", disabled: true },
  { key: "walk", label: "Walk", checkWhenDone: true },
  { key: "run", label: "Run" },
  { key: "attack", label: "Attack" },
  { key: "hit", label: "Hit", disabled: true },
  { key: "die", label: "Die" },
];

/** STEP3 카드 미리보기 — 히어로 + 애니메이션 프리셋 3×2 그리드. */
export function StepCardSprite({ summary }: { summary: ForgeSummary | undefined }) {
  const spriteDone = Boolean(summary?.characters.latest?.characterId && summary?.stepStatus?.step3 === "done");

  return (
    <div className="flex flex-col gap-2.5">
      {/* 히어로 이미지 (없으면 기본 일러스트) */}
      <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-[10px] bg-surface-2 text-muted-text">
        <span className="text-[11px]">
          <Lang text={{ ko: "스프라이트 미리보기", en: "Sprite preview" }} />
        </span>
      </div>

      {/* 애니메이션 프리셋 3×2 */}
      <div>
        <p className="text-[11px] font-semibold text-muted-text">
          <Lang text={{ ko: "애니메이션 프리셋", en: "Animation presets" }} />
        </p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {PRESETS.map((preset) => {
            const done = preset.checkWhenDone && spriteDone;
            return (
              <span
                key={preset.key}
                aria-disabled={preset.disabled || undefined}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-[9px] border border-border bg-surface-2 px-2 py-2",
                  preset.disabled && "opacity-45",
                )}
              >
                <span className="flex h-8 w-8 items-center justify-center rounded bg-surface text-muted-text">
                  {done ? <Check className="h-4 w-4 text-accent" aria-hidden /> : null}
                </span>
                <span className="text-[10px] font-medium text-secondary-text">{preset.label}</span>
                {preset.disabled ? (
                  <span className="rounded bg-surface px-1 text-[9px] text-muted-text">
                    <Lang text={{ ko: "준비 중", en: "Soon" }} />
                  </span>
                ) : null}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
