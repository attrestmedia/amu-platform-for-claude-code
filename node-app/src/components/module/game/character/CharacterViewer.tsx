"use client";

import React, { useState } from "react";
import { Button, Sheet, SheetContent, SheetTitle, SheetHeader, SheetClose } from "@amu-labs/ui";
import { X } from "lucide-react";
import type { IExtendedNpcData } from "types/game";
import { Lang, lang } from "components/module/i18n";
import CharacterCard from "./CharacterCard";
import type { CharacterCardCustomButton } from "./CharacterCard";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useAuthStore } from "store/auth";
import { useGameCharacterStore } from "store/game";
import { useUserData } from "hooks/auth";
import { useUniverseData } from "hooks/game/core";
import { toast } from "sonner";
import { logger } from "utils/log";
import { getKorParticle } from "utils/language";
import { getPlayPath } from "utils/app";

interface CharacterViewerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  character: IExtendedNpcData | null;
  onSelectCharacter?: (characterId: string) => void;
  onConfirmSelection?: (characterId: string) => void;
  isAlreadySaved?: boolean; // 이미 선택된 캐릭터 비활성화
  isSelectionDisabled?: boolean; // 모든 캐릭터 선택 비활성화
  showSelectButton?: boolean;
  footerButtons?: CharacterCardCustomButton[];
  hasExistingCharacter?: boolean;
  mode?: "change" | "summon";
  assetUniverseId?: string; // 이미지 경로 재설정을 위한 유니버스ID
}

