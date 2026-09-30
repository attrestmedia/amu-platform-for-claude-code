"use client";

import React, { useState, useEffect, useRef } from "react";
import { Button } from "@amu-labs/ui";
import { X, GalleryHorizontal, LayoutGrid } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getAllPersonas, getPersonasBy } from "libs/api/universe";
import type { IExtendedNpcData } from "types/game";
import type { ICarouselRef } from "components/module/carousel";
import { Lang } from "components/module/i18n";
import CharacterViewMode from "./CharacterViewMode";
import type { ViewMode } from "./CharacterViewMode";
import { cn } from "utils/common";
import { logger } from "utils/log";
import { useUserData } from "hooks/auth";
import { useUniverseData } from "hooks/game/core";
import { useGameCharacterStore } from "store/game";
import { DEFAULT_WORLD_UNIVERSE } from "consts/app";

interface CharacterSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onCharacterSelected?: (characterId: string) => void;
  showSelectButton?: boolean;
  mode?: "change" | "summon";
}

// GameControlBox에서 분리된 캐릭터 선택 UI
function CharacterSelector({
  isOpen,
  onClose,
  onCharacterSelected,
  showSelectButton = false,
  mode = "change",
}: CharacterSelectorProps) {
  // 선택된 캐릭터 PID
  const savedCharacterId = useGameCharacterStore((state) => state.selectedCharacterId);

  const { isAdministrator, getPersonasForUniverse } = useUserData();

  // 캐릭터 선택 관련 상태
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedDetailCharacter, setSelectedDetailCharacter] = useState<IExtendedNpcData | null>(null);

  // 클릭된 캐릭터 ID 관리
  const [clickedCharacterId, setClickedCharacterId] = useState<string | null>(null);

  const { universeId, universeInfo, isCommerceUniverse } = useUniverseData();

  // 뷰 모드 상태 관리
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  // 슬라이더 참조
  const carouselRef = useRef<ICarouselRef | null>(null);

  // 페르소나 데이터 가져오기
  const {
    data: personas,
    isLoading: isPersonasLoading,
    error: personasError,
    refetch: refetchPersonas,
  } = useQuery<IExtendedNpcData[]>({
    queryKey: ["personas", universeId, isAdministrator, universeInfo?.data?.type],
    queryFn: async () => {
      if (!universeId) return [];

      // commerce에서는 `DEFAULT_WORLD_UNIVERSE` 보유 캐릭터를 바탕으로 목록 생성
      const targetUniverseId = isCommerceUniverse ? DEFAULT_WORLD_UNIVERSE : universeId;
      const sourceUserPersonaUniverseId = targetUniverseId; // userPersonas도 동일 출처 사용

      if (isAdministrator) {
        return getAllPersonas(targetUniverseId);
      } else {
        const userPersonas = await getPersonasForUniverse(sourceUserPersonaUniverseId, "userPersonas");

        // 권장 폴백: 보유 목록이 비어있으면 전체 풀에서 노출(선택 정책에 따라 유지/삭제 가능)
        if (!userPersonas || userPersonas.length === 0) {
          return getAllPersonas(targetUniverseId);
        }

        const personaIds = userPersonas.map((p) => p.pid);
        return await getPersonasBy({ collection: targetUniverseId, pids: personaIds });
      }
    },
    staleTime: 5 * 60 * 1000, // 5분 캐시
    refetchOnWindowFocus: false,
    enabled: !!universeId && !!universeInfo?.data && isOpen, // universeInfo도 로드된 후 실행
  });

  // 팝업이 열릴 때 현재 저장된 캐릭터 ID 동기 반영 (effect 회피)
  const [trackedOpenInit, setTrackedOpenInit] = useState(isOpen);
  const [trackedSavedForInit, setTrackedSavedForInit] = useState(savedCharacterId);
  if (trackedOpenInit !== isOpen || trackedSavedForInit !== savedCharacterId) {
    setTrackedOpenInit(isOpen);
    setTrackedSavedForInit(savedCharacterId);
    if (isOpen) {
      // 저장된 캐릭터를 바로 선택 상태 반영
      setClickedCharacterId(savedCharacterId);
    }
  }

  // 캐릭터 선택 핸들러
  const handleCharacterSelect = (characterId: string) => {
    // 현재 선택된 캐릭터와 같은 경우 선택 취소
    if (clickedCharacterId === characterId) {
      setClickedCharacterId(null);
      setSelectedDetailCharacter(null);
      setDetailModalOpen(false); // 상세 모달도 닫기
      return;
    }

    setClickedCharacterId(characterId);

    // 선택된 캐릭터 상세 정보 찾기
    const character = personas?.find((p) => p.pid === characterId) || null;
    if (character) {
      setSelectedDetailCharacter(character);
      setDetailModalOpen(true);
    }
  };

  // 캐릭터 선택 확인 핸들러
  // 캐릭터 선택 확인 핸들러 수정
  const handleConfirmSelection = (characterId: string) => {
    if (!characterId || !universeId) return;

    // mode에 관계없이 onCharacterSelected 콜백 호출
    // 실제 소환/변경 로직은 CharacterViewer에서 처리됨
    onCharacterSelected?.(characterId);
    setDetailModalOpen(false);
  };

  // isOpen/universeId 전환 시 clickedCharacterId 초기화 (effect 회피, 동기 트래킹)
  const [trackedOpenReset, setTrackedOpenReset] = useState(isOpen);
  const [trackedUniverseReset, setTrackedUniverseReset] = useState(universeId);
  if (trackedOpenReset !== isOpen || trackedUniverseReset !== universeId) {
    setTrackedOpenReset(isOpen);
    setTrackedUniverseReset(universeId);
    if (isOpen && universeId) {
      setClickedCharacterId(null);
    }
  }

  // 팝업이 열릴 때만 personas fetch + 로깅
  useEffect(() => {
    if (isOpen && universeId) {
      refetchPersonas();
      logger.log("저장된 캐릭터를 바로 선택 상태로 반영 => ", { savedCharacterId });
      logger.log("캐릭터 셀렉터 savedCharacterId => ", savedCharacterId);
    }
  }, [isOpen, universeId, refetchPersonas, savedCharacterId]);

  // 모달이 닫혀있을 때는 렌더링하지 않음
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex flex-col">
          <h2 className="text-lg font-semibold">
            {mode === "summon" ? (
              <Lang text={{ ko: "캐릭터 소환", en: "Summon Character" }} />
            ) : (
              <Lang text={{ ko: "캐릭터 변경", en: "Change Character" }} />
            )}
          </h2>
          <p className="text-sm text-gray-500">
            {mode === "summon" ? (
              <Lang
                text={{
                  ko: "현재 스테이지에 소환할 캐릭터를 선택하세요.",
                  en: "Select a character to summon to the current stage.",
                }}
              />
            ) : (
              <Lang text={{ ko: "원하는 캐릭터를 선택하세요.", en: "Select your desired character." }} />
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <ViewModeToggle viewMode={viewMode} onViewModeChange={setViewMode} />
          <Button variant="text" onClick={onClose}>
            <X size={20} />
          </Button>
        </div>
      </div>

      <div className={cn("flex-1 overflow-y-auto py-4", viewMode === "carousel" && "flex items-center")}>
        {isPersonasLoading ? (
          <div className="w-full h-full flex items-center justify-center">
            <p>캐릭터 목록을 불러오는 중...</p>
          </div>
        ) : personasError ? (
          <div className="w-full h-full flex items-center justify-center">
            <p className="text-red-500">캐릭터 목록을 불러오지 못했습니다.</p>
          </div>
        ) : personas && personas.length > 0 ? (
          <CharacterViewMode
            personas={personas}
            clickedCharacterId={clickedCharacterId}
            savedCharacterId={savedCharacterId}
            handleCharacterSelect={handleCharacterSelect}
            handleConfirm={handleConfirmSelection}
            detailModalOpen={detailModalOpen}
            setDetailModalOpen={setDetailModalOpen}
            selectedDetailCharacter={selectedDetailCharacter}
            carouselRef={carouselRef}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            showViewModeToggle={false}
            showSelectButton={showSelectButton}
            mode={mode}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <p>사용 가능한 캐릭터가 없습니다.</p>
          </div>
        )}
      </div>

      {/* 하단 버튼 삭제 - 이제 CharacterViewer에서 모든 선택 처리를 함 */}
    </div>
  );
}

/**
 * 뷰 모드 전환 버튼 컴포넌트
 * 캐러셀과 그리드 모드 간 전환 기능 제공
 */
function ViewModeToggle({
  viewMode,
  onViewModeChange,
}: {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}) {
  return (
    <div className="inline-flex mr-2" role="group">
      <Button
        variant="text"
        size="sm"
        className={`p-2 rounded-l-lg ${
          viewMode === "carousel" ? "bg-primary text-white" : "text-gray-500 border border-gray-100"
        }`}
        onClick={() => onViewModeChange("carousel")}
      >
        <GalleryHorizontal className="w-4 h-4" />
        <span className="sr-only">캐러셀</span>
      </Button>
      <Button
        variant="text"
        size="sm"
        className={`p-2 rounded-r-lg ${
          viewMode === "grid" ? "bg-primary text-white" : "text-gray-500 border border-gray-100"
        }`}
        onClick={() => onViewModeChange("grid")}
      >
        <LayoutGrid className="w-4 h-4" />
        <span className="sr-only">그리드</span>
      </Button>
    </div>
  );
}

export default CharacterSelector;
