"use client";

import React, { useRef, useState, useEffect, useCallback, useMemo } from "react";
import type { IExtendedNpcData } from "types/game";
import type { IPersonaItem, PersonaImageLibraryAssetType } from "types/ai";
import { motion, useMotionValue, AnimatePresence } from "framer-motion";
import type { PanInfo } from "framer-motion";
import { Button, type ButtonVariantType, Preloader } from "@amu-labs/ui";
import { AmuSimbol } from "@amu-labs/ui/icons/brand/amu";
import { ImageBox } from "components/module/image";
import { Lang, lang } from "components/module/i18n";
import ChatControlPanel from "./chat-modules/controls/ChatControlPanel";
import NicknameEditor from "./NicknameEditor";
import { useUniverseData } from "hooks/game/core";
import { useNicknameManager } from "hooks/game/input";
import { cn } from "utils/common";
import { getPersonaPortrait, getPersonaMode } from "utils/game";
import { Info } from "lucide-react";
import Image from "next/image";
import { FixedImageViewer } from "components/template/gen-studio/modules/FixedImageViewer";

export interface CharacterCardCustomButton {
  label: string;
  onClick: () => void;
  variant?: ButtonVariantType;
  icon?: React.ReactNode;
  className?: string;
  disabled?: boolean;
}

interface CharacterCardProps {
  character: IExtendedNpcData;
  initialExpanded?: boolean;
  hideInfo?: boolean;
  infoContainerClassName?: string;
  footerContainerClassName?: string;
  footerButtons?: CharacterCardCustomButton[];
  onInfoVisibilityChange?: (hidden: boolean) => void;
  onArtifactOpen?: () => void;
  onArtifactClose?: () => void;
  assetUniverseId?: string; // 이미지 경로 재설정을 위한 유니버스ID
  personaArtifacts?: PersonaImageLibraryAssetType[];
}

function getPersonaArtifactImageSrc(asset: PersonaImageLibraryAssetType) {
  const assetId = String(asset.assetId || "").trim();
  if (assetId) return `/api/persona/image-library?assetId=${encodeURIComponent(assetId)}&variant=optimized`;
  return String(asset.storage?.optimizedUrl || asset.storage?.thumbnailUrl || "").trim();
}