const CharacterViewer = ({
  open,
  onOpenChange,
  character,
  onSelectCharacter,
  onConfirmSelection,
  isAlreadySaved = false,
  showSelectButton = false,
  footerButtons = [],
  hasExistingCharacter,
  mode = "change",
  assetUniverseId,
}: CharacterViewerProps) => {
  const [isSelecting, setIsSelecting] = useState(false);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAuthenticated, user } = useAuthStore();
  const { updateSelectedPersona, refetchUserData } = useUserData();
  const { universeId } = useUniverseData();

  // Zustand 캐릭터 스토어 사용
  const selectedCharacterId = useGameCharacterStore((state) => state.selectedCharacterId);
  const setSelectedCharacter = useGameCharacterStore((state) => state.setSelectedCharacter);

  // 선택된 캐릭터가 있는지 여부를 확인
  const hasAnySelectedCharacter = hasExistingCharacter !== undefined ? hasExistingCharacter : !!selectedCharacterId;

  if (!character) return null;

  // 캐릭터 선택 및 저장 핸들러
  const handleSelectAndSave = async () => {
    if (!character?.pid || isAlreadySaved || isSelecting) return;

    // 변경 모드에서만 이미 저장된 캐릭터 확인
    if (mode === "change" && isAlreadySaved) return;

    setIsSelecting(true);

    try {
      logger.log("캐릭터 액션 시작:", {
        mode,
        characterName: character.name,
        characterId: character.pid,
        isAuthenticated: isAuthenticated,
        universeId: universeId,
      });

      if (mode === "summon") {
        // 소환 모드: 직접 소환 로직 실행
        logger.log("소환 모드 실행");

        if (!universeId) {
          toast.error(lang({ ko: "유니버스 정보를 찾을 수 없습니다.", en: "Universe information not found." }));
          return;
        }

        // 직접 소환 함수 호출
        const { summonCharacterToCurrentStage } = useGameCharacterStore.getState();
        const success = await summonCharacterToCurrentStage(character);

        if (success) {
          logger.log("캐릭터 소환 성공:", character.name);
          toast.success(
            lang({
              ko: `${getKorParticle(character.name, "을-를")} 현재 스테이지에 소환했습니다!`,
              en: `${character.name} has been summoned to the current stage!`,
            }),
          );

          // 성공 시에만 부모 콜백 호출
          if (onConfirmSelection) {
            onConfirmSelection(character.pid);
          }
        } else {
          logger.error("캐릭터 소환 실패");
          toast.error(
            lang({
              ko: "캐릭터 소환에 실패했습니다. 다시 시도해주세요.",
              en: "Character summoning failed. Please try again.",
            }),
          );
          return; // 실패 시 모달을 닫지 않음
        }
      } else {
        // 변경 모드: 기존 로직 실행
        logger.log("변경 모드 실행");

        // 변경 모드에서 이미 저장된 캐릭터면 리턴
        if (isAlreadySaved) {
          toast.info(lang({ ko: "이미 선택된 캐릭터입니다.", en: "This character has already been selected." }));
          return;
        }

        // 먼저 Zustand 스토어 업데이트
        setSelectedCharacter(character);

        // 캐릭터 정보 저장
        if (isAuthenticated && universeId) {
          logger.log("MongoDB에 캐릭터 저장 시도:", {
            universeId,
            characterId: character.pid,
            userId: user?.id,
          });

          try {
            // MongoDB 저장
            const result = await updateSelectedPersona(universeId, character.pid);

            if (!result) {
              logger.error("MongoDB 업데이트 실패: 응답 없음");
              toast.error(
                lang({
                  ko: "캐릭터 저장에 실패했습니다. 다시 시도해주세요.",
                  en: "Failed to save character. Please try again.",
                }),
              );
              return;
            }

            logger.log("MongoDB 업데이트 성공:", result);
            toast.success(
              lang({ ko: "캐릭터가 성공적으로 변경되었습니다.", en: "The character has been successfully changed." }),
            );

            await new Promise((resolve) => setTimeout(resolve, 300)); // 비동기 처리를 위해 짧은 지연 추가
            await refetchUserData(); // 캐시 갱신 - 명시적으로 refetch 호출

            // 캐시 갱신 - 이중 확인
            queryClient.invalidateQueries({ queryKey: ["userData"] });
            queryClient.invalidateQueries({ queryKey: ["allPersonas"] });
          } catch (apiError) {
            logger.error("API 호출 중 예외 발생:", apiError);
            toast.error(
              lang({
                ko: "서버 통신 중 오류가 발생했습니다.",
                en: "An error occurred while communicating with the server.",
              }),
            );
            return;
          }
        }

        // 부모 컴포넌트 콜백 실행 (필요한 경우)
        if (onSelectCharacter) {
          onSelectCharacter(character.pid);
        }

        if (onConfirmSelection) {
          onConfirmSelection(character.pid);
        }

        // 선택 페이지에서 오면 유니버스 페이지로 이동
        const currentPath = window.location.pathname;
        if (currentPath.includes("/select-character") && universeId) {
          router.push(getPlayPath(universeId));
        }
      }

      // 성공 시에만 모달 닫기
      onOpenChange(false);
    } catch (error) {
      logger.error(`캐릭터 ${mode === "summon" ? "소환" : "변경"} 중 오류:`, error);
      toast.error(
        lang({
          ko: `캐릭터 ${mode === "summon" ? "소환" : "변경"} 중 오류가 발생했습니다.`,
          en: `An error occurred while executing character ${mode === "summon" ? "summon" : "change"}.`,
        }),
      );
    } finally {
      setIsSelecting(false);
    }
  };

  // 캐릭터 선택 버튼 라벨 결정 로직
  const getButtonLabel = () => {
    if (mode === "summon") {
      if (isSelecting) return lang({ ko: "소환 중...", en: "Summoning..." });
      return lang({ ko: "이 캐릭터 소환", en: "Summon this character" });
    }

    // 기존 변경 모드 로직
    if (isAlreadySaved) return lang({ ko: "현재 선택된 캐릭터", en: "Currently selected character" });
    if (isSelecting) return lang({ ko: "변경 중...", en: "Changing..." });
    if (hasAnySelectedCharacter) return lang({ ko: "이 캐릭터로 변경", en: "Change to this character" });
    return lang({ ko: "이 캐릭터 선택", en: "Choose this character" });
  };

  // 소환 모드에서는 이미 저장된 캐릭터라도 소환 가능
  const isButtonDisabled = mode === "summon" ? isSelecting : isAlreadySaved || isSelecting;

  // 캐릭터 선택 버튼 수정
  const selectButton: CharacterCardCustomButton = {
    label: getButtonLabel(),
    onClick: handleSelectAndSave,
    variant: isButtonDisabled ? "disabled" : "primary",
    disabled: isButtonDisabled,
    className: isButtonDisabled ? "opacity-50 cursor-not-allowed" : "glow-purple animate-glow",
  };

  // 기존 버튼 또는 선택 버튼 표시
  const buttonsToShow = showSelectButton ? [selectButton, ...footerButtons] : footerButtons;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* 스크린 리더를 위한 제목 */}
      <SheetHeader className="sr-only">
        <SheetTitle>
          {character.name} <Lang text={{ ko: "캐릭터 정보", en: "Character Information" }} />
        </SheetTitle>
      </SheetHeader>
      <SheetContent
        side="bottom"
        hideClose={true}
        className="h-full p-0 overflow-hidden max-w-[35rem] mx-auto border-0"
      >
        <CharacterCard
          character={character}
          initialExpanded={false}
          footerButtons={buttonsToShow}
          assetUniverseId={assetUniverseId}
        />

        {/* 커스텀 닫기 버튼 */}
        <div className="absolute top-2 right-2 z-10">
          <SheetClose asChild>
            <Button variant="text" className="text-white bg-[rgba(0,0,0,0.5)] rounded-full p-2">
              <X width={16} height={16} />
            </Button>
          </SheetClose>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default CharacterViewer;
