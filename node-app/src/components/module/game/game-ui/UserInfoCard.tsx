"use client";

import { useEffect, useState } from "react";
import { Button, Preloader, Tabs, TabsContent, TabsList, TabsTrigger } from "@amu-labs/ui";
import { AvatarThumbnail } from "components/module/image";
import { Lang } from "components/module/i18n";
import PersonaList from "./PersonaList";
import { NicknameEditor } from "../character";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { IExtendedNpcData } from "types/game";
import { useUniverseData } from "hooks/game/core";
import { useNicknameManager } from "hooks/game/input";
import { useUserData } from "hooks/auth";
import { useAuthStore } from "store/auth";
import { useGameStore } from "store/game";
import { cn, isDev } from "utils/common";
import { getPersonaPortrait } from "utils/game";

interface UserInfoCardProps {
  className?: string;
  currentCharacter?: IExtendedNpcData | null;
}

const UserInfoCard = ({ className = "", currentCharacter }: UserInfoCardProps) => {
  const { user } = useAuthStore();
  const { universeId, isCommerceUniverse } = useUniverseData();
  const { userData, isLoading, error, fetchUserData } = useUserData();

  const characterTemplates = useGameStore((state) => state.characterTemplates);
  const { saveNickname, getNickname, getDisplayName, canEditNickname } = useNicknameManager();

  const [activeUniverse, setActiveUniverse] = useState<string | null>(null);
  const [characterInfoShow, setCharacterInfoShow] = useState(false);
  const [personaInfoShow, setPersonaInfoShow] = useState(false);
  const [npcInfoShow, setNpcInfoShow] = useState(false);

  const [canEdit, setCanEdit] = useState<boolean>(false);
  const [currentNickname, setCurrentNickname] = useState<string | undefined>(undefined);
  const [isNicknameLoading, setIsNicknameLoading] = useState<boolean>(false);

  // currentCharacter가 변경될 때마다 비동기 데이터 로드 — pid 전이 시 reset은 adjusting state during render 패턴
  const [trackedPid, setTrackedPid] = useState<string | undefined>(currentCharacter?.pid);
  if (trackedPid !== currentCharacter?.pid) {
    setTrackedPid(currentCharacter?.pid);
    if (!currentCharacter?.pid) {
      setCanEdit(false);
      setCurrentNickname(undefined);
    }
  }

  useEffect(() => {
    if (!currentCharacter?.pid) return;

    let cancelled = false;
    const loadNicknameData = async () => {
      setIsNicknameLoading(true);

      try {
        // 병렬로 처리해서 성능 최적화
        const [editPermission, nickname] = await Promise.all([
          canEditNickname(currentCharacter.pid),
          getNickname(currentCharacter.pid),
        ]);

        if (cancelled) return;
        setCanEdit(editPermission);
        setCurrentNickname(nickname);
      } catch (error) {
        console.error("별명 데이터 로드 실패:", error);
        if (cancelled) return;
        setCanEdit(false);
        setCurrentNickname(undefined);
      } finally {
        if (!cancelled) setIsNicknameLoading(false);
      }
    };

    loadNicknameData();
    return () => {
      cancelled = true;
    };
  }, [currentCharacter?.pid, canEditNickname, getNickname]);

  useEffect(() => {
    if (user?.id) {
      fetchUserData(user.id);
    }
  }, [user, fetchUserData]);

  // 데이터가 로드되면 첫 번째 유니버스를 기본값으로 설정 — adjusting state during render 패턴
  const personaUniverses = userData?.personas ? Object.keys(userData.personas) : [];
  if (!activeUniverse && personaUniverses.length > 0) {
    setActiveUniverse(personaUniverses[0]);
  }

  // 별명 저장 핸들러
  const handleNicknameSave = async (nickname: string) => {
    if (!currentCharacter?.pid) return;

    try {
      await saveNickname(currentCharacter.pid, nickname);
      // 성공 시 로컬 상태 즉시 업데이트
      setCurrentNickname(nickname.trim() || undefined);
    } catch (error) {
      console.error("별명 저장 실패:", error);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center p-4">
        <Preloader variant="spin" size="md" />
      </div>
    );
  }

  if (error) {
    return <div className="text-red-500 text-sm p-4">{error}</div>;
  }

  if (!user) {
    return null;
  }

  const universes = userData
    ? [
        ...new Set([
          ...Object.keys(userData.personas || {}),
          ...Object.keys(userData.userPersonas || {}),
          ...Object.keys(userData.gameStats || {}),
        ]),
      ]
    : [];

  return (
    <div className={className}>
      {currentCharacter && (
        <div className="current-character-info">
          <div className="current-character-header py-4 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AvatarThumbnail
                src={
                  currentCharacter.pid
                    ? getPersonaPortrait(currentCharacter, {
                        universeId,
                        type: "user",
                        isCommerceUniverse,
                      })
                    : ""
                }
                alt={currentCharacter?.name}
                size="lg"
                imgClassName="bg-blue-100"
              />
              <div>
                <p className="text-sm text-gray-600">My Character</p>
                <h3 className="font-bold text-lg">
                  {/* 로딩 상태 처리 */}
                  {isNicknameLoading ? (
                    <div className="flex items-center gap-2">
                      <span>{currentCharacter.name}</span>
                      <Preloader variant="spin" size="sm" />
                    </div>
                  ) : canEdit ? (
                    <NicknameEditor
                      currentNickname={currentNickname} // 🆕 상태 값 사용
                      originalName={currentCharacter.name || ""}
                      onSave={handleNicknameSave}
                      className="font-bold text-lg"
                      buttonClassName="text-black"
                      maxLength={20}
                    />
                  ) : (
                    <>
                      {getDisplayName(currentCharacter)}
                      {currentNickname && (
                        <small className="font-normal text-gray-600 ml-2">{`(${currentCharacter.name})`}</small>
                      )}
                    </>
                  )}
                </h3>
              </div>
            </div>
            <Button onClick={() => setCharacterInfoShow((state) => !state)} variant="blank">
              {characterInfoShow ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </Button>
          </div>

          {characterInfoShow && (
            <div className={cn("current-character-body pt-4", characterInfoShow && "animate-fade-in")}>
              <ul>
                <li className="text-sm text-gray-80 font-bold mb-2">{currentCharacter.nationality}</li>
                <li className="text-sm text-gray-80">
                  <Lang text={{ ko: "사용 언어", en: "Language used" }} />:{" "}
                  {currentCharacter.language?.split(",").map((lang, idx) => (
                    <span
                      key={idx}
                      className="ml-1 px-2 py-0.5 bg-gray-200 text-gray-700 rounded-full text-xs font-medium"
                    >
                      {lang.trim()}
                    </span>
                  ))}
                </li>
                <li className="text-xs text-gray-500 mt-2">{currentCharacter.appearance}</li>
                <li className="text-xs text-gray-500 mt-2">{currentCharacter.values}</li>
              </ul>
            </div>
          )}
        </div>
      )}

      {userData && universes.length > 0 && (
        <div className="mt-4">
          <Tabs defaultValue={activeUniverse || universes[0]} onValueChange={setActiveUniverse}>
            <TabsList className="flex gap-1 bg-gradient-purple-cyan-tr">
              {universes.map((universe) => (
                <TabsTrigger
                  key={universe}
                  value={universe}
                  className={cn("w-full", "data-[state=inactive]:text-white")}
                >
                  {universe.toUpperCase()}
                </TabsTrigger>
              ))}
            </TabsList>

            {universes.map((universe) => (
              <TabsContent key={universe} value={universe}>
                {/* 게임 스테이트 표시 */}
                {/* {userData.gameStats?.[universe] && (
                  <div className="mb-4">
                    <h4 className="font-medium text-gray-700 mb-2">
                      <Lang text={{ ko: "게임 정보", en: "Game Information" }} />
                    </h4>
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div className="bg-gray-50 p-2 rounded">
                        <div className="text-gray-500">
                          <Lang text={{ ko: "레벨", en: "Level" }} />
                        </div>
                        <div className="font-medium">{userData.gameStats[universe].level}</div>
                      </div>
                      <div className="bg-gray-50 p-2 rounded">
                        <div className="text-gray-500">
                          <Lang text={{ ko: "경험치", en: "Experience" }} />
                        </div>
                        <div className="font-medium">{userData.gameStats[universe].xp}</div>
                      </div>
                      <div className="bg-gray-50 p-2 rounded">
                        <div className="text-gray-500">
                          <Lang text={{ ko: "친밀도", en: "Intimacy" }} />
                        </div>
                        <div className="font-medium">{userData.gameStats[universe].intimacy}</div>
                      </div>
                    </div>
                  </div>
                )} */}

                {/* 유저 페르소나 표시 */}
                {userData.userPersonas && userData.userPersonas?.[universe]?.length > 0 && (
                  <div>
                    <h4 className="flex items-center justify-between font-medium text-gray-700 mb-2">
                      <div className="flex items-center">
                        <Lang text={{ ko: "내 페르소나 정보", en: "My Personas" }} />
                        {userData.userPersonas[universe] && (
                          <span className="text-sm ml-1 -mt-1">{`(${userData.userPersonas[universe].length})`}</span>
                        )}
                      </div>
                      <Button onClick={() => setPersonaInfoShow((state) => !state)} variant="blank">
                        {personaInfoShow ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                      </Button>
                    </h4>
                    {personaInfoShow && (
                      <PersonaList
                        personas={userData.userPersonas[universe]}
                        characterTemplates={characterTemplates}
                        type="user"
                      />
                    )}
                  </div>
                )}

                {/* NPC 페르소나 표시 */}
                {userData.personas && userData.personas?.[universe]?.length > 0 && (
                  <div>
                    <h4 className="flex items-center justify-between font-medium text-gray-700 mb-2">
                      <div className="flex items-center">
                        <Lang text={{ ko: "최근 만난 페르소나들", en: "Recently Met Personas" }} />
                        {userData.personas[universe] && (
                          <span className="text-sm ml-1 -mt-1">{`(${userData.personas[universe].length})`}</span>
                        )}
                      </div>
                      <Button onClick={() => setNpcInfoShow((state) => !state)} variant="blank">
                        {npcInfoShow ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                      </Button>
                    </h4>
                    {npcInfoShow && (
                      <PersonaList
                        personas={userData.personas[universe]}
                        characterTemplates={characterTemplates}
                        type="npc"
                      />
                    )}
                  </div>
                )}
              </TabsContent>
            ))}
          </Tabs>

          {userData.loginStats?.lastLogin && isDev && (
            <div className="mt-4 text-xs text-gray-500">
              <div>
                <Lang text={{ ko: "최근 로그인", en: "Recent Logins" }} />:{" "}
                {new Date(userData.loginStats.lastLogin).toLocaleString()}
              </div>
              <div>
                <Lang text={{ ko: "내 페르소나", en: "Total number of logins" }} />: {userData.loginStats.totalLogins}회
              </div>
              <div>
                <Lang text={{ ko: "연속 로그인", en: "Consecutive login" }} />: {userData.loginStats.consecutiveDays}일
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default UserInfoCard;