const CharacterCard = ({
  character,
  initialExpanded = false,
  hideInfo = false,
  infoContainerClassName,
  footerContainerClassName,
  footerButtons = [],
  onInfoVisibilityChange,
  onArtifactOpen,
  onArtifactClose,
  assetUniverseId,
  personaArtifacts = [],
}: CharacterCardProps) => {
  // 페르소나 타입 결정
  const personaMode = getPersonaMode(character);
  const isMonster = personaMode === "monster";

  const [isExpanded, setIsExpanded] = useState<boolean>(initialExpanded);
  const [isHidden, setIsHidden] = useState<boolean>(hideInfo);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isArtifactViewerOpen, setIsArtifactViewerOpen] = useState<boolean>(false);
  const [showChatControlPanel, setShowChatControlPanel] = useState(false);

  const [canEdit, setCanEdit] = useState<boolean>(false);
  const [currentNickname, setCurrentNickname] = useState<string | undefined>(undefined);
  const [currentPersonaData, setCurrentPersonaData] = useState<IPersonaItem | null>(null);
  const [isNicknameLoading, setIsNicknameLoading] = useState<boolean>(false);

  const { universeId, isCommerceUniverse } = useUniverseData();
  const { saveNickname, getNickname, getDisplayName, canEditNickname, getCharacterPersona } = useNicknameManager();

  const universeForImage = assetUniverseId ?? universeId;
  const defaultHeight = 42; // 기본 높이: 단위는 vh
  const expandedHeight = 70; // 확장 높이: 단위는 vh
  const dragY = useMotionValue(0);
  const infoRef = useRef<HTMLDivElement>(null);
  const cardInfoMargin = footerButtons.length > 0 ? 13.5 : 10;
  const artifactImages = useMemo(
    () => personaArtifacts.map(getPersonaArtifactImageSrc).filter(Boolean),
    [personaArtifacts],
  );
  const hasArtifact = artifactImages.length > 0;
  const artifactThumbnailSrc = artifactImages[0] || "";

  // 관계 정보 토글 함수
  const toggleChatControlPanel = useCallback(() => {
    setShowChatControlPanel((prev) => !prev);
  }, []);

  // 캐릭터 포트레이트 경로 계산
  const portrait = useMemo(
    () =>
      character?.pid
        ? getPersonaPortrait(character, {
            universeId: universeForImage,
            type: "npc",
            isCommerceUniverse,
          })
        : "",
    [character, universeForImage, isCommerceUniverse],
  );

  // pid 변경 동기 리셋: pid가 빠지면 즉시 표시 상태 초기화 (effect 회피)
  const [trackedPid, setTrackedPid] = useState(character.pid);
  if (trackedPid !== character.pid) {
    setTrackedPid(character.pid);
    if (!character.pid) {
      setCanEdit(false);
      setCurrentNickname(undefined);
      setCurrentPersonaData(null);
    }
  }

  // pid가 있는 경우에만 비동기 데이터 로드
  useEffect(() => {
    if (!character.pid) return;

    let cancelled = false;

    const loadCharacterData = async () => {
      setIsNicknameLoading(true);

      try {
        // 병렬로 처리해서 성능 최적화
        const [editPermission, nickname, personaData] = await Promise.all([
          canEditNickname(character.pid),
          getNickname(character.pid),
          getCharacterPersona(character.pid),
        ]);

        if (!cancelled) {
          setCanEdit(editPermission);
          setCurrentNickname(nickname);
          setCurrentPersonaData(personaData);
        }
      } catch (error) {
        console.error("캐릭터 데이터 로드 실패:", error);
        if (!cancelled) {
          setCanEdit(false);
          setCurrentNickname(undefined);
          setCurrentPersonaData(null);
        }
      } finally {
        if (!cancelled) setIsNicknameLoading(false);
      }
    };

    loadCharacterData();

    return () => {
      // 다음 pid로 넘어가거나 unmount 시 state 덮어쓰기 방지
      cancelled = true;
    };
  }, [character.pid, canEditNickname, getNickname, getCharacterPersona]);

  // 별명 저장 핸들러
  const handleNicknameSave = async (nickname: string) => {
    if (!character.pid) return;

    try {
      await saveNickname(character.pid, nickname);
      // 성공 시 로컬 상태 즉시 업데이트
      setCurrentNickname(nickname.trim() || undefined);
    } catch (error) {
      console.error("별명 저장 실패:", error);
    }
  };

  // Reset to default state when character/props change (effect 회피, 동기 트래킹)
  const [trackedCharacter, setTrackedCharacter] = useState(character);
  const [trackedInitialExpanded, setTrackedInitialExpanded] = useState(initialExpanded);
  const [trackedHideInfo, setTrackedHideInfo] = useState(hideInfo);
  if (trackedCharacter !== character || trackedInitialExpanded !== initialExpanded || trackedHideInfo !== hideInfo) {
    setTrackedCharacter(character);
    setTrackedInitialExpanded(initialExpanded);
    setTrackedHideInfo(hideInfo);
    setIsExpanded(initialExpanded);
    setIsHidden(hideInfo);
  }

  useEffect(() => {
    dragY.set(0);
  }, [trackedCharacter, trackedInitialExpanded, trackedHideInfo, dragY]);

  // 상태가 변경될 때마다 콜백 호출
  useEffect(() => {
    if (onInfoVisibilityChange) {
      onInfoVisibilityChange(isHidden);
    }
  }, [isHidden, onInfoVisibilityChange]);

  const handleArtifactClick = () => {
    setIsArtifactViewerOpen(true);
    if (onArtifactOpen) {
      onArtifactOpen();
    }
  };

  const handleArtifactClose = () => {
    setIsArtifactViewerOpen(false);
    onArtifactClose?.();
  };

  const handleDragStart = () => {
    setIsDragging(true);
  };

  const handleDragEnd = (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    setIsDragging(false);

    // Toggle state based on drag direction and current state
    if (Math.abs(info.offset.y) > 20) {
      // Threshold to prevent accidental toggles
      if (info.offset.y < 0) {
        // Dragged upward
        setIsExpanded(true);
        setIsHidden(false);
      } else {
        // Dragged downward
        if (!isExpanded) {
          // If already in default mode, hide it
          setIsHidden(true);
        } else {
          // If expanded, go to default mode
          setIsExpanded(false);
        }
      }
    }

    // Reset dragY
    dragY.set(0);
  };

  const handleOpenClick = () => {
    setIsHidden(false);
    setIsExpanded(false);
  };

  const createCharacterInfo = ({ key, title, content }: { key: string; title?: string; content: React.ReactNode }) => {
    if (!content) return null;

    return (
      <div key={key} className="w-full">
        <div>
          {title && <h3 className="text-lg font-semibold mb-4">{title}</h3>}
          {content}
        </div>
      </div>
    );
  };

  // Create sections for each part of character information
  const characterInfoClasses = {
    labelContainer: "flex my-1",
    label:
      "inline-flex items-center justify-center bg-secondary text-white p-1 mr-2 rounded-xl text-sm w-14 min-w-14 h-6",
  };

  const characterInfos = [
    character.summary &&
      createCharacterInfo({
        key: "summary",
        content: (
          <div className="character-card-info-content">
            <p className="text-base break-words w-full">{character.summary}</p>
          </div>
        ),
      }),

    character.appearance &&
      createCharacterInfo({
        key: "appearance",
        content: (
          <div className="character-card-info-content mt-6">
            {/* 사람일 때 나이/언어/출신을 표시 */}
            {!isMonster && character.age && (
              <p className={cn(characterInfoClasses.labelContainer)}>
                <span className={cn(characterInfoClasses.label)}>
                  <Lang text={{ ko: "나이", en: "Age" }} />
                </span>{" "}
                {character.age}
              </p>
            )}
            {!isMonster && character.language && (
              <p className={cn(characterInfoClasses.labelContainer)}>
                <span className={cn(characterInfoClasses.label)}>
                  <Lang text={{ ko: "언어", en: "Lang" }} />
                </span>{" "}
                {character.language}
              </p>
            )}
            {!isMonster && character.nationality && (
              <p className={cn(characterInfoClasses.labelContainer)}>
                <span className={cn(characterInfoClasses.label)}>
                  <Lang text={{ ko: "출신", en: "Native" }} />
                </span>{" "}
                {character.nationality}
              </p>
            )}

            {/* 공통 필드(가치관/외형 설명)는 타입과 무관하게 사용 */}
            {character.values && (
              <p className={cn(characterInfoClasses.labelContainer, "border-b border-white/20 mt-6 pb-4")}>
                {character.values}
              </p>
            )}

            <p className="mt-4">{character.appearance}</p>
          </div>
        ),
      }),

    character.background &&
      createCharacterInfo({
        key: "background",
        content: <p className="mt-4">{character.background}</p>,
      }),

    character.personality &&
      createCharacterInfo({
        key: "personality",
        content: <p className="mt-4">{character.personality}</p>,
      }),
  ].filter(Boolean);

  // Character image section
  const characterImageSection = (
    <div className="character-card-container relative w-full h-full">
      {/* 블러 처리 배경 이미지 */}
      <div className="absolute inset-0 w-full h-full overflow-hidden">
        <Image
          src={portrait}
          alt={`${character.name} ${lang({ ko: "배경", en: "background" })}`}
          fill
          className="object-cover blur-md scale-110 opacity-70"
          sizes="100vw"
          priority={true}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 to-black/70"></div>
      </div>

      {/* 캐릭터 전체 이미지 */}
      <div className="character-card-img relative h-full w-full z-10 flex items-start justify-center">
        <div className="relative w-[calc(100%-12px)] h-[calc(100%-12px)] mt-[6px]">
          <Image
            src={portrait}
            alt={character.name}
            width={500}
            height={700}
            className="object-cover object-top rounded-2xl shadow-[0_2px_3px_rgba(0,0,0,0.35)] border border-white/5"
            sizes="(max-width: 560px) 100vw, 560px"
            style={{
              width: "100%",
              height: "100%",
              maxWidth: "100%",
              maxHeight: "100%",
            }}
            priority={true}
          />
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full break-words w-full text-base bg-black">
      {characterImageSection}

      {/* Show button when panel is hidden */}
      <AnimatePresence>
        {isHidden && (
          <Button className="absolute top-2 left-2 w-8 h-8 p-0 z-10" onClick={handleOpenClick}>
            <AmuSimbol width={18} height={18} />
            <span className="sr-only">
              <Lang text={{ ko: "캐릭터 정보 보기", en: "View character information" }} />
            </span>
          </Button>
        )}
        {/* 관계 정보 토글 버튼 */}
        <Button
          variant="ghost"
          onClick={toggleChatControlPanel}
          className={`fixed top-3 right-3 flex items-center justify-center w-8 h-8 text-white hover:bg-white/10 transition-colors ${
            showChatControlPanel ? "bg-white/20" : ""
          }`}
          title="관계 정보 보기"
        >
          <Info size={16} />
          <span className="sr-only">
            <Lang text={{ ko: "관계 정보", en: "Relationship Info" }} />
          </span>
        </Button>
      </AnimatePresence>

      <AnimatePresence>
        {!isHidden && (
          <motion.div
            ref={infoRef}
            key="character-info-panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{
              height: isExpanded ? `${expandedHeight}vh` : `${defaultHeight}vh`,
              opacity: 1,
              backgroundColor: isDragging ? "rgba(0, 0, 0, 0.4)" : "rgba(0, 0, 0, 0.3)",
            }}
            exit={{
              height: 0,
              opacity: 0,
              transition: { duration: 0.3 },
            }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.1}
            dragMomentum={false}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            transition={{
              type: "spring",
              stiffness: 300,
              damping: 30,
              mass: 1,
            }}
            style={{ y: dragY }}
            className={cn(
              "character-card-info absolute bottom-0 left-0 right-0 z-10",
              "text-white w-full p-6",
              "rounded-t-2xl shadow-[0_-1px_3px_rgba(0,0,0,0.75)]",
              "border-t border-t-[rgba(255,255,255,0.05)]",
              infoContainerClassName,
            )}
          >
            {/* Drag handle indicator - animated */}
            <motion.div
              animate={{
                scale: isDragging ? 1.1 : 1,
                opacity: isExpanded ? 0.8 : 0.5,
              }}
              className={cn(
                "w-full h-4 absolute top-0 left-0 right-0 py-1 flex justify-center",
                "before:block before:w-16 before:h-2 before:rounded before:bg-[rgba(0,0,0,0.5)] before:border-b before:border-b-[rgba(255,255,255,0.35)]",
                "cursor-ns-resize",
              )}
            />

            <div className="character-card-info-header flex items-center justify-between gap-2 mb-4 mt-3">
              <div className="flex flex-col">
                <h2 className="text-xl font-bold">
                  {/* 로딩 상태 처리 및 상태 값 사용 */}
                  {isNicknameLoading ? (
                    <div className="flex items-center gap-2">
                      <span>{character.name}</span>
                      <Preloader variant="spin" size="sm" />
                    </div>
                  ) : canEdit ? (
                    <NicknameEditor
                      currentNickname={currentNickname} // 상태 값 사용
                      originalName={character.name || ""}
                      onSave={handleNicknameSave}
                      className="text-2xl text-primary font-bold"
                    />
                  ) : (
                    <>{getDisplayName(character)}</>
                  )}
                </h2>
                <span className="block text-sm text-gray-300 font-normal">
                  {character.nationality ?? lang({ ko: `${character.age}살`, en: `${character.age} years old` })}
                </span>
              </div>
              {!isCommerceUniverse && hasArtifact && artifactThumbnailSrc ? (
                <Button variant="blank" size="icon-lg" rounded="full" onClick={handleArtifactClick}>
                  <ImageBox
                    src={artifactThumbnailSrc}
                    alt={`${character.name}'s artifact`}
                    width="100%"
                    height="100%"
                    className="h-full w-full transition-transform overflow-hidden rounded-full"
                    objectFit="object-cover"
                  />
                </Button>
              ) : null}
            </div>

            {characterInfos.length === 0 ? (
              <p className="text-muted-foreground text-center">
                <Lang text={{ ko: "캐릭터 정보가 없습니다.", en: "There is no character information." }} />
              </p>
            ) : (
              <motion.div
                animate={{
                  opacity: [0.8, 1],
                  y: [5, 0],
                }}
                transition={{
                  duration: 0.3,
                  ease: "easeOut",
                  delay: 0.1,
                }}
                className={cn("character-card-info-body relative overflow-hidden rounded-xl bg-[rgba(0,0,0,0.6)] p-4")}
              >
                <div
                  className="character-card-body-inner overflow-y-auto -mr-3 pr-2"
                  style={{
                    maxHeight: isExpanded
                      ? `calc(${expandedHeight}vh - ${cardInfoMargin}rem)`
                      : `calc(${defaultHeight}vh - ${cardInfoMargin}rem)`,
                  }}
                >
                  {characterInfos}
                </div>
              </motion.div>
            )}
            {footerButtons.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.25,
                  delay: 0.5,
                  ease: "easeOut",
                }}
                className={cn(
                  "character-card-buttons-container",
                  "flex flex-wrap gap-2 py-4 px-6",
                  "absolute bottom-0 left-0 right-0",
                  footerContainerClassName,
                )}
              >
                {footerButtons.map((button, index) => (
                  <Button
                    key={`character-card-footer-button-${index}`}
                    variant={button.variant}
                    onClick={button.onClick}
                    className={cn("character-card-footer-button flex-1", button.className)}
                    disabled={button.disabled}
                  >
                    {button.icon && <span className="mr-2">{button.icon}</span>}
                    {button.label}
                  </Button>
                ))}
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <FixedImageViewer
        open={isArtifactViewerOpen && artifactImages.length > 0}
        src={artifactImages[0] || null}
        images={artifactImages}
        alt={`${character.name} artifact`}
        onOpenChange={(next) => {
          if (!next) handleArtifactClose();
        }}
      />

      {/* 관계 정보 패널 */}
      <AnimatePresence>
        {showChatControlPanel && (
          <ChatControlPanel
            personaData={currentPersonaData}
            characterName={getDisplayName(character)}
            isVisible={showChatControlPanel}
            onToggle={toggleChatControlPanel}
            panelType="info"
            className="z-50"
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default CharacterCard;
