"use client";

import React, { useState } from "react";
import { Button, Switch, Dialog, DialogContent, DialogHeader, DialogTitle, Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@amu-labs/ui";
import { AvatarThumbnail } from "components/module/image";
import { useGameCharacterStore, useUiControlStore } from "store/game";
import { useGlobalStore } from "store/global";
import { useAuthStore } from "store/auth";
import { useUniverseData } from "hooks/game/core";
import { useAuthCheck, useUserData } from "hooks/auth";
import { useLangChange } from "hooks/i18n";
import { BookOpen, LogOut, Settings, MessageSquare } from "lucide-react";
import { logger } from "utils/log";
import { getPersonaPortrait } from "utils/game";

// modules
import { Logout, LoginDialog } from "../../auth";
import UserInfoCard from "./UserInfoCard";
import ItemButton from "./item-button/ItemButton";
import { CharacterSelector } from "../character";
import { Lang, lang } from "../../i18n";
import { CoinBalance, CoinChargeWidget } from "../../commerce";
import { UserInfoEdit } from "components/module/layout";
import NpcCodexDialog from "./NpcCodexDialog";

const GameControlBox = () => {
  // 현재 언어 상태 가져오기
  const currentLanguage = useGlobalStore((state) => state.language);
  // 언어 변경 함수 가져오기
  const { changeLanguage } = useLangChange();

  // 페이지 로드 시 로그인 상태 확인
  useAuthCheck();
  const { isLogged, user } = useAuthStore();

  const { universeId, isCommerceUniverse } = useUniverseData();
  const selectedCharacter = useGameCharacterStore((state) => state.selectedCharacter);

  // 아바타 썸네일 경로 (유저 타입)
  const avatarSrc = selectedCharacter?.pid
    ? getPersonaPortrait(selectedCharacter, {
        universeId,
        type: "user",
        isCommerceUniverse,
      })
    : "";

  // Sheet와 로그인 Drawer 상태 관리
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isLoginDrawerOpen, setIsLoginDrawerOpen] = useState(false);
  const [openCoin, setOpenCoin] = useState(false); // Toss 다이얼로그 상태
  const [isUserInfoEditOpen, setIsUserInfoEditOpen] = useState(false);
  const [isNpcCodexOpen, setIsNpcCodexOpen] = useState(false);

  // 캐릭터 선택 팝업 상태
  const [isCharacterSelectorOpen, setIsCharacterSelectorOpen] = useState(false);

  // 모드 상태 추가
  const [selectorMode, setSelectorMode] = useState<"change" | "summon">("change");

  // 사용자 데이터 관련 훅
  const { userData, refetchUserData, isAdministrator } = useUserData();

  // 자동 AI 응답 모드 상태 가져오기
  const { autoAiResponse, toggleAutoAiResponse } = useUiControlStore();

  // 사용자 정보 수정 핸들러
  const handleUserInfoEditOpen = () => {
    setIsSheetOpen(false);

    if (isLogged()) {
      refetchUserData()
        .then(() => {
          logger.log("userData 새로고침 성공 (정보 수정용)");
          setTimeout(() => {
            setIsUserInfoEditOpen(true);
          }, 100);
        })
        .catch((err) => {
          logger.error("userData 새로고침 실패:", err);
          setTimeout(() => {
            setIsUserInfoEditOpen(true);
          }, 100);
        });
    }
  };

  // 로그인 버튼 클릭 핸들러
  const handleLoginClick = () => {
    // 현재 포커스된 요소 blur
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    // Sheet 닫고 로그인 Drawer 열기
    setIsSheetOpen(false);
    setTimeout(() => setIsLoginDrawerOpen(true), 100);
  };

  // 캐릭터 변경 팝업 열기
  const handleCharacterSelectOpen = () => {
    setIsSheetOpen(false);
    setSelectorMode("change"); // 변경 모드로 설정

    // userPersonas 데이터 리프레시
    if (isLogged()) {
      refetchUserData()
        .then(() => {
          logger.log("userData 새로고침 성공");
          setTimeout(() => {
            setIsCharacterSelectorOpen(true);
          }, 100);
        })
        .catch((err) => {
          logger.error("userData 새로고침 실패:", err);
          // 오류가 있어도 팝업은 열어줌
          setTimeout(() => {
            setIsCharacterSelectorOpen(true);
          }, 100);
        });
    } else {
      setTimeout(() => {
        setIsCharacterSelectorOpen(true);
      }, 100);
    }
  };

  // 캐릭터 소환 팝업 열기
  const handleCharacterSummonOpen = () => {
    setIsSheetOpen(false);
    setSelectorMode("summon"); // 소환 모드로 설정

    // userPersonas 데이터 리프레시
    if (isLogged()) {
      refetchUserData()
        .then(() => {
          logger.log("userData 새로고침 성공 (소환용)");
          setTimeout(() => {
            setIsCharacterSelectorOpen(true);
          }, 100);
        })
        .catch((err) => {
          logger.error("userData 새로고침 실패:", err);
          setTimeout(() => {
            setIsCharacterSelectorOpen(true);
          }, 100);
        });
    } else {
      setTimeout(() => {
        setIsCharacterSelectorOpen(true);
      }, 100);
    }
  };

  const handleNpcCodexOpen = () => {
    setIsSheetOpen(false);
    setTimeout(() => setIsNpcCodexOpen(true), 100);
  };

  // 캐릭터 선택/소환 완료 핸들러 통합
  const handleCharacterAction = (characterId: string) => {
    if (selectorMode === "summon") {
      logger.log(`캐릭터 소환 완료: ${characterId}`);
    } else {
      logger.log(`선택된 캐릭터: ${characterId}`);
    }

    // 선택기 모달 닫기
    setIsCharacterSelectorOpen(false);
  };

  return (
    <>
      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetTrigger asChild>
          <span className="global-toolbar-button flex items-center fixed top-2 right-2 rounded-full z-30 w-12 h-12">
            {isLogged() ? (
              <AvatarThumbnail src={avatarSrc} alt={selectedCharacter?.name || ""} />
            ) : (
              <ItemButton name="amu" />
            )}
          </span>
        </SheetTrigger>
        <SheetContent side="right" className="global-toolbar-content z-[100] pt-4 w-[calc(100%-2rem)] max-w-[25rem]">
          <SheetHeader className="text-left">
            <SheetTitle className="flex items-center justify-between w-[calc(100%-2rem)] text-base">
              {isLogged() ? (
                <>
                  <span>
                    <Lang text={{ ko: "안녕하세요", en: "Hello" }} />,{" "}
                    <span className="text-primary">
                      {userData?.userInfo?.name
                        ? userData?.userInfo?.name
                        : user?.name || lang({ ko: "사용자", en: "User" })}
                    </span>
                    {currentLanguage === "ko" && "님"}!
                  </span>
                  <Logout icon={<LogOut width={20} height={20} />} redirect="/" />
                </>
              ) : (
                <Lang text={{ ko: "로그인이 필요해요.", en: "You need to log in." }} as="span" />
              )}
            </SheetTitle>
            <SheetDescription>
              {!isLogged() ? (
                <span className="block text-base mb-4">
                  <Lang
                    text={{
                      ko: "더 많은 친구들을 만나고, 함께 대화하려면 로그인을 해주세요.",
                      en: "Please log in to meet more friends and chat with them.",
                    }}
                  />
                </span>
              ) : (
                <span className="flex items-center justify-between mt-4">
                  <CoinBalance iconSize={16} showLabel={true} />
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setOpenCoin(true)}
                    className="h-8 inline-flex items-center"
                    aria-label="코인 충전"
                  >
                    <span>코인 충전</span>
                  </Button>
                </span>
              )}
            </SheetDescription>
          </SheetHeader>

          <div className="-mr-6 pr-6 overflow-y-auto max-h-[calc(100%-2rem)]">
            {isLogged() ? (
              <>
                <UserInfoCard currentCharacter={selectedCharacter} className="mb-4" />

                <div className="flex gap-2">
                  {/* 사용자 정보 수정 버튼 */}
                  <Button onClick={handleUserInfoEditOpen} variant="outline" className="w-full mb-2">
                    <Lang text={{ ko: "내 정보 수정", en: "Edit My Info" }} />
                  </Button>

                  {!isCommerceUniverse && (
                    <>
                      <Button onClick={handleCharacterSelectOpen} className="w-full">
                        <Lang text={{ ko: "캐릭터 변경", en: "Change" }} />
                      </Button>
                      {isAdministrator && (
                        <Button onClick={handleCharacterSummonOpen} className="w-full" variant="secondary">
                          <Lang text={{ ko: "캐릭터 소환", en: "Summon" }} />
                        </Button>
                      )}
                    </>
                  )}
                </div>
                {!isCommerceUniverse && (
                  <Button
                    variant="outline"
                    className="mt-2 min-h-11 w-full"
                    onClick={handleNpcCodexOpen}
                    data-testid="open-npc-codex"
                  >
                    <BookOpen className="mr-2 h-4 w-4" />
                    <Lang text={{ ko: "NPC 도감", en: "NPC Codex" }} />
                  </Button>
                )}
              </>
            ) : (
              <Button className="w-full" onClick={handleLoginClick}>
                <Lang text={{ ko: "로그인 하기", en: "Log in" }} />
              </Button>
            )}
          </div>

          <div className="my-6">
            {/* 언어 전환 버튼 */}
            <div className="flex items-center justify-between border-t border-gray-200 py-6">
              <div className="flex items-center gap-1 text-base text-gray-500">
                <Settings size={20} />
                <span>Display in English</span>
              </div>
              <Switch
                checked={currentLanguage === "en"}
                onCheckedChange={() => changeLanguage(currentLanguage === "ko" ? "en" : "ko")}
                className="ml-2"
              />
            </div>

            {/* 자동 AI 응답 설정 */}
            <div className="flex items-center justify-between border-t border-gray-200 py-6">
              <div className="flex items-center gap-1 text-base text-gray-500">
                <MessageSquare size={20} />
                <span>
                  <Lang
                    text={{
                      ko: "자동 AI 응답",
                      en: "Auto AI Response",
                    }}
                  />
                </span>
              </div>
              <Switch
                checked={isCommerceUniverse ? true : autoAiResponse}
                disabled={isCommerceUniverse}
                onCheckedChange={toggleAutoAiResponse}
                className="ml-2"
              />
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* 로그인 Dialog */}
      <LoginDialog open={isLoginDrawerOpen} onOpenChange={setIsLoginDrawerOpen} />

      {/* 캐릭터 선택기 컴포넌트 */}
      <CharacterSelector
        isOpen={isCharacterSelectorOpen}
        onClose={() => setIsCharacterSelectorOpen(false)}
        onCharacterSelected={handleCharacterAction}
        showSelectButton={true}
        mode={selectorMode} // 동적으로 모드 전달
      />

      <NpcCodexDialog
        open={isNpcCodexOpen}
        onOpenChange={setIsNpcCodexOpen}
        universeId={universeId}
      />

      {/* 사용자 정보 수정 다이얼로그 */}
      {isLogged() && (
        <UserInfoEdit
          isOpen={isUserInfoEditOpen}
          onOpenChange={setIsUserInfoEditOpen}
          onComplete={() => {
            setIsUserInfoEditOpen(false);
            refetchUserData();
          }}
        />
      )}

      {/* Toss 결제 다이얼로그 */}
      {userData && (
        <Dialog open={openCoin} onOpenChange={setOpenCoin}>
          <DialogContent className="z-[100]" innerWrapClassName="min-w-[20rem] md:min-w-[30rem]" centered>
            <DialogHeader>
              <DialogTitle>코인 충전</DialogTitle>
            </DialogHeader>
            <CoinChargeWidget uid={userData.uid} title="" />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};

export default GameControlBox;
