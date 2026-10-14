"use client";

import { useId } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@amu-labs/ui";
import { Lang } from "components/module/i18n";
import type { CharacterSpeciesMode } from "consts/game/characterGenesisPolicy";

export function CharacterSpeciesModeField({
  value,
  onChange,
}: {
  value?: CharacterSpeciesMode;
  onChange: (mode: CharacterSpeciesMode | undefined) => void;
}) {
  const id = useId();
  const labelId = `${id}-label`;
  const descriptionId = `${id}-description`;

  const handleValueChange = (nextValue: string | string[]) => {
    if (typeof nextValue !== "string") return;

    if (nextValue === "unset") {
      onChange(undefined);
      return;
    }

    if (nextValue === "human" || nextValue === "monster" || nextValue === "both") {
      onChange(nextValue);
    }
  };

  return (
    <div className="space-y-2">
      <span id={labelId} className="block text-sm font-medium text-primary-text">
        <Lang text={{ ko: "캐릭터 종족 허용", en: "Allowed character species" }} />
      </span>
      <Select value={value ?? "unset"} onValueChange={handleValueChange}>
        <SelectTrigger
          aria-labelledby={labelId}
          aria-describedby={descriptionId}
          className="min-h-11 w-full max-w-md"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="unset">
            <Lang text={{ ko: "미설정(기존 동작: 둘 다 허용)", en: "Unset (legacy behavior: allow both)" }} />
          </SelectItem>
          <SelectItem value="human">
            <Lang text={{ ko: "사람만", en: "Human only" }} />
          </SelectItem>
          <SelectItem value="monster">
            <Lang text={{ ko: "몬스터만", en: "Monster only" }} />
          </SelectItem>
          <SelectItem value="both">
            <Lang text={{ ko: "사람과 몬스터", en: "Human and monster" }} />
          </SelectItem>
        </SelectContent>
      </Select>
      <p id={descriptionId} className="text-sm leading-6 text-secondary-text">
        <Lang
          text={{
            ko: "미설정은 저장된 정책이 없는 상태이며 기존 캐릭터 생성 흐름은 사람과 몬스터를 모두 허용합니다.",
            en: "Unset means no stored policy; existing character creation continues to allow both human and monster.",
          }}
        />
      </p>
    </div>
  );
}
