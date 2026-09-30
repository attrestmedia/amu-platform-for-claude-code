"use client";

import React from "react";
import type { IExtendedNpcData } from "types/game";
import type { IPersonaItem, IPersonaSprite } from "types/ai";
import { Heart } from "lucide-react";
import { StatBar, Badge } from "@amu-labs/ui";
import { lang } from "components/module/i18n";
import { useUniverseData } from "hooks/game/core";
import { getPersonaMode } from "utils/game";
import ChatMoodIndicator from "./ChatMoodIndicator"; // 순환 참조의 위험이 있어 내부 상대 경로로 교체
import type { SystemCodeLikeType } from "types/ai";

// CharacterChat 상단 헤더 전용 컴포넌트
// - 뒤로가기 버튼 / 캐릭터 미니 아바타/이름/국적 / 언어/직업 뱃지 / 친밀도 StatBar / 무드 인디케이터
interface CharacterChatHeaderProps {
  character: IExtendedNpcData;
  npcSprite: IPersonaSprite | null;
  npcPortraitSrc?: string | null;
  currentPersonaData?: IPersonaItem | null;
  systemCodes?: SystemCodeLikeType[] | null; // 무드 인디케이터 표시용 최신 systemCode
}

function CharacterChatHeaderBase({ character, currentPersonaData, systemCodes }: CharacterChatHeaderProps) {
  const personaMode = getPersonaMode(character);
  const isMonster = personaMode === "monster";

  const { isCommerceUniverse } = useUniverseData();

  return (
    <div className="character-chat-header flex flex-col">
      <div className="flex items-start px-4 pt-4 pb-2">
        {/* 캐릭터 요약 */}
        <div className="character-info flex flex-col items-start">
          <h3 className="text-white font-bold text-shadow-black line-clamp-2 max-w-[9rem]">{character.name}</h3>

          {/* 직업 정보 */}
          {character.job && <span className="text-white/80 text-xs font-light">{character.job}</span>}
        </div>
      </div>

      {/* 추가 정보 패널 (언어/직업/친밀도/무드) */}
      <div className="space-y-2 px-4">
        <div className="flex items-center gap-1.5">
          {!isMonster && character.nationality && (
            <Badge variant="primary" size="xs">
              {character.nationality}
            </Badge>
          )}

          {/* 언어 정보 */}
          {!isCommerceUniverse && !isMonster && (
            <div className="flex items-center gap-1">
              <div className="flex items-center gap-1 text-white/80 text-xs font-medium">
                {(character.language || "English")
                  .split(",")
                  .map((l) => l.trim())
                  .filter(Boolean)
                  .map((l, i) => (
                    <Badge
                      key={`${character.pid}-lang-${i}`}
                      variant="outline"
                      size="xs"
                      className="border-white text-white"
                    >
                      {l.trim()}
                    </Badge>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* 친밀도 */}
        {!isCommerceUniverse && currentPersonaData?.intimacy !== undefined && (
          <div className="related-info-panel space-y-1 pl-1">
            <div className="flex items-center gap-1">
              <span className="text-white/80 text-xs font-medium">
                <StatBar
                  label={lang({ ko: "친밀도", en: "Intimacy" })}
                  value={Math.round(currentPersonaData.intimacy || 0)}
                  max={999}
                  color="bg-gradient-to-r from-pink-500 to-purple-500"
                  icon={<Heart className="w-3 h-3 text-white/60" />}
                  className="mb-0"
                />
              </span>
            </div>
          </div>
        )}

        {/* 무드 인디케이터 */}
        <ChatMoodIndicator systemCodes={systemCodes} className="ml-1" />
      </div>
    </div>
  );
}

// 불필요한 동일 props 리렌더 방지를 위해 React.memo로 감쌈
export const CharacterChatHeader = React.memo(CharacterChatHeaderBase);
export default CharacterChatHeader;
