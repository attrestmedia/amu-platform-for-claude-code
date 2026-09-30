"use client";

import { Box, Grid3x3, Hexagon, Home, Layers, MoreHorizontal, Sparkles, Star, Triangle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Lang } from "components/module/i18n";
import type { ForgeSummary } from "libs/api/game/forgeSummaryClient";
import type { ForgeLocalizedText } from "../../model/forgeGlossary";
import { cn } from "utils/common";

const CATEGORIES: Array<{ key: string; label: ForgeLocalizedText; icon: LucideIcon; disabled?: boolean }> = [
  { key: "building", label: { ko: "건물", en: "Building" }, icon: Home },
  { key: "terrain", label: { ko: "지형", en: "Terrain" }, icon: Layers },
  { key: "tree", label: { ko: "나무", en: "Tree" }, icon: Triangle },
  { key: "rock", label: { ko: "바위", en: "Rock" }, icon: Hexagon },
  { key: "decor", label: { ko: "장식", en: "Decor" }, icon: Star },
  { key: "object", label: { ko: "오브젝트", en: "Object" }, icon: Box },
  { key: "tile", label: { ko: "타일", en: "Tile" }, icon: Grid3x3 },
  { key: "effect", label: { ko: "효과", en: "Effect" }, icon: Sparkles, disabled: true },
  { key: "etc", label: { ko: "기타", en: "Other" }, icon: MoreHorizontal, disabled: true },
];

/** STEP4 카드 미리보기 — 9칸 카테고리 그리드 + 보유 수 배지. */
export function StepCardWorld({ summary }: { summary: ForgeSummary | undefined }) {
  const byCategory = summary?.assets.byCategory || {};

  return (
    <div className="grid grid-cols-3 grid-rows-3 gap-2">
      {CATEGORIES.map((category) => {
        const count = byCategory[category.key] || 0;
        return (
          <span
            key={category.key}
            aria-disabled={category.disabled || undefined}
            className={cn(
              "relative flex flex-col items-center gap-1 rounded-[9px] border border-border bg-surface-2 px-2 py-2.5",
              category.disabled && "opacity-45",
            )}
          >
            {count > 0 ? (
              <span className="absolute right-1.5 top-1.5 rounded bg-primary px-1 text-[9px] font-semibold text-primary-foreground">
                {count}
              </span>
            ) : null}
            <category.icon className="h-6 w-6 text-secondary-text" aria-hidden />
            <span className="text-[11px] font-medium text-secondary-text">
              <Lang text={category.label} />
            </span>
            {category.disabled ? (
              <span className="text-[9px] text-muted-text">
                <Lang text={{ ko: "준비 중", en: "Soon" }} />
              </span>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}
