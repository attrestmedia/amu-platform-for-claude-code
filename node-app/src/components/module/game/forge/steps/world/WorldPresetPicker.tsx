"use client";

import { Box, Coins, Grid3x3, Hexagon, Home, Layers, Sparkles, Star, Triangle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import {
  WORLD_ASSET_CATEGORY_PRESETS,
  WORLD_ASSET_CATEGORIES,
  type WorldAssetCategoryKey,
  type WorldAssetPresetType,
} from "consts/game/worldAssetCatalog";
import type { WorldAssetGenerationQuote } from "libs/api/game";

const PREVIEW_ICONS: Record<WorldAssetCategoryKey, LucideIcon> = {
  building: Home,
  terrain: Layers,
  tree: Triangle,
  rock: Hexagon,
  decor: Star,
  object: Box,
  tile: Grid3x3,
  effect: Sparkles,
  etc: Sparkles,
};

const PREVIEW_TONES: Record<WorldAssetCategoryKey, string> = {
  building: "from-primary/35 via-primary/10 to-accent/20",
  terrain: "from-accent/30 via-accent/10 to-primary/15",
  tree: "from-accent/25 via-primary/10 to-accent/15",
  rock: "from-secondary/25 via-primary/10 to-primary/20",
  decor: "from-primary-sub/25 via-primary/10 to-accent/15",
  object: "from-secondary/20 via-primary/10 to-accent/15",
  tile: "from-primary-sub/20 via-primary/10 to-accent/15",
  effect: "from-primary/20 to-accent/20",
  etc: "from-primary/20 to-accent/20",
};

export function WorldPresetPicker({
  categoryKey,
  selectedPresetKey,
  quote,
  quoteLoading,
  onSelect,
}: {
  categoryKey: Exclude<WorldAssetCategoryKey, "effect" | "etc">;
  selectedPresetKey: string;
  quote?: WorldAssetGenerationQuote;
  quoteLoading?: boolean;
  onSelect: (preset: WorldAssetPresetType) => void;
}) {
  const presets = WORLD_ASSET_CATEGORY_PRESETS[categoryKey];
  const category = WORLD_ASSET_CATEGORIES.find((item) => item.key === categoryKey);
  const PreviewIcon = PREVIEW_ICONS[categoryKey];

  return (
    <section aria-labelledby="world-asset-preset-title">
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="world-asset-preset-title" className="text-sm font-semibold text-primary-text">
            <Lang text={{ ko: `${category?.label.ko || "월드"} 프리셋`, en: `${category?.label.en || "World"} presets` }} />
          </h2>
          <p className="mt-1 text-xs text-secondary-text">
            <Lang text={{ ko: "프리셋을 고르면 서버가 최신 모델 견적을 확인합니다.", en: "Selecting a preset checks the latest server model quote." }} />
          </p>
        </div>
        <span className="text-xs text-secondary-text">
          <Lang text={{ ko: "최대 1장 생성", en: "Up to 1 image" }} />
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {presets.map((preset) => {
          const selected = selectedPresetKey === preset.key;
          const isQuoted = quote?.categoryKey === categoryKey && quote.presetKey === preset.key;

          return (
            <article key={preset.key} className={`overflow-hidden rounded-xl border bg-surface transition-[border-color,box-shadow] motion-reduce:transition-none ${selected ? "border-primary ring-1 ring-primary/30" : "border-border"}`}>
              <div className={`relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-gradient-to-br ${PREVIEW_TONES[categoryKey]}`} aria-label={lang({ ko: `${preset.label.ko} 예시 이미지`, en: `${preset.label.en} example preview` })}>
                <div className="absolute inset-0 opacity-35 [background-image:linear-gradient(135deg,transparent_25%,currentColor_25%,currentColor_26%,transparent_26%,transparent_75%,currentColor_75%,currentColor_76%,transparent_76%)] [background-size:24px_24px] text-primary" aria-hidden />
                <div className="relative flex size-16 items-center justify-center rounded-2xl border border-border/70 bg-background/65 text-primary shadow-lg backdrop-blur-sm">
                  <PreviewIcon className="size-8" aria-hidden />
                </div>
                <span className="absolute bottom-2 left-2 rounded-full border border-white/15 bg-background/75 px-2 py-1 text-[10px] font-medium text-primary-text">
                  <Lang text={{ ko: "AI 예시", en: "AI preview" }} />
                </span>
              </div>
              <div className="space-y-3 p-4">
                <div>
                  <h3 className="font-semibold text-primary-text"><Lang text={preset.label} /></h3>
                  <p className="mt-1 text-xs leading-5 text-secondary-text">
                    <Lang text={preset.description} />
                  </p>
                </div>
                <p className="flex min-h-5 items-center gap-1 text-xs text-secondary-text" aria-live="polite">
                  <Coins className="size-3.5 text-[color:var(--coin)]" aria-hidden />
                  {isQuoted ? `${quote.quotedCoins.toLocaleString()} 코인 · 서버 견적` : quoteLoading && selected ? "견적 확인 중…" : "실행 전 서버 견적 확인"}
                </p>
                <Button className="min-h-11 w-full" variant={selected ? "primary" : "outline"} onClick={() => onSelect(preset)} loading={quoteLoading && selected}>
                  <Lang text={{ ko: selected ? "이 프리셋 선택됨" : "이 스타일 선택", en: selected ? "Preset selected" : "Choose this style" }} />
                </Button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
