"use client";

import React, { useRef, useEffect, useState, useLayoutEffect } from "react";
import { Application, Assets, Sprite, Container } from "pixi.js";
import { X, ZoomIn, ZoomOut } from "lucide-react";
import { Button, Preloader } from "@amu-labs/ui";
import { cn } from "utils/common";
import { logger } from "utils/log";

interface PixiFullscreenViewerProps {
  imagePath: string;
  isOpen: boolean;
  onClose: () => void;
  className?: string;
  stageWidth?: number;
  stageHeight?: number;
}

function PixiFullscreenViewer({
  imagePath,
  isOpen,
  onClose,
  className,
  stageWidth,
  stageHeight,
}: PixiFullscreenViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const spriteRef = useRef<Sprite | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const scaleRef = useRef(1); // 현재 스케일을 실시간으로 추적하는 ref
  const [isPanning, setIsPanning] = useState(false);
  const [lastPosition, setLastPosition] = useState({ x: 0, y: 0 });

  // 핀치 줌 관련 상태
  const [isPinching, setIsPinching] = useState(false);
  const [pinchDistance, setPinchDistance] = useState(0);

  // 최소 및 최대 줌 레벨 설정
  const MIN_SCALE = 0.1;
  const MAX_SCALE = 5;
  const ZOOM_STEP = 0.2;

  // 두 터치 포인트 간의 거리 계산 함수
  const calculateDistance = (touch1: Touch, touch2: Touch): number => {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // 이미지 위치 제한 함수 - 스테이지 경계에 맞게 제한
  const constrainPosition = () => {
    if (!spriteRef.current || !appRef.current) return;

    const sprite = spriteRef.current;
    const app = appRef.current;

    // 안전하게 렌더러 크기 가져오기
    const containerWidth = app.renderer.width;
    const containerHeight = app.renderer.height;

    // 스프라이트의 실제 표시 크기 계산 (스케일 적용)
    const scaledWidth = sprite.texture.width * sprite.scale.x;
    const scaledHeight = sprite.texture.height * sprite.scale.y;

    // 스프라이트가 컨테이너보다 작거나 같으면 중앙에 배치
    if (scaledWidth <= containerWidth) {
      sprite.x = containerWidth / 2;
    } else {
      // 이미지가 더 큰 경우, 항상 이미지의 경계가 스테이지 경계와 맞닿도록 제한
      const halfWidth = scaledWidth / 2;

      // 왼쪽 경계가 화면을 벗어나지 않도록 제한
      if (sprite.x - halfWidth > 0) {
        sprite.x = halfWidth; // 왼쪽 경계를 스테이지 왼쪽 경계에 맞춤
      }
      // 오른쪽 경계가 화면을 벗어나지 않도록 제한
      else if (sprite.x + halfWidth < containerWidth) {
        sprite.x = containerWidth - halfWidth; // 오른쪽 경계를 스테이지 오른쪽 경계에 맞춤
      }
    }

    // 스프라이트가 컨테이너보다 작거나 같으면 중앙에 배치
    if (scaledHeight <= containerHeight) {
      sprite.y = containerHeight / 2;
    } else {
      // 이미지가 더 큰 경우, 항상 이미지의 경계가 스테이지 경계와 맞닿도록 제한
      const halfHeight = scaledHeight / 2;

      // 위쪽 경계가 화면을 벗어나지 않도록 제한
      if (sprite.y - halfHeight > 0) {
        sprite.y = halfHeight; // 위쪽 경계를 스테이지 위쪽 경계에 맞춤
      }
      // 아래쪽 경계가 화면을 벗어나지 않도록 제한
      else if (sprite.y + halfHeight < containerHeight) {
        sprite.y = containerHeight - halfHeight; // 아래쪽 경계를 스테이지 아래쪽 경계에 맞춤
      }
    }
  };

  // 확대/축소 함수
  const handleZoom = (zoomIn: boolean) => {
    if (!spriteRef.current || !appRef.current) return;

    const sprite = spriteRef.current;

    // 항상 최신 스케일 값을 사용
    const currentScale = scaleRef.current;

    // 새 스케일 계산
    const newScale = zoomIn
      ? Math.min(currentScale + ZOOM_STEP, MAX_SCALE)
      : Math.max(currentScale - ZOOM_STEP, MIN_SCALE);

    // 스케일 적용
    sprite.scale.set(newScale);

    // ref와 state 모두 업데이트
    scaleRef.current = newScale;

    // 경계 제한 업데이트
    constrainPosition();
  };

  // 핀치 줌 처리 함수
  const handlePinchZoom = (newDistance: number) => {
    if (!spriteRef.current || !appRef.current || !pinchDistance) return;

    const sprite = spriteRef.current;
    const currentScale = scaleRef.current;

    // 거리 비율 계산
    const ratio = newDistance / pinchDistance;

    // 비율에 따라 새 스케일 계산
    const scaleFactor = 0.5; // 민감도
    const newScale = currentScale * (1 + (ratio - 1) * scaleFactor);

    // 최소/최대 스케일 제한
    const clampedScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));

    // 스케일 적용
    sprite.scale.set(clampedScale);

    // ref와 state 업데이트
    scaleRef.current = clampedScale;

    // 핀치 거리 업데이트
    setPinchDistance(newDistance);

    // 경계 제한 업데이트
    constrainPosition();
  };

  // 크기 관찰을 위한 ResizeObserver 설정
  useEffect(() => {
    if (!isOpen || !containerRef.current) return;

    const container = containerRef.current;

    // ResizeObserver를 사용하여 컨테이너 크기 변화 감지
    const resizeObserver = new ResizeObserver((entries) => {
      if (!appRef.current) return;

      for (const entry of entries) {
        // contentRect에서 너비와 높이 가져오기
        const { width, height } = entry.contentRect;

        // 유효한 크기인지 확인
        if (width > 0 && height > 0 && appRef.current) {
          // 렌더러 크기 업데이트
          appRef.current.renderer.resize(width, height);

          // 스프라이트가 있으면 중앙 위치 업데이트
          if (spriteRef.current) {
            spriteRef.current.x = width / 2;
            spriteRef.current.y = height / 2;
            constrainPosition();
          }
        }
      }
    });

    // 컨테이너 관찰 시작
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, [isOpen]);

  // 애플리케이션 초기화 및 이미지 로드 - useLayoutEffect 사용
  useLayoutEffect(() => {
    if (!isOpen || !containerRef.current) return;

    const initPixi = async () => {
      // 컨테이너 요소를 변수에 할당하고 명시적으로 null 체크
      const container = containerRef.current;
      if (!container) return;

      try {
        setIsLoading(true);

        // 기존 앱 정리
        if (appRef.current) {
          appRef.current.destroy();
          appRef.current = null;
        }

        // 컨테이너의 모든 자식 요소 제거
        while (container.firstChild) {
          container.removeChild(container.firstChild);
        }

        // 뷰포트 크기 사용하거나 컨테이너 크기 계산
        const viewWidth = window.innerWidth;
        const viewHeight = window.innerHeight;

        // PixiJS 애플리케이션 생성 및 초기화
        const app = new Application();
        await app.init({
          backgroundAlpha: 0,
          antialias: true,
          resolution: window.devicePixelRatio || 1,
          width: viewWidth,
          height: viewHeight,
        });

        appRef.current = app;
        container.appendChild(app.canvas);

        // 캔버스 스타일 설정 - 크기 문제 해결을 위한 추가 조치
        app.canvas.style.width = "100%";
        app.canvas.style.height = "100%";
        app.canvas.style.display = "block";
        app.canvas.style.objectFit = "contain";

        // 이미지 로드
        const texture = await Assets.load(imagePath);

        // 메인 컨테이너 생성
        const mainContainer = new Container();
        app.stage.addChild(mainContainer);

        // 스프라이트 생성
        const sprite = new Sprite(texture);

        // 스프라이트를 화면에 맞게 조정
        let scaleX = viewWidth / sprite.width;
        let scaleY = viewHeight / sprite.height;

        // 스테이지 크기가 제공된 경우 이를 고려하여 스케일 조정
        if (stageWidth && stageHeight) {
          // 이미지의 원래 비율 유지를 위해 스테이지 비율을 고려
          const stageRatio = stageWidth / stageHeight;
          const imageRatio = sprite.width / sprite.height;

          // 스테이지 비율과 이미지 비율 간의 차이에 따라 스케일 조정
          if (stageRatio > imageRatio) {
            // 스테이지가 더 넓은 경우
            scaleX = (viewWidth * 0.95) / sprite.width;
            scaleY = (viewHeight * 0.95) / sprite.height;
          } else {
            // 스테이지가 더 좁은 경우
            scaleX = (viewWidth * 0.9) / sprite.width;
            scaleY = (viewHeight * 0.9) / sprite.height;
          }
        }

        const initialScale = Math.min(scaleX, scaleY) * 0.9; // 90%로 시작해서 여백 확보

        sprite.scale.set(initialScale);
        sprite.anchor.set(0.5);
        sprite.x = viewWidth / 2;
        sprite.y = viewHeight / 2;

        // 스프라이트를 컨테이너에 추가
        mainContainer.addChild(sprite);

        // 참조 저장
        spriteRef.current = sprite;
        scaleRef.current = initialScale; // ref도 함께 초기화

        setIsLoading(false);

        // 윈도우 리사이즈 이벤트 핸들러
        const handleResize = () => {
          if (!appRef.current || !sprite) return;

          const newWidth = window.innerWidth;
          const newHeight = window.innerHeight;

          appRef.current.renderer.resize(newWidth, newHeight);

          // 중앙 위치 재조정
          sprite.x = newWidth / 2;
          sprite.y = newHeight / 2;

          // 경계 제한 업데이트
          constrainPosition();
        };

        window.addEventListener("resize", handleResize);

        return () => {
          window.removeEventListener("resize", handleResize);
        };
      } catch (error) {
        logger.error("PixiJS 초기화 오류:", error);
        setIsLoading(false);
      }
    };

    // 약간의 지연 후 초기화 - DOM이 완전히 렌더링되도록 보장
    const timeoutId = setTimeout(() => {
      initPixi();
    }, 50);

    return () => {
      clearTimeout(timeoutId);
      if (appRef.current) {
        appRef.current.destroy(true);
        appRef.current = null;
      }
    };
    // stageWidth/stageHeight는 effect 내부 helper에서 사용되지만 변경 시 효과 재시작이 의도되지 않음
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, imagePath]);

  // 마우스/터치 이벤트 핸들러 (드래그 기능)
  useEffect(() => {
    if (!isOpen || !containerRef.current) return;

    const container = containerRef.current;

    // 포인터 다운 이벤트 - 드래그 시작
    const handlePointerDown = (e: PointerEvent) => {
      if (!spriteRef.current) return;

      e.preventDefault();
      setIsPanning(true);
      setLastPosition({ x: e.clientX, y: e.clientY });

      // 드래그 중 커서 스타일 적용
      container.style.cursor = "grabbing";
    };

    // 포인터 이동 이벤트 - 이미지 이동
    const handlePointerMove = (e: PointerEvent) => {
      if (!isPanning || !spriteRef.current || !appRef.current || isPinching) return;

      const sprite = spriteRef.current;

      // 이동 거리 계산
      const dx = e.clientX - lastPosition.x;
      const dy = e.clientY - lastPosition.y;

      // 스프라이트 위치 업데이트
      sprite.x += dx;
      sprite.y += dy;

      // 경계 제한 적용 (매 이동마다 적용)
      constrainPosition();

      // 마지막 위치 업데이트
      setLastPosition({ x: e.clientX, y: e.clientY });
    };

    // 포인터 업/리브 이벤트 - 드래그 종료
    const handlePointerEnd = () => {
      if (isPanning) {
        constrainPosition(); // 드래그 종료 시 최종 위치 제한 적용
      }

      setIsPanning(false);

      // 드래그 종료 시 커서 스타일 복원
      if (container) {
        container.style.cursor = "grab";
      }
    };

    // 마우스 휠 이벤트 - 줌
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      // 휠 이벤트의 deltaY 값에 따라 줌인/줌아웃
      // deltaY가 음수면 줌인, 양수면 줌아웃
      handleZoom(e.deltaY < 0);
    };

    // 터치 시작 이벤트 - 핀치 줌 시작
    const handleTouchStart = (e: TouchEvent) => {
      // 두 손가락 터치인 경우에만 핀치 줌 시작
      if (e.touches.length === 2) {
        e.preventDefault();

        // 핀치 모드 활성화
        setIsPinching(true);

        // 현재 드래그 모드 비활성화
        setIsPanning(false);

        // 초기 핀치 거리 계산 및 저장
        const initialDistance = calculateDistance(e.touches[0], e.touches[1]);
        setPinchDistance(initialDistance);
      }
    };

    // 터치 이동 이벤트 - 핀치 줌 중
    const handleTouchMove = (e: TouchEvent) => {
      // 핀치 줌 중이고 두 손가락 터치인 경우
      if (isPinching && e.touches.length === 2) {
        e.preventDefault();

        // 현재 핀치 거리 계산
        const currentDistance = calculateDistance(e.touches[0], e.touches[1]);

        // 핀치 줌 처리
        handlePinchZoom(currentDistance);

        // 핀치 중앙점을 계산하여 드래그 위치 업데이트 (선택적)
        const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;

        // 이전 위치가 있으면 이동 처리
        if (isPinching && lastPosition.x !== 0 && lastPosition.y !== 0) {
          if (spriteRef.current) {
            // 이동 거리 계산
            const dx = centerX - lastPosition.x;
            const dy = centerY - lastPosition.y;

            // 스프라이트 위치 업데이트
            spriteRef.current.x += dx;
            spriteRef.current.y += dy;

            // 경계 제한 적용
            constrainPosition();
          }
        }

        // 마지막 위치 업데이트
        setLastPosition({ x: centerX, y: centerY });
      }
    };

    // 터치 종료 이벤트 - 핀치 줌 종료
    const handleTouchEnd = (e: TouchEvent) => {
      // 핀치 줌 중이었고 터치가 2개 미만이면 핀치 줌 종료
      if (isPinching && e.touches.length < 2) {
        setIsPinching(false);
        setPinchDistance(0);
        setLastPosition({ x: 0, y: 0 });

        // 경계 확인
        constrainPosition();
      }
    };

    // 이벤트 리스너 등록
    container.addEventListener("pointerdown", handlePointerDown, { passive: false });
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerEnd);
    window.addEventListener("pointercancel", handlePointerEnd);
    window.addEventListener("pointerleave", handlePointerEnd);
    container.addEventListener("wheel", handleWheel, { passive: false });

    // 터치 이벤트 리스너 등록
    container.addEventListener("touchstart", handleTouchStart, { passive: false });
    container.addEventListener("touchmove", handleTouchMove, { passive: false });
    container.addEventListener("touchend", handleTouchEnd);
    container.addEventListener("touchcancel", handleTouchEnd);

    // 컴포넌트 언마운트 시 이벤트 리스너 정리
    return () => {
      container.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerEnd);
      window.removeEventListener("pointercancel", handlePointerEnd);
      window.removeEventListener("pointerleave", handlePointerEnd);
      container.removeEventListener("wheel", handleWheel);

      // 터치 이벤트 리스너 제거
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
      container.removeEventListener("touchend", handleTouchEnd);
      container.removeEventListener("touchcancel", handleTouchEnd);
    };
    // handleZoom/handlePinchZoom은 effect 내부 클로저로 매번 새로 생성되어 deps 의존성 추가가 불필요
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isPanning, lastPosition, isPinching, pinchDistance]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90">
      {/* 상단 제어 바 */}
      <div className="absolute top-2 right-2 flex flex-col gap-2 z-10">
        <Button variant="blank" onClick={onClose} className="w-8 h-8">
          <X width={24} height={24} className="text-white" />
        </Button>
        <Button variant="blank" onClick={() => handleZoom(true)} className="w-8 h-8">
          <ZoomIn width={24} height={24} className="text-white" />
        </Button>
        <Button variant="blank" onClick={() => handleZoom(false)} className="w-8 h-8">
          <ZoomOut width={24} height={24} className="text-white" />
        </Button>
      </div>

      {/* 메인 컨테이너 */}
      <div
        ref={containerRef}
        className={cn("w-full h-full cursor-grab", className)}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          touchAction: "none", // 브라우저 기본 터치 동작 방지
        }}
      />

      {/* 로딩 인디케이터 */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Preloader variant="spin" size="lg" />
        </div>
      )}
    </div>
  );
}

export default PixiFullscreenViewer;
