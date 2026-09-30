"use client";

import { useState, useMemo, useEffect, type ReactNode } from "react";
import { Carousel } from "components/module/carousel";
import type { ICarouselRef } from "components/module/carousel";
import CharacterViewer from "./CharacterViewer";
import { lang } from "components/module/i18n";
import { Button } from "@amu-labs/ui";
import { Check, Minus, GalleryHorizontal, LayoutGrid } from "lucide-react";
import { cn } from "utils/common";
import { getPersonaPortrait } from "utils/game";
import { debounce } from "utils/helper";
import type { IExtendedNpcData } from "types/game";
import { useGameStore } from "store/game";
import { useUniverseData } from "hooks/game/core";
import { useUserData } from "hooks/auth";
import Image from "next/image";

export type ViewMode = "carousel" | "grid";

interface CharacterViewModeProps {
  personas: IExtendedNpcData[];
  clickedCharacterId: string | null;
  savedCharacterId: string | null;
  // universeId: string;
  handleCharacterSelect: (characterId: string) => void;
  handleConfirm: (characterId: string) => void;
  detailModalOpen: boolean;
  setDetailModalOpen: (open: boolean) => void;
  selectedDetailCharacter: IExtendedNpcData | null;
  carouselRef: React.RefObject<ICarouselRef | null>;

  // 뷰 모드 관련 속성
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  initialViewMode?: ViewMode;
  showViewModeToggle?: boolean;
  viewModeToggleRenderer?: () => React.ReactNode;
  showSelectButton?: boolean;
  showNav?: boolean;
  mode?: "change" | "summon";
  assetUniverseId?: string; // 이미지 경로 재설정을 위한 유니버스ID
  availabilityMode?: "progress" | "all";
  showCardSelectIndicator?: boolean;
  cardActionRenderer?: (character: IExtendedNpcData) => ReactNode;
  enableCardSelection?: boolean;
  slideClassName?: string;
  // 카드 목록 끝에 추가로 렌더할 슬롯(예: '튜터 추가하기' 플레이스홀더 카드)
  trailingSlot?: ReactNode;
}

