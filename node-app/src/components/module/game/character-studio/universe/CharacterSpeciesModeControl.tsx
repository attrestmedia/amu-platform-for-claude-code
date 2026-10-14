"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@amu-labs/ui";
import { CHARACTER_SPECIES_MODES, type CharacterSpeciesMode } from "consts/game/characterGenesisPolicy";
import { Lang, lang } from "components/module/i18n";
import { updateCharacterUniverseSpeciesMode } from "libs/api/game/characterUniverses";
import type { CharacterUniverseOption } from "types/game/characterUniverse";

type Props = {
  universe: CharacterUniverseOption;
};

const MODE_LABELS: Record<CharacterSpeciesMode, { ko: string; en: string }> = {
  human: { ko: "인간형만 허용", en: "Human only" },
  monster: { ko: "몬스터형만 허용", en: "Monster only" },
  both: { ko: "둘 다 허용", en: "Both species" },
};

const SAVE_ERRORS: Record<string, { ko: string; en: string }> = {
  UNIVERSE_NOT_FOUND: { ko: "유니버스를 찾을 수 없습니다.", en: "The universe could not be found." },
  UNIVERSE_NOT_GAME: { ko: "게임 유니버스에서만 종족 설정을 바꿀 수 있습니다.", en: "Species settings can only be changed for game universes." },
  UNIVERSE_DISABLED: { ko: "사용할 수 없는 유니버스입니다.", en: "This universe is unavailable." },
  UNIVERSE_SPECIES_EDIT_FORBIDDEN: { ko: "이 유니버스의 종족 설정을 바꿀 권한이 없습니다.", en: "You do not have permission to change this universe's species settings." },
  UNIVERSE_SPECIES_EDIT_FIELDS_INVALID: { ko: "종족 설정 요청이 올바르지 않습니다.", en: "The species settings request is invalid." },
  UNIVERSE_SPECIES_MODE_INVALID: { ko: "지원하지 않는 종족 설정입니다.", en: "This species setting is not supported." },
};

function readErrorCode(error: unknown) {
  if (!error || typeof error !== "object") return "";
  const errorLike = error as {
    errorCode?: unknown;
    response?: { data?: unknown };
  };
  if (typeof errorLike.errorCode === "string") return errorLike.errorCode;
  const data = errorLike.response?.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return "";
  const errorCode = (data as Record<string, unknown>).errorCode;
  return typeof errorCode === "string" ? errorCode : "";
}

export function CharacterSpeciesModeControl({ universe }: Props) {
  const queryClient = useQueryClient();
  const [draftMode, setDraftMode] = useState<CharacterSpeciesMode | null>(null);
  const mode = draftMode || universe.speciesMode;
  const [error, setError] = useState<{ ko: string; en: string } | null>(null);
  const [saved, setSaved] = useState(false);
  const saveMutation = useMutation({
    mutationFn: (nextMode: CharacterSpeciesMode) =>
      updateCharacterUniverseSpeciesMode(universe.universeId, nextMode),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["character-universes"] }),
        queryClient.invalidateQueries({ queryKey: ["my-game-character-genesis-options", universe.universeId] }),
      ]);
      setDraftMode(null);
      setError(null);
      setSaved(true);
    },
  });

  async function saveMode() {
    if (saveMutation.isPending) return;
    setError(null);
    setSaved(false);
    try {
      await saveMutation.mutateAsync(mode);
    } catch (caught) {
      setError(
        SAVE_ERRORS[readErrorCode(caught)] || {
          ko: "종족 설정을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
          en: "Could not save the species setting. Please try again.",
        },
      );
    }
  }

  const canSave = universe.legacyFallback || mode !== universe.speciesMode;

  return (
    <section className="space-y-3 rounded-xl border border-border bg-surface p-4" aria-labelledby="character-species-mode-title">
      <div>
        <h2 id="character-species-mode-title" className="text-sm font-semibold">
          <Lang text={{ ko: "허용할 캐릭터 종족", en: "Allowed character species" }} />
        </h2>
        <p className="mt-1 text-xs leading-5 text-secondary-text">
          <Lang text={{ ko: "이 설정은 서버에서 캐릭터 등록 요청에도 적용됩니다.", en: "The server also enforces this setting when a character is registered." }} />
        </p>
        {universe.legacyFallback ? (
          <p className="mt-2 text-xs text-secondary-text">
            <Lang text={{ ko: "현재는 기존 설정에 따라 두 종족을 모두 허용합니다.", en: "Both species are currently allowed by the legacy default." }} />
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1 space-y-2">
          <label htmlFor="character-species-mode" className="text-sm font-medium">
            <Lang text={{ ko: "종족 정책", en: "Species policy" }} />
          </label>
          <Select
            value={mode}
            onValueChange={(value) => {
              if (typeof value === "string") setDraftMode(value as CharacterSpeciesMode);
              setError(null);
              setSaved(false);
            }}
            disabled={saveMutation.isPending}
          >
            <SelectTrigger id="character-species-mode" className="min-h-11 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CHARACTER_SPECIES_MODES.map((speciesMode) => (
                <SelectItem key={speciesMode} value={speciesMode}>
                  <Lang text={MODE_LABELS[speciesMode]} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11"
          onClick={saveMode}
          loading={saveMutation.isPending}
          disabled={!canSave || saveMutation.isPending}
        >
          <Lang text={{ ko: "저장", en: "Save" }} />
        </Button>
      </div>

      {error ? (
        <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
          <Lang text={error} />
        </p>
      ) : null}
      {saved ? (
        <p className="text-sm text-primary-text" role="status" aria-live="polite">
          <Lang text={{ ko: "종족 설정을 저장했습니다.", en: "Species setting saved." }} />
        </p>
      ) : null}
      <p className="sr-only" aria-live="polite">
        {saveMutation.isPending ? lang({ ko: "종족 설정을 저장하는 중", en: "Saving species setting" }) : ""}
      </p>
    </section>
  );
}
