"use client";

import React, { useRef, useEffect, useState } from "react";
import { Application, Assets, Sprite, Container, Graphics } from "pixi.js";
import type { BLEND_MODES } from "pixi.js";
import "pixi.js/advanced-blend-modes"; // 고급 블렌드 모드 활성화
import { Preloader } from "@amu-labs/ui";
import { logger } from "utils/log";

// 블렌드 모드 매핑 객체 생성
const blendModeMap: Record<string, string> = {
  normal: "normal",
  add: "add",
  multiply: "multiply",
  screen: "screen",
  overlay: "overlay",
  darken: "darken",
  lighten: "lighten",
  "color-dodge": "color-dodge",
  "color-burn": "color-burn",
  "hard-light": "hard-light",
  "soft-light": "soft-light",
  difference: "difference",
  exclusion: "exclusion",
  hue: "hue",
  saturation: "saturation",
  color: "color",
  luminosity: "luminosity",
};

export interface ArtifactItemProps {
  backgroundImagePath?: string;
  artifactImagePath: string;
  width?: number;
  height?: number;
  cornerRadius?: number;
  blendMode?: string;
  effectIntensity?: number;
  className?: string;
  onLoadComplete?: () => void;
}

const ArtifactItem = ({
  backgroundImagePath = "/assets/items/artifact.png",
  artifactImagePath,
  width = 256,
  height = 256,
  cornerRadius = 16,
  blendMode = "normal",
  effectIntensity = 1.0,
  className,
  onLoadComplete,
}: ArtifactItemProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const appRef = useRef<Application | null>(null);

  // 강도 값을 정규화 (0-1 범위로 제한)
  const normalizedIntensity = Math.max(0, Math.min(1, effectIntensity));

  useEffect(() => {
    // PixiJS 애플리케이션 초기화 및 리소스 로드
    const initPixi = async () => {
      if (!containerRef.current) return;

      // 이전 앱 정리
      if (appRef.current) {
        appRef.current.destroy();
      }

      // 기존에 있을 수 있는 모든 canvas 제거
      while (containerRef.current.firstChild) {
        containerRef.current.removeChild(containerRef.current.firstChild);
      }

      try {
        setIsLoading(true);

        // 사용자 정의 캔버스 생성
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        canvas.style.touchAction = "none";
        canvas.style.cursor = "inherit";

        // 컨테이너에 캔버스 추가
        containerRef.current.appendChild(canvas);

        // PixiJS v8 애플리케이션 생성 (기존 캔버스 사용)
        const app = new Application();

        // 초기화 - 기존 캔버스 사용
        await app.init({
          backgroundAlpha: 0, // 투명 배경
          antialias: true,
          resolution: 1,
          width,
          height,
          canvas, // 기존 캔버스 사용
          useBackBuffer: true, // 고급 블렌드 모드를 위해 필요
        });

        appRef.current = app;

        // 이미지 로드
        const [backgroundTexture, artifactTexture] = await Promise.all([
          backgroundImagePath ? Assets.load(backgroundImagePath) : null,
          Assets.load(artifactImagePath),
        ]);

        // 메인 컨테이너 생성
        const mainContainer = new Container();

        // 배경 이미지가 있는 경우에만 배경 추가
        if (backgroundTexture) {
          const background = new Sprite(backgroundTexture);
          background.width = width;
          background.height = height;
          mainContainer.addChild(background);
        }

        // 아티팩트 이미지 컨테이너 생성
        const artifactContainer = new Container();
        artifactContainer.x = width / 2;
        artifactContainer.y = height / 2;

        // 아티팩트 이미지 스프라이트 생성 (블렌드 모드 직접 전달)
        const artifact = new Sprite({
          texture: artifactTexture,
          width: width * 0.8,
          height: height * 0.8,
          anchor: 0.5,
          blendMode: blendModeMap[blendMode] as BLEND_MODES,
        });

        // 블렌딩 효과 강도 조절 (알파값 사용)
        artifact.alpha = normalizedIntensity;

        // 아티팩트에 대한 마스크 생성 (PixiJS v8 방식)
        const artifactMask = new Graphics();
        // 아티팩트 스프라이트의 크기에 맞게 둥근 사각형 그리기
        const maskWidth = width * 0.76;
        const maskHeight = height * 0.76;
        const maskX = -maskWidth / 2; // 앵커가 0.5이므로 중앙을 기준으로 계산
        const maskY = -maskHeight / 2;

        // v8 스타일의 Graphics API 사용
        artifactMask.roundRect(maskX, maskY, maskWidth, maskHeight, cornerRadius).fill(0xffffff);

        // 아티팩트 스프라이트에 마스크 적용
        artifact.mask = artifactMask;

        // 마스크도 컨테이너에 추가
        artifactContainer.addChild(artifactMask);

        // 요소 추가
        artifactContainer.addChild(artifact);
        mainContainer.addChild(artifactContainer);

        // 스테이지에 컨테이너 추가
        app.stage.addChild(mainContainer);

        setIsLoading(false);

        // 로드 완료 콜백 호출
        if (onLoadComplete) {
          onLoadComplete();
        }
      } catch (error) {
        logger.error("PixiJS 초기화 오류:", error);
        setIsLoading(false);
      }
    };

    initPixi();

    // 클린업 함수
    return () => {
      if (appRef.current) {
        appRef.current.destroy(true);
        appRef.current = null;
      }
    };
  }, [
    artifactImagePath,
    backgroundImagePath,
    blendMode,
    normalizedIntensity,
    width,
    height,
    cornerRadius,
    onLoadComplete,
  ]);

  return (
    <div className={className || ""}>
      <div ref={containerRef} className="w-full h-full rounded-xl overflow-hidden" />
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 rounded-xl">
          <Preloader variant="spin" size="md" />
        </div>
      )}
    </div>
  );
};

export default ArtifactItem;
