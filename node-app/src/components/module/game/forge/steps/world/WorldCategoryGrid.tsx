"use client";

import { Box, Grid3x3, Hexagon, Home, Layers, MoreHorizontal, Sparkles, Star, Triangle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Lang } from "components/module/i18n";
import {
  WORLD_ASSET_CATEGORIES,
  type WorldAssetCategoryKey,
} from "consts/game/worldAssetCatalog";

const CATEGORY_ICONS: Record<WorldAssetCategoryKey, LucideIcon> = {
  building: Home,
  terrain: Layers,
  tree: Triangle,
  rock: Hexagon,
  decor: Star,
  object: Box,
  tile: Grid3x3,
  effect: Sparkles,
  etc: MoreHorizontal,
};

export function WorldCategoryGrid({
  selectedKey,
  counts = {},
  onSelect,
}: {
  selectedKey: WorldAssetCategoryKey;
  counts?: Partial<Record<WorldAssetCategoryKey, number>>;
  onSelect: (key: WorldAssetCategoryKey) => void;
}) {
  return (
    <section aria-labelledby="world-asset-category-title">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 id="world-asset-category-title" className="text-sm font-semibold text-primary-text">
            <Lang text={{ ko: "카테고리", en: "Category" }} />
          </h2>
          <p className="mt-1 text-xs text-secondary-text">
            <Lang text={{ ko: "만들고 싶은 월드 요소를 고르세요.", en: "Choose the world element you want to create." }} />
          </p>
        </div>
        <span className="text-xs text-secondary-text" aria-live="polite">
          <Lang text={{ ko: "7개 생성 가능", en: "7 available" }} />
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
        {WORLD_ASSET_CATEGORIES.map((category) => {
          const Icon = CATEGORY_ICONS[category.key];
          const deferred = category.key === "effect" || category.key === "etc";
          const count = counts[category.key] || 0;
          const selected = selectedKey === category.key;

          return (
            <button
              key={category.key}
              type="button"
              disabled={deferred}
              aria-pressed={selected}
              aria-label={`${category.label.ko}${deferred ? " (준비 중)" : ""}`}
              className={`relative flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-xl border px-2 py-3 text-center transition-[border-color,background-color,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none motion-reduce:hover:transform-none ${
                deferred
                  ? "cursor-not-allowed border-border bg-surface-2 opacity-45"
                  : selected
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-surface hover:-translate-y-0.5 hover:border-primary/60 hover:bg-surface-2"
              }`}
              onClick={() => onSelect(category.key)}
            >
              {count > 0 ? (
                <span className="absolute right-1.5 top-1.5 rounded bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                  {count}
                </span>
              ) : null}
              <Icon className="size-5" aria-hidden />
              <span className="text-xs font-semibold"><Lang text={category.label} /></span>
              {deferred ? (
                <span className="text-[10px] text-muted-text"><Lang text={{ ko: "준비 중", en: "Soon" }} /></span>
              ) : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}
