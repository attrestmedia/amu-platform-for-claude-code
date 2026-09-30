"use client";

import { Coins, Sparkles } from "lucide-react";
import { Button } from "@amu-labs/ui";
import { Lang } from "components/module/i18n";
import type { CharacterStarterPresetType } from "consts/game/characterStarterPresets";

export function MethodStarterPresets({
  presets,
  previews,
  activeKey,
  onGenerate,
}: {
  presets: CharacterStarterPresetType[];
  previews: Record<string, string>;
  activeKey: string;
  onGenerate: (preset: CharacterStarterPresetType) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {presets.map((preset) => (
        <article key={preset.key} className="overflow-hidden rounded-xl border border-border bg-background">
          <div
            className="flex aspect-[4/3] items-center justify-center bg-muted bg-cover bg-center"
            style={previews[preset.key] ? { backgroundImage: `url("${previews[preset.key].replace(/"/g, "%22")}")` } : undefined}
          >
            {!previews[preset.key] ? <Sparkles className="size-10 text-primary/50" aria-hidden /> : null}
          </div>
          <div className="space-y-3 p-4">
            <div>
              <h3 className="font-semibold"><Lang text={preset.label} /></h3>
              <p className="mt-1 text-xs leading-5 text-secondary-text"><Lang text={preset.description} /></p>
            </div>
            <p className="flex items-center gap-1 text-xs text-secondary-text">
              <Coins className="size-3.5 text-[color:var(--coin)]" aria-hidden />
              <Lang text={{ ko: "실행 전 서버 견적 확인", en: "Server quote before run" }} />
            </p>
            <Button className="min-h-11 w-full" onClick={() => onGenerate(preset)} loading={activeKey === preset.key} disabled={Boolean(activeKey)}>
              <Lang text={{ ko: "이 스타일로 만들기", en: "Create this style" }} />
            </Button>
          </div>
        </article>
      ))}
    </div>
  );
}
