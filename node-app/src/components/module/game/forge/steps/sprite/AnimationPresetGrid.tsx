"use client";

import { Check, Clock3, Coins, Flag, Shield, Sparkles } from "lucide-react";
import { Badge } from "@amu-labs/ui";
import { Lang } from "components/module/i18n";
import { cn } from "utils/common";

export type AnimationPresetKey = "idle" | "walk" | "run" | "attack" | "hit" | "die";

type AnimationPreset = {
  key: AnimationPresetKey;
  label: { ko: string; en: string };
  description: { ko: string; en: string };
  icon: typeof Sparkles;
  disabled?: boolean;
  disabledReason?: { ko: string; en: string };
};

export const ANIMATION_PRESETS: AnimationPreset[] = [
  {
    key: "idle",
    label: { ko: "대기", en: "Idle" },
    description: { ko: "기본 대기 동작", en: "Default idle pose" },
    icon: Clock3,
    disabled: true,
    disabledReason: { ko: "준비 중", en: "Coming soon" },
  },
  {
    key: "walk",
    label: { ko: "걷기", en: "Walk" },
    description: { ko: "월드 이동에 필요한 기본 동작", en: "Required movement animation" },
    icon: Sparkles,
  },
  {
    key: "run",
    label: { ko: "뛰기", en: "Run" },
    description: { ko: "빠른 이동에 사용하는 반복 동작", en: "Loop for fast movement" },
    icon: Sparkles,
  },
  {
    key: "attack",
    label: { ko: "공격하기", en: "Attack" },
    description: { ko: "준비·타격·회복이 보이는 동작", en: "Readable windup, strike, and recovery" },
    icon: Shield,
  },
  {
    key: "hit",
    label: { ko: "피격", en: "Hit" },
    description: { ko: "피격 반응 동작", en: "Hit reaction" },
    icon: Shield,
    disabled: true,
    disabledReason: { ko: "준비 중", en: "Coming soon" },
  },
  {
    key: "die",
    label: { ko: "쓰러지기", en: "Die" },
    description: { ko: "피격 후 쓰러지는 동작", en: "Hit and fall sequence" },
    icon: Flag,
  },
];

export function AnimationPresetGrid({
  selectedAction,
  walkReady,
  actionQuotes,
  busy = false,
  onSelect,
}: {
  selectedAction: AnimationPresetKey;
  walkReady: boolean;
  actionQuotes?: Partial<Record<"run" | "attack", number>>;
  busy?: boolean;
  onSelect: (action: AnimationPresetKey) => void;
}) {
  return (
    <section aria-labelledby="animation-preset-heading" className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Lang text={{ ko: "STEP 3", en: "STEP 3" }} />
          </p>
          <h2 id="animation-preset-heading" className="mt-1 text-lg font-semibold">
            <Lang text={{ ko: "애니메이션 프리셋", en: "Animation presets" }} />
          </h2>
        </div>
        <p className="text-xs text-muted-foreground">
          <Lang text={{ ko: "하나를 선택해 생성 상태를 확인하세요.", en: "Choose one to review its generation status." }} />
        </p>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
        {ANIMATION_PRESETS.map((preset) => {
          const Icon = preset.icon;
          const isSelected = selectedAction === preset.key;
          const isWalkReady = preset.key === "walk" && walkReady;
          const quote = preset.key === "run" || preset.key === "attack" ? actionQuotes?.[preset.key] : undefined;

          return (
            <button
              key={preset.key}
              type="button"
              className={cn(
                "group flex min-h-[96px] flex-col items-center justify-center gap-1.5 rounded-xl border bg-background/60 px-2 py-3 text-center transition-colors focus-visible-ring motion-reduce:transition-none",
                isSelected && "border-primary bg-primary/10",
                !isSelected && "border-border hover:border-primary/50 hover:bg-primary/5",
                preset.disabled && "cursor-not-allowed opacity-45 hover:border-border hover:bg-background/60",
              )}
              disabled={preset.disabled || busy}
              aria-disabled={preset.disabled || undefined}
              aria-pressed={isSelected}
              aria-label={langLabel(preset.label)}
              onClick={() => onSelect(preset.key)}
            >
              <span className={cn("flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground", isSelected && "text-primary")}>
                {isWalkReady ? <Check className="size-5 text-accent" aria-hidden /> : <Icon className="size-5" aria-hidden />}
              </span>
              <span className="text-xs font-medium text-primary-text"><Lang text={preset.label} /></span>
              {preset.disabled ? (
                <Badge variant="secondary" size="sm" className="text-[10px]">
                  <Lang text={preset.disabledReason || { ko: "준비 중", en: "Coming soon" }} />
                </Badge>
              ) : isWalkReady ? (
                <span className="text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                  <Lang text={{ ko: "생성 완료", en: "Ready" }} />
                </span>
              ) : typeof quote === "number" && Number.isFinite(quote) ? (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                  <Coins className="size-3" aria-hidden />{quote.toLocaleString()}c
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-xs leading-5 text-muted-foreground">
        <Lang
          text={{
            ko: "현재 사용자 생성 경로는 걷기 시트를 먼저 지원합니다. 추가 동작은 서버 계약이 열리면 같은 화면에서 이어집니다.",
            en: "The user generation path currently starts with the walk sheet. Additional actions will continue here when their server contracts are available.",
          }}
        />
      </p>
    </section>
  );
}

function langLabel(label: { ko: string; en: string }) {
  return `${label.ko} / ${label.en}`;
}
