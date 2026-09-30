"use client";

import { Check, Images, User } from "lucide-react";
import { Lang } from "components/module/i18n";

export type CharacterRegisterSource = {
  key: string;
  sourceType: "gen-studio" | "tutors-profile" | "new" | "upload";
  assetId?: string;
  personaId?: string;
  url: string;
  label: string;
  speciesId?: "human" | "monster";
};

export function MethodTemplateGrid({
  sources,
  selectedKey,
  failedKeys,
  onSelect,
}: {
  sources: CharacterRegisterSource[];
  selectedKey: string;
  failedKeys?: Set<string>;
  onSelect: (source: CharacterRegisterSource) => void;
}) {
  if (!sources.length) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-background p-6 text-center">
        <Images className="mx-auto size-8 text-secondary-text" aria-hidden />
        <p className="mt-3 text-sm font-medium"><Lang text={{ ko: "캐릭터로 쓸 이미지를 아직 찾지 못했어요", en: "No character-ready images yet" }} /></p>
        <p className="mt-1 text-xs text-secondary-text"><Lang text={{ ko: "새로 만들기나 업로드를 이용해 시작해 보세요.", en: "Start with a new character or upload." }} /></p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {sources.slice(0, 12).map((source) => {
        const failed = Boolean(source.assetId && failedKeys?.has(source.assetId));
        return (
          <button
            key={source.key}
            type="button"
            onClick={() => onSelect(source)}
            aria-pressed={selectedKey === source.key}
            aria-label={source.label}
            className={`group relative min-h-11 overflow-hidden rounded-xl border bg-surface text-left transition-colors motion-reduce:transition-none ${
              selectedKey === source.key ? "border-primary ring-2 ring-primary/25" : "border-border hover:border-primary/60"
            }`}
          >
            <span className="relative block aspect-square w-full bg-muted bg-cover bg-center" style={{ backgroundImage: `url("${source.url.replace(/"/g, "%22")}")` }}>
              {source.sourceType === "tutors-profile" ? (
                <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-background/90 px-2 py-1 text-xxs font-medium">
                  <User className="size-3" aria-hidden />
                  <Lang text={{ ko: "프로필", en: "Profile" }} />
                </span>
              ) : null}
              {failed ? <span className="absolute left-2 top-2 rounded bg-danger px-2 py-1 text-xxs font-semibold text-white"><Lang text={{ ko: "이전 실패", en: "Failed before" }} /></span> : null}
            </span>
            <span className="flex min-h-11 items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className="truncate">{source.label}</span>
              {selectedKey === source.key ? <Check className="size-4 shrink-0 text-primary" aria-hidden /> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
