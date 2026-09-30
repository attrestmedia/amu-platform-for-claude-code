"use client";

import React from "react";
import { AvatarThumbnail } from "components/module/image";
import { Lang } from "components/module/i18n";
import { useUniverseData } from "hooks/game/core";
import { useNicknameManager } from "hooks/game/input";
import type { IPersonaItem, NpcScopeType } from "types/ai";
import type { IExtendedNpcData } from "types/game";
import { getPersonaPortrait } from "utils/game";

interface PersonaListProps {
  personas: IPersonaItem[];
  characterTemplates: {
    byId: Record<string, IExtendedNpcData>;
  };
  type?: NpcScopeType;
}

export function PersonaList({ personas, characterTemplates, type = "npc" }: PersonaListProps) {
  const { getDisplayName, hasNickname } = useNicknameManager();
  const { universeId, isCommerceUniverse } = useUniverseData();

  return (
    <ul className="space-y-1 text-sm animate-fade-in">
      {personas.map((persona, idx) => {
        const characterObj = characterTemplates.byId[persona.pid];
        const pid = characterObj?.pid;

        const avatarSrc =
          pid && characterObj
            ? getPersonaPortrait(characterObj, {
                universeId,
                type,
                isCommerceUniverse,
              })
            : "";

        return (
          <li key={pid ?? idx} className="flex gap-2 bg-gray-50 px-2 py-4 rounded">
            <div className="flex flex-col items-center w-24 text-center">
              <AvatarThumbnail
                src={avatarSrc}
                alt={characterObj?.name || ""}
                className="w-14 h-14 border border-primary border-[3px]"
              />
              <h4 className="text-sm font-bold mt-2">
                {characterObj ? getDisplayName(characterObj) : "Unknown"}
                {characterObj && hasNickname(characterObj) && (
                  <small className="block font-normal text-gray-600">{`(${characterObj.name})`}</small>
                )}
              </h4>
            </div>
            <div className="text-xs text-gray-500 grid grid-cols-2 gap-2 flex-1">
              <div>
                <Lang text={{ ko: "레벨", en: "Level" }} /> (LV): {persona.level}
              </div>
              <div>
                <Lang text={{ ko: "경험치", en: "Experience" }} /> (XP): {persona.xp}
              </div>
              <div>
                <Lang text={{ ko: "체력", en: "Health Point" }} /> (HP): {persona.hp}
              </div>
              <div>
                <Lang text={{ ko: "정신력", en: "Mental Point" }} /> (MP): {persona.mp}
              </div>
              <div>
                <Lang text={{ ko: "지능", en: "Intelligence" }} /> (IQ): {persona.iq}
              </div>
              <div>
                <Lang text={{ ko: "감성", en: "Emotion" }} /> (EQ): {persona.eq}
              </div>
              <div>
                <Lang text={{ ko: "행운", en: "Luck" }} />: {persona.luck}
              </div>
              <div>
                <Lang text={{ ko: "분위기", en: "Mood" }} />: {persona.mood}
              </div>
              <div>
                <Lang text={{ ko: "친밀도", en: "Intimacy" }} />: {persona.intimacy}
              </div>
              <div>
                <Lang text={{ ko: "최근 만남", en: "Last meeting" }} />: {persona.lastInteraction}
              </div>
              <div>
                <Lang text={{ ko: "만남 횟수", en: "Meeting count" }} />: {persona.totalInteractions}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default PersonaList;
