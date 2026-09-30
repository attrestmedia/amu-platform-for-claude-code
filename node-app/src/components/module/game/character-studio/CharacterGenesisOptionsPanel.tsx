"use client";

import { useState } from "react";
import type { SyntheticEvent } from "react";
import { Info, Sparkles } from "lucide-react";
import { Lang } from "components/module/i18n";
import {
  CHARACTER_GENESIS_ATTRIBUTE_OPTIONS,
  CHARACTER_GENESIS_RARITY_DISCLOSURE,
  CHARACTER_SPECIES_OPTIONS,
  type CharacterSpeciesId,
} from "consts/game/characterGenesisPolicy";
import type { CharacterGenesisOptionsType } from "libs/api/game";
import { trackPlayEvent } from "utils/analytics/play";

type Props = {
  universeId: string;
  speciesId: CharacterSpeciesId;
  primaryAttributeId: string;
  options?: CharacterGenesisOptionsType | null;
  disabled?: boolean;
  onSpeciesChange: (value: CharacterSpeciesId) => void;
  onAttributeChange: (value: string) => void;
};

function percent(value: number) {
  const result = value * 100;
  if (result >= 1) return `${result.toFixed(result % 1 ? 2 : 0)}%`;
  return `${result.toFixed(4).replace(/0+$/, "").replace(/\.$/, "")}%`;
}

