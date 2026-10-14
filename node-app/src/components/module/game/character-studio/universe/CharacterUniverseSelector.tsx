"use client";

import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import type { CharacterUniverseListData } from "types/game/characterUniverse";

type Props = {
  data?: CharacterUniverseListData;
  isLoading: boolean;
  isError: boolean;
  selectedUniverseId: string | null;
  onSelect: (universeId: string) => void;
  onRetry: () => void;
};

type EntryRejection = NonNullable<CharacterUniverseListData["entryRejected"]>;

const ENTRY_REJECTION_MESSAGES: Record<EntryRejection, { ko: string; en: string }> = {
  UNIVERSE_NOT_FOUND: {
    ko: "링크에 포함된 유니버스를 찾지 못했습니다. 아래에서 사용할 유니버스를 선택하세요.",
    en: "The universe in this link could not be found. Choose a universe below.",
  },
  UNIVERSE_NOT_GAME: {
    ko: "이 유니버스에서는 캐릭터를 등록할 수 없습니다. 사용할 유니버스를 선택하세요.",
    en: "Characters cannot be registered in this universe. Choose another universe.",
  },
  UNIVERSE_DISABLED: {
    ko: "이 유니버스는 현재 사용할 수 없습니다. 사용할 유니버스를 선택하세요.",
    en: "This universe is currently unavailable. Choose another universe.",
  },
};

export function CharacterUniverseSelector({
  data,
  isLoading,
  isError,
  selectedUniverseId,
  onSelect,
  onRetry,
}: Props) {
  const universes = data?.universes || [];
  const selectedUniverse = universes.find((option) => option.universeId === selectedUniverseId);

  if (isLoading) {
    return (
      <section className="space-y-3 rounded-xl border border-border bg-surface p-4" aria-labelledby="character-universe-title">
        <h2 id="character-universe-title" className="text-sm font-semibold">
          <Lang text={{ ko: "등록할 유니버스", en: "Universe for this character" }} />
        </h2>
        <div className="space-y-2" role="status" aria-live="polite">
          <Skeleton className="h-11 w-full motion-reduce:animate-none" />
          <p className="text-xs text-secondary-text">
            <Lang text={{ ko: "접근할 수 있는 유니버스를 확인하고 있어요.", en: "Checking which universes you can use..." }} />
          </p>
        </div>
      </section>
    );
  }

  if (isError || !data) {
    return (
      <section className="space-y-3 rounded-xl border border-danger/40 bg-danger/5 p-4" aria-labelledby="character-universe-title">
        <h2 id="character-universe-title" className="text-sm font-semibold">
          <Lang text={{ ko: "유니버스를 불러오지 못했습니다", en: "Could not load universes" }} />
        </h2>
        <p className="text-sm text-secondary-text" role="alert">
          <Lang
            text={{
              ko: "네트워크 상태를 확인한 뒤 다시 시도해 주세요.",
              en: "Check your connection and try again.",
            }}
          />
        </p>
        <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={onRetry}>
          <Lang text={{ ko: "다시 시도", en: "Try again" }} />
        </Button>
      </section>
    );
  }

  if (universes.length === 0) {
    return (
      <section className="space-y-2 rounded-xl border border-dashed border-border bg-surface p-4" aria-labelledby="character-universe-title">
        <h2 id="character-universe-title" className="text-sm font-semibold">
          <Lang text={{ ko: "사용할 수 있는 유니버스가 없습니다", en: "No available universe" }} />
        </h2>
        {data.entryRejected ? (
          <p className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm leading-6 text-primary-text" role="status" aria-live="polite">
            <Lang text={ENTRY_REJECTION_MESSAGES[data.entryRejected]} />
          </p>
        ) : null}
        <p className="text-sm leading-6 text-secondary-text" role="status" aria-live="polite">
          <Lang
            text={{
              ko: "캐릭터를 등록할 수 있는 게임 유니버스에 접근할 수 있는지 확인해 주세요.",
              en: "Make sure you have access to a playable game universe before registering a character.",
            }}
          />
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded-xl border border-border bg-surface p-4" aria-labelledby="character-universe-title">
      <div>
        <h2 id="character-universe-title" className="text-sm font-semibold">
          <Lang text={{ ko: "등록할 유니버스", en: "Universe for this character" }} />
        </h2>
        {data.entryRejected ? (
          <p className="mt-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm leading-6 text-primary-text" role="status" aria-live="polite">
            <Lang text={ENTRY_REJECTION_MESSAGES[data.entryRejected]} />
          </p>
        ) : null}
      </div>

      {universes.length > 1 ? (
        <div className="space-y-2">
          <label htmlFor="character-universe-select" className="text-sm font-medium">
            <Lang text={{ ko: "유니버스 선택", en: "Choose a universe" }} />
          </label>
          <Select
            value={selectedUniverse?.universeId || undefined}
            onValueChange={(value) => {
              if (typeof value === "string") onSelect(value);
            }}
          >
            <SelectTrigger id="character-universe-select" className="min-h-11 w-full">
              <SelectValue placeholder={lang({ ko: "유니버스를 선택하세요", en: "Select a universe" })} />
            </SelectTrigger>
            <SelectContent>
              {universes.map((universe) => (
                <SelectItem key={universe.universeId} value={universe.universeId}>
                  {universe.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <p className="rounded-lg border border-border bg-background px-3 py-2 text-sm" role="status" aria-live="polite">
          <span className="text-secondary-text">
            <Lang text={{ ko: "현재 등록 대상", en: "Current universe" }} />
          </span>
          <span className="ml-2 font-medium">{selectedUniverse?.name || universes[0].name}</span>
        </p>
      )}
    </section>
  );
}
