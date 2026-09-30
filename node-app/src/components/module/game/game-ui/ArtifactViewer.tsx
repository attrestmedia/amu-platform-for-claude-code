"use client";

import React, { useState } from "react";
import { cn } from "utils/common";
import { personaBase } from "utils/game";
import type { NpcScopeType } from "types/ai";
import { getKorParticle } from "utils/language";
import { Button } from "@amu-labs/ui";
import { Lang } from "components/module/i18n";
import ArtifactItem from "./ArtifactItem";
import { PixiFullscreenViewer } from "components/module/pixi";
import { useGlobalStore } from "store/global";
import { useGameStore } from "store/game";
import { useUniverseData } from "hooks/game/core";

interface ArtifactViewerProps {
  // universeName: string;
  nationality: string;
  characterId: string;
  characterName: string;
  artifactFile: string;
  containerClassName?: string;
  blendMode?: string;
  effectIntensity?: number;
  type?: NpcScopeType;
  onClose?: () => void;
}

const ArtifactViewer = ({
  nationality,
  characterId,
  characterName,
  artifactFile,
  containerClassName,
  blendMode = "normal",
  effectIntensity = 1.0,
  type = "npc",
  onClose,
}: ArtifactViewerProps) => {
  const { universeId, isCommerceUniverse } = useUniverseData();
  const currentLanguage = useGlobalStore((state) => state.language);

  // 아티팩트 이미지 경로
  const artifactImagePath = `${personaBase(
    universeId,
    type,
    isCommerceUniverse,
  )}/${characterId}/artifact/${artifactFile}`;

  // 게임 스토어에서 스테이지 크기 가져오기
  const { stageWidth, stageHeight } = useGameStore((state) => state.worldData);

  // 전체화면 뷰어 상태
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);

  // 배경 클릭 시 닫기 처리
  const handleBackgroundClick = (e: React.MouseEvent) => {
    // 이벤트 전파 방지
    e.stopPropagation();
    if (onClose) {
      onClose();
    }
  };

  return (
    <>
      <div
        className={cn(
          "pixi-artifact-container relative fixed top-16 left-1/2 -translate-x-1/2 z-20",
          "flex flex-col items-center text-white text-center",
          containerClassName,
        )}
      >
        <h2 className="text-2xl mb-2">{characterName}</h2>
        <div className="w-64 h-64 relative">
          <ArtifactItem
            artifactImagePath={artifactImagePath}
            blendMode={blendMode}
            effectIntensity={effectIntensity}
            className="w-full h-full relative"
          />
        </div>
        <p className="text-lg mt-4">
          {currentLanguage === "ko" ? (
            <>
              <strong className="text-xl text-secondary">{universeId}&nbsp;</strong>
              <span>우주&nbsp;</span>
              <br />
              <strong className="text-xl text-secondary">{nationality}</strong>
              <span>의&nbsp;</span>
              <br />
              <strong className="text-xl text-primary">{`'${characterName}'`}</strong>
              <span>{getKorParticle(characterName, "을-를")} 소환합니다.&nbsp;</span>
            </>
          ) : (
            <>
              Summon <strong className="text-xl text-primary">{`'${characterName}'`}</strong>
              <br />
              from <strong className="text-xl text-secondary">{nationality}</strong>
              <br />
              in the <strong className="text-xl text-secondary">{universeId}&nbsp;</strong> universe.
            </>
          )}
        </p>
        <Button className="mt-4" onClick={() => setIsFullscreenOpen(true)}>
          <Lang text={{ ko: "아티팩트 확인하기", en: "Check the artifact" }} />
        </Button>
      </div>
      <div className="fixed inset-0 bg-black/80 z-10" onClick={handleBackgroundClick}></div>

      {/* 전체화면 아티팩트 뷰어 */}
      <PixiFullscreenViewer
        imagePath={artifactImagePath}
        isOpen={isFullscreenOpen}
        onClose={() => setIsFullscreenOpen(false)}
        stageWidth={stageWidth}
        stageHeight={stageHeight}
      />
    </>
  );
};

export default ArtifactViewer;