export function CharacterGenesisOptionsPanel({
  universeId,
  speciesId,
  primaryAttributeId,
  options,
  disabled = false,
  onSpeciesChange,
  onAttributeChange,
}: Props) {
  const [probabilityViewed, setProbabilityViewed] = useState(false);
  const attributes = options?.attributes?.length
    ? options.attributes
    : CHARACTER_GENESIS_ATTRIBUTE_OPTIONS.map((entry) => ({
        id: entry.id,
        i18nKey: `game.attribute.${entry.id}`,
        displayName: entry.label.ko,
        description: "",
      }));
  const disclosure = options?.rarityDisclosure?.length ? options.rarityDisclosure : CHARACTER_GENESIS_RARITY_DISCLOSURE;

  const handleProbabilityToggle = (event: SyntheticEvent<HTMLDetailsElement>) => {
    if (!event.currentTarget.open || probabilityViewed) return;
    setProbabilityViewed(true);
    trackPlayEvent("character_probability_viewed", {
      universeId,
      funnelAction: "disclosure_open",
      rulesetVersion: options?.rulesetVersion,
    });
  };

  return (
    <section className="space-y-4 rounded-xl border border-border bg-background p-4" aria-labelledby="genesis-options-title">
      <div className="flex items-start gap-2">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        <div>
          <h3 id="genesis-options-title" className="text-sm font-semibold">
            <Lang text={{ ko: "캐릭터 성향 선택", en: "Choose character traits" }} />
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            <Lang
              text={{
                ko: "이 선택은 한 번 확정되며, 기본 능력치와 상성은 서버가 계산합니다.",
                en: "This choice is fixed once, while base stats and affinity are calculated by the server.",
              }}
            />
          </p>
        </div>
      </div>

      <fieldset disabled={disabled}>
        <legend className="sr-only"><Lang text={{ ko: "종족", en: "Species" }} /></legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {CHARACTER_SPECIES_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={speciesId === option.id}
              onClick={() => onSpeciesChange(option.id)}
              className={[
                "min-h-11 rounded-lg border px-3 py-2 text-left transition-colors motion-reduce:transition-none",
                speciesId === option.id
                  ? "border-primary bg-primary/10 ring-2 ring-primary/20"
                  : "border-border bg-surface hover:border-primary/60",
              ].join(" ")}
            >
              <span className="block text-sm font-medium"><Lang text={option.label} /></span>
              <span className="mt-0.5 block text-xs text-muted-foreground"><Lang text={option.description} /></span>
            </button>
          ))}
        </div>
      </fieldset>

      <div className="space-y-2">
        <label htmlFor="character-primary-attribute" className="text-sm font-medium">
          <Lang text={{ ko: "주요 속성", en: "Primary attribute" }} />
        </label>
        <select
          id="character-primary-attribute"
          value={primaryAttributeId}
          onChange={(event) => onAttributeChange(event.target.value)}
          disabled={disabled}
          className="min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm text-primary-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          <option value=""><Lang text={{ ko: "서버가 무작위로 정하기", en: "Let the server choose" }} /></option>
          {attributes.map((attribute) => (
            <option key={attribute.id} value={attribute.id}>
              {attribute.displayName || attribute.id}
            </option>
          ))}
        </select>
      </div>

      <details className="rounded-lg border border-border bg-surface px-3 py-2" onToggle={handleProbabilityToggle}>
        <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium">
          <Info className="h-4 w-4 text-muted-foreground" aria-hidden />
          <Lang text={{ ko: "희귀도 확률 안내", en: "Rarity probabilities" }} />
        </summary>
        <div className="overflow-x-auto pb-1 pt-2">
          <table className="w-full min-w-[22rem] text-left text-xs">
            <caption className="sr-only"><Lang text={{ ko: "캐릭터 희귀도별 확률", en: "Character rarity probabilities" }} /></caption>
            <thead className="text-muted-foreground">
              <tr>
                <th scope="col" className="px-2 py-1 font-medium"><Lang text={{ ko: "희귀도", en: "Rarity" }} /></th>
                <th scope="col" className="px-2 py-1 font-medium"><Lang text={{ ko: "확률", en: "Probability" }} /></th>
              </tr>
            </thead>
            <tbody>
              {disclosure.map((entry) => (
                <tr key={entry.tier} className="border-t border-border">
                  <th scope="row" className="px-2 py-1.5 font-medium">{entry.tier}</th>
                  <td className="px-2 py-1.5 tabular-nums">{percent(entry.probability)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          <Lang
            text={{
              ko: "확률 안내를 확인한 기록은 동의나 구매 승인으로 처리하지 않습니다. 실제 결과는 서버의 게시된 규칙 버전으로 한 번만 결정됩니다.",
              en: "Viewing this disclosure is not consent or purchase approval. The server decides the result once using the published ruleset version.",
            }}
          />
        </p>
      </details>
    </section>
  );
}

export function CharacterGenesisResultCard({
  speciesId,
  primaryAttributeId,
  rarityTier,
  affinity,
}: {
  speciesId: string;
  primaryAttributeId: string;
  rarityTier: string;
  affinity: Record<string, number>;
}) {
  const species = CHARACTER_SPECIES_OPTIONS.find((option) => option.id === speciesId);
  const attribute = CHARACTER_GENESIS_ATTRIBUTE_OPTIONS.find((option) => option.id === primaryAttributeId);
  return (
    <section className="rounded-xl border border-primary/30 bg-primary/5 p-4" aria-labelledby="genesis-result-title">
      <h2 id="genesis-result-title" className="text-sm font-semibold">
        <Lang text={{ ko: "캐릭터 성향이 확정됐어요", en: "Character traits are set" }} />
      </h2>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div><dt className="text-xs text-muted-foreground"><Lang text={{ ko: "종족", en: "Species" }} /></dt><dd className="mt-1 font-medium"><Lang text={species?.label || { ko: speciesId, en: speciesId }} /></dd></div>
        <div><dt className="text-xs text-muted-foreground"><Lang text={{ ko: "주요 속성", en: "Primary" }} /></dt><dd className="mt-1 font-medium"><Lang text={attribute?.label || { ko: primaryAttributeId, en: primaryAttributeId }} /></dd></div>
        <div><dt className="text-xs text-muted-foreground"><Lang text={{ ko: "희귀도", en: "Rarity" }} /></dt><dd className="mt-1 font-medium">{rarityTier}</dd></div>
        <div><dt className="text-xs text-muted-foreground"><Lang text={{ ko: "상성 수", en: "Affinity links" }} /></dt><dd className="mt-1 font-medium tabular-nums">{Object.keys(affinity).length}</dd></div>
      </dl>
    </section>
  );
}
