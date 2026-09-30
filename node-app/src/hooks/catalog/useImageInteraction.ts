import { useEffect, useCallback, useRef } from "react";
import type { IAnnotation } from "types/catalog";
import { DEFAULT_ANNOTATION_SIZE } from "consts/catalog";
import { useAnnotationState } from "./useAnnotationState";
import { useCatalogStore } from "store/catalog";
import { logger } from "utils/log";

/**
 * @docHint
 * @purpose useImageInteraction 훅 클라이언트 로직 캡슐화
 * @process 상태/이펙트/구독 구성  API 호출/스토어 연동  재사용 동작 제공
 * @domain catalog
 * @scope feature
 */

const useImageInteraction = () => {
  const {
    currentMode,
    currentClassType,
    currentColor,
    scale,
    setScale,
    isPanning,
    isPanningActive,
    setIsPanningActive,
    panStart,
    setPanStart,
    panOffset,
    setPanOffset,
    oriImageSize,
    setOriImageSize,
    scaleImageSize,
    setScaleImageSize,
    setIsScrollbarClicked,
    imageRef,
    containerRef,
  } = useAnnotationState();

  const { setSelectedAnnotationIndex, setAnnotations, setIsSaved } = useCatalogStore();

  const handleImageLoad = useCallback(
    (imageElement?: HTMLImageElement | null) => {
      const imgElement = imageElement ?? imageRef.current;
      if (!imgElement) return;

      setOriImageSize({
        width: imgElement.naturalWidth,
        height: imgElement.naturalHeight,
      });
      setScaleImageSize({
        width: imgElement.naturalWidth * scale,
        height: imgElement.naturalHeight * scale,
      });
    },
    [imageRef, scale, setOriImageSize, setScaleImageSize],
  );

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      const newScale = Math.min(Math.max(0.5, scale + e.deltaY * -0.001), 3);
      setScale(newScale);

      if (oriImageSize) {
        const scaleImageWidth = oriImageSize.width * newScale;
        const scaleImageHeight = oriImageSize.height * newScale;
        setScaleImageSize({
          width: scaleImageWidth,
          height: scaleImageHeight,
        });
      }
    },
    [scale, setScale, oriImageSize, setScaleImageSize],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.addEventListener("wheel", handleWheel, { passive: false });
    }
    return () => {
      if (container) {
        container.removeEventListener("wheel", handleWheel);
      }
    };
  }, [handleWheel, containerRef]);

  // 드래그 감지를 위한 참조
  const isDraggingRef = useRef(false);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const dragThreshold = DEFAULT_ANNOTATION_SIZE.width; // 드래그 시작을 판단할 최소 거리 (픽셀 단위)

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 2) return;

      const isClosest = (targetName: string) => (e.target as HTMLElement).closest(targetName);
      if (isClosest(".annotation-box") || isClosest("button") || isPanningActive) return;

      if (currentMode === "masking") {
        logger.log("Masking mode active. No annotation will be created.");
        return; // Masking 모드일 때는 어노테이션을 생성하지 않음
      }

      if (containerRef.current) {
        const containerRect = containerRef.current.getBoundingClientRect();

        if (
          e.clientX > containerRect.left + containerRef.current.clientWidth ||
          e.clientY > containerRect.top + containerRef.current.clientHeight
        ) {
          setIsScrollbarClicked(true);
        } else {
          setIsScrollbarClicked(false);

          if (isPanning) {
            setIsPanningActive(true);
            setPanStart({ x: e.clientX, y: e.clientY });
          } else {
            if (!imageRef.current || !scaleImageSize || !oriImageSize) return;

            const rect = imageRef.current.getBoundingClientRect();
            const startX = (e.clientX - rect.left - panOffset.x) / scale;
            const startY = (e.clientY - rect.top - panOffset.y) / scale;

            // 드래그 시작 위치 저장
            startPosRef.current = { x: startX, y: startY };
            isDraggingRef.current = false;

            const handleMouseMove = (moveEvent: MouseEvent) => {
              if (!startPosRef.current) return;

              const currentX = (moveEvent.clientX - rect.left - panOffset.x) / scale;
              const currentY = (moveEvent.clientY - rect.top - panOffset.y) / scale;

              const deltaX = currentX - startPosRef.current.x;
              const deltaY = currentY - startPosRef.current.y;
              const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

              if (!isDraggingRef.current && distance >= dragThreshold) {
                isDraggingRef.current = true;
                // 새로운 어노테이션 생성
                const newAnnotation: IAnnotation = {
                  x: startPosRef.current.x,
                  y: startPosRef.current.y,
                  width: DEFAULT_ANNOTATION_SIZE.width / scale,
                  height: DEFAULT_ANNOTATION_SIZE.height / scale,
                  color: currentColor, // 기본 색상
                  label: "자동 생성 객체", // 기본 라벨
                  classType: currentClassType || "1",
                };
                setAnnotations((prevAnnotations) => {
                  const updatedAnnotations = [...prevAnnotations, newAnnotation];
                  setSelectedAnnotationIndex(updatedAnnotations.length - 1);
                  return updatedAnnotations;
                });
              }

              if (isDraggingRef.current) {
                // 어노테이션 크기 및 위치 업데이트
                let width = Math.abs(currentX - startPosRef.current.x);
                let height = Math.abs(currentY - startPosRef.current.y);
                let x = Math.min(currentX, startPosRef.current.x);
                let y = Math.min(currentY, startPosRef.current.y);

                // 이미지 경계를 벗어나지 않도록 조정
                x = Math.max(0, Math.min(x, oriImageSize.width - DEFAULT_ANNOTATION_SIZE.width / scale));
                y = Math.max(0, Math.min(y, oriImageSize.height - DEFAULT_ANNOTATION_SIZE.height / scale));
                width = Math.max(10 / scale, width); // 최소 크기 설정
                height = Math.max(10 / scale, height);

                setAnnotations((currentAnnotations) => {
                  const updatedAnnotations = [...currentAnnotations];
                  const lastIndex = updatedAnnotations.length - 1;
                  updatedAnnotations[lastIndex] = {
                    ...updatedAnnotations[lastIndex],
                    x,
                    y,
                    width,
                    height,
                  };
                  return updatedAnnotations;
                });
              }
            };

            const handleMouseUp = () => {
              if (isDraggingRef.current) {
                setIsSaved(false);
              }
              document.removeEventListener("mousemove", handleMouseMove);
              document.removeEventListener("mouseup", handleMouseUp);
              startPosRef.current = null;
              isDraggingRef.current = false;
            };

            document.addEventListener("mousemove", handleMouseMove);
            document.addEventListener("mouseup", handleMouseUp);
          }
        }
      }
    },
    [
      isPanning,
      isPanningActive,
      oriImageSize,
      scaleImageSize,
      scale,
      panOffset,
      containerRef,
      imageRef,
      setIsScrollbarClicked,
      setIsPanningActive,
      setPanStart,
      setAnnotations,
      setSelectedAnnotationIndex,
      currentColor,
      setIsSaved,
      currentMode,
      currentClassType,
      dragThreshold,
    ],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isPanning && isPanningActive && panStart) {
        const deltaX = (e.clientX - panStart.x) / scale;
        const deltaY = (e.clientY - panStart.y) / scale;

        const newPanOffsetX = Math.min(
          0,
          Math.max(panOffset.x + deltaX, containerRef.current!.offsetWidth - imageRef.current!.offsetWidth * scale),
        );

        const newPanOffsetY = Math.min(
          0,
          Math.max(panOffset.y + deltaY, containerRef.current!.offsetHeight - imageRef.current!.offsetHeight * scale),
        );

        setPanOffset({ x: newPanOffsetX, y: newPanOffsetY });
        setPanStart({ x: e.clientX, y: e.clientY });
      }
    },
    [isPanning, isPanningActive, panStart, scale, panOffset, setPanOffset, setPanStart, containerRef, imageRef],
  );

  const handleMouseUp = useCallback(() => {
    setIsPanningActive(false);
    setPanStart(null);
    setIsScrollbarClicked(false);
  }, [setIsPanningActive, setPanStart, setIsScrollbarClicked]);

  return {
    handleImageLoad,
    handleWheel,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
  };
};

export default useImageInteraction;