export default function CharacterViewMode({
  personas,
  clickedCharacterId,
  savedCharacterId,
  // universeId,
  handleCharacterSelect,
  handleConfirm,
  detailModalOpen,
  setDetailModalOpen,
  selectedDetailCharacter,
  carouselRef,

  // 뷰 모드 관련 속성
  viewMode: externalViewMode,
  onViewModeChange,
  initialViewMode = "carousel",
  showViewModeToggle = true,
  viewModeToggleRenderer,
  showSelectButton = false,
  showNav = true,
  mode = "change",
  assetUniverseId,
  availabilityMode = "progress",
  showCardSelectIndicator = true,
  cardActionRenderer,
  enableCardSelection = true,
  slideClassName,
  trailingSlot,
}: CharacterViewModeProps) {
  // 외부에서 viewMode를 제어하지 않는 경우 내부 상태 사용
  const isExternallyControlled = externalViewMode !== undefined && onViewModeChange !== undefined;
  const [internalViewMode, setInternalViewMode] = useState<ViewMode>(initialViewMode);

  const { userData, batchCheckCharacterAvailable, isAdministrator } = useUserData();
  const [availableStatus, setAvailableStatus] = useState<Record<string, boolean>>({});

  const { universeId, isCommerceUniverse } = useUniverseData();
  const imageUniverseId = assetUniverseId || universeId;

  // 초기 선택 상태인지 확인
  const existingUserPersonas = userData?.userPersonas?.[universeId];
  const isInitialSelection = !existingUserPersonas || existingUserPersonas.length === 0;

  const currentStageNpcs = useGameStore((state) => state.npcs);

  // 현재 스테이지에 이미 소환된 캐릭터 ID 목록 계산
  const currentStageCharacterIds = useMemo(() => {
    return new Set(currentStageNpcs.map((npc) => npc.info?.persona?.pid).filter(Boolean));
  }, [currentStageNpcs]);

  // 실제 사용할 뷰 모드와 변경 함수
  const viewMode = isExternallyControlled ? externalViewMode : internalViewMode;
  const handleViewModeChange = (mode: ViewMode) => {
    if (isExternallyControlled) {
      onViewModeChange(mode);
    } else {
      setInternalViewMode(mode);
    }
  };

  // 캐릭터 카드 렌더링 함수 (캐러셀 및 그리드에서 공통으로 사용)
  const renderCharacterCard = (character: IExtendedNpcData, index: number) => {
    const isAlreadySaved = savedCharacterId === character.pid;
    const isInCurrentStage = currentStageCharacterIds.has(character.pid!);

    // 초기 선택 상태에서는 모든 캐릭터 사용 가능, 아니면 기존 로직 적용
    const isAvailableCharacter = availabilityMode === "all" ? true : (availableStatus[character.pid] ?? false);

    const isDisabled =
      mode === "summon"
        ? (isInCurrentStage || !isAvailableCharacter) && !isAdministrator
        : (isAlreadySaved || !isAvailableCharacter) && !isAdministrator;

    return (
      <div
        key={character.pid}
        className={cn(
          "group flex flex-col h-full rounded-xl border border-border/60 bg-card text-card-foreground shadow-sm transition-all overflow-hidden relative",
          !isDisabled && enableCardSelection && "cursor-pointer",
          isDisabled && "opacity-60 cursor-not-allowed",
          isAlreadySaved && "cursor-not-allowed",
          clickedCharacterId === character.pid && !isDisabled && "shadow-lg",
          viewMode === "grid" ? "h-auto" : "",
        )}
        onClick={() => {
          if (enableCardSelection && !isDisabled && !isAlreadySaved) {
            handleCharacterSelect(character.pid!);
          }
        }}
      >
        <div
          className={cn(
            "relative overflow-hidden",
            viewMode === "carousel" ? "w-full h-[calc(100vh-23rem)] max-h-[28rem]" : "h-auto pt-[135%]",
            (isAlreadySaved || isDisabled) && "grayscale",
          )}
        >
          <Image
            src={getPersonaPortrait(character, {
              universeId: imageUniverseId,
              type: "npc",
              isCommerceUniverse,
            })}
            alt={character.name || lang({ ko: "캐릭터 이미지", en: "Character Image" })}
            fill
            className={cn(
              "object-cover",
              clickedCharacterId === character.pid && "scale-125 object-top transition-transform duration-500",
              clickedCharacterId === character.pid ? "contrast-125" : "brightness-100",
            )}
            sizes="(max-width:640px) 100vw, (max-width:1024px) 50vw, 33vw"
            style={{
              objectPosition: "top",
            }}
            priority={index < 4} // 초기 N개 우선 로드
          />
        </div>

        <div
          className={cn(
            "character-info flex-1 border-t border-border/60 p-4 select-none bg-card text-card-foreground",
            viewMode === "grid" &&
              "absolute bottom-0 left-0 right-0 border-t-0 bg-gradient-to-t from-background/95 via-background/80 to-transparent text-primary-text",
          )}
        >
          <div className="flex justify-between items-center gap-2 mb-2">
            <h3
              className={cn(
                "block truncate font-bold max-w-[calc(100% - 2rem)]",
                viewMode === "grid" ? "text-lg" : "text-xl",
              )}
            >
              {character.name || lang({ ko: "이름 없음", en: "No name" })}
            </h3>
            {showCardSelectIndicator && (
              <Button
                variant="blank"
                className={cn(
                  "inline-flex h-5 w-5 items-center justify-center rounded-full border bg-transparent p-0",
                  clickedCharacterId === character.pid
                    ? "border-primary text-primary"
                    : "border-border text-muted-foreground",
                )}
                disabled={isDisabled || isAlreadySaved}
              >
                {clickedCharacterId === character.pid ? (
                  <Check width={12} height={12} />
                ) : (
                  <Minus width={12} height={12} />
                )}
              </Button>
            )}
          </div>
          {character.summary && (
            <p className={cn("line-clamp-3 text-secondary-text", viewMode === "grid" ? "text-xs" : "text-sm")}>
              {character.summary.substring(0, 100)}
            </p>
          )}
        </div>

        {isAlreadySaved && mode === "change" && (
          <div className="absolute top-2 right-2 inline-flex items-center justify-center bg-primary text-white rounded-full w-6 h-6">
            <Check size={16} />
          </div>
        )}

        {cardActionRenderer?.(character)}
      </div>
    );
  };

  // 기본 뷰 모드 전환 버튼 렌더링
  const renderDefaultViewModeToggle = () => (
    <div className="inline-flex rounded-default shadow-sm" role="group">
      <Button
        variant="text"
        className={viewMode === "carousel" ? "text-secondary" : "text-[#c9c9c9]"}
        onClick={() => handleViewModeChange("carousel")}
      >
        <GalleryHorizontal className="w-4 h-4 mr-2" />
      </Button>
      <Button
        variant="text"
        className={viewMode === "grid" ? "text-secondary" : "text-[#c9c9c9]"}
        onClick={() => handleViewModeChange("grid")}
      >
        <LayoutGrid className="w-4 h-4 mr-2" />
      </Button>
    </div>
  );

  // 디바운스 적용으로 불필요한 API 호출 방지
  const debouncedCheckAvailability = useMemo(
    () =>
      debounce(async () => {
        if (availabilityMode === "all" || isInitialSelection) {
          const statuses = personas.reduce(
            (acc, persona) => {
              acc[persona.pid] = true;
              return acc;
            },
            {} as Record<string, boolean>,
          );
          setAvailableStatus(statuses);
          return;
        }

        const statuses = await batchCheckCharacterAvailable(
          universeId,
          personas.map((p) => p.pid),
        );
        setAvailableStatus(statuses);
      }, 300),
    [personas, universeId, isInitialSelection, availabilityMode, batchCheckCharacterAvailable],
  );

  useEffect(() => {
    debouncedCheckAvailability();
    return () => debouncedCheckAvailability.cancel();
  }, [debouncedCheckAvailability]);

  return (
    <>
      {/* 뷰 모드 전환 버튼 (내부에서 표시 시) */}
      {showViewModeToggle && (
        <div className="flex justify-end px-4 mb-4">
          {viewModeToggleRenderer ? viewModeToggleRenderer() : renderDefaultViewModeToggle()}
        </div>
      )}

      {/* 캐릭터 선택 UI - 캐러셀 모드 */}
      {viewMode === "carousel" && (
        <div className="relative flex-1 w-full overflow-hidden">
          <div className="w-full h-full">
            <Carousel
              ref={carouselRef}
              options={{
                align: "start",
                containScroll: "trimSnaps",
                dragFree: true,
                loop: false,
              }}
              showDots={false}
              showNav={showNav}
              wheelGestures={true}
              slideClassName={cn(
                "w-full max-w-[280px] sm:max-w-[360px] pl-4 pb-[2rem] shrink-0 last:mr-4",
                slideClassName,
              )}
            >
              {personas.map((character, index) => renderCharacterCard(character, index))}
              {trailingSlot}
            </Carousel>
          </div>
        </div>
      )}

      {/* 캐릭터 선택 UI - 그리드 모드 */}
      {viewMode === "grid" && (
        <div className="relative flex-1 w-full overflow-y-auto px-4 pb-8">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {personas.map((character, index) => renderCharacterCard(character, index))}
            {trailingSlot}
          </div>
        </div>
      )}

      {/* 캐릭터 상세 정보 모달 */}
      <CharacterViewer
        open={detailModalOpen}
        onOpenChange={setDetailModalOpen}
        character={selectedDetailCharacter}
        onSelectCharacter={handleCharacterSelect}
        onConfirmSelection={handleConfirm}
        isAlreadySaved={!!selectedDetailCharacter && savedCharacterId === selectedDetailCharacter.pid}
        isSelectionDisabled={!!(selectedDetailCharacter && clickedCharacterId !== selectedDetailCharacter.pid)}
        showSelectButton={showSelectButton}
        mode={mode}
        assetUniverseId={imageUniverseId}
      />
    </>
  );
}
