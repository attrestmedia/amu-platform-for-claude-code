import { useCallback, useEffect, useRef, useState } from "react";
import type { Application, Container } from "pixi.js";
import type { DirectionType } from "types/game";
import { GAME_CONSTANTS as GC } from "consts/game";
import { useGameStore, useUiControlStore } from "store/game";
import { screenVectorToDirection } from "utils/game";
import { logger } from "utils/log";

/**
 * @docHint
 * @purpose 스테이지 포인터 입력을 캐릭터 이동과 명시적 카메라 패닝으로 분리
 * @process 일반 드래그는 8방향 이동, Space/토글 드래그는 free 카메라 이동
 * @domain game-camera
 * @scope stage-input
 */

function setDragCameraOffset(node: Container | null | undefined, cameraX: number, cameraY: number): boolean {
  if (!node || node.destroyed) return false;
  node.x = -cameraX;
  node.y = -cameraY;
  return true;
}

function resetDragCameraOffset(node: Container | null | undefined): void {
  if (!node || node.destroyed) return;
  if (node.x !== 0 || node.y !== 0) {
    node.x = 0;
    node.y = 0;
  }
}

function isEditableElement(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName))
  );
}

interface UseStageMouseDragParams {
  appRef: React.RefObject<Application | null>;
  currentStageContainerRef?: React.RefObject<Container | null>;
  onDirectionChange: (direction: DirectionType) => void;
}

type StageGesture = "move-character" | "pan-camera";

const useStageMouseDrag = ({
  appRef,
  currentStageContainerRef,
  onDirectionChange,
}: UseStageMouseDragParams) => {
  const [isStagePanModeEnabled, setIsStagePanModeEnabled] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const pointerIdRef = useRef<number | null>(null);
  const gestureRef = useRef<StageGesture | null>(null);
  const originRef = useRef({ x: 0, y: 0 });
  const lastPositionRef = useRef({ x: 0, y: 0 });
  const lastDirectionRef = useRef<DirectionType>(null);
  const dragStartedRef = useRef(false);
  const spacePressedRef = useRef(false);

  const isInputLocked = useUiControlStore((state) => state.isInputLocked);
  const moveCameraBy = useGameStore((state) => state.moveCameraBy);
  const setCameraState = useGameStore((state) => state.setCameraState);
  const setCameraMode = useGameStore((state) => state.setCameraMode);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || isEditableElement(event.target) || isInputLocked) return;
      event.preventDefault();
      spacePressedRef.current = true;
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") spacePressedRef.current = false;
    };
    const handleBlur = () => {
      spacePressedRef.current = false;
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, [isInputLocked]);

  const panCameraBy = useCallback(
    (dx: number, dy: number) => {
      const app = appRef.current;
      if (!app) return;

      const { camera } = useGameStore.getState();
      if (camera.isLocked || camera.mode === "locked") return;

      const speed = (GC.CAMERA as { DRAG_SPEED?: number }).DRAG_SPEED ?? 1;
      moveCameraBy(-dx * speed, -dy * speed, { clampToConstraints: true });

      const { camera: updated } = useGameStore.getState();
      setCameraState({
        targetX: updated.x + updated.width / 2,
        targetY: updated.y + updated.height / 2,
        targetType: "point",
        targetId: null,
      });

      if (setDragCameraOffset(currentStageContainerRef?.current, updated.x, updated.y)) {
        resetDragCameraOffset(app.stage);
      } else {
        setDragCameraOffset(app.stage, updated.x, updated.y);
      }
    },
    [appRef, currentStageContainerRef, moveCameraBy, setCameraState],
  );

  const finishGesture = useCallback(() => {
    if (gestureRef.current === "move-character" && lastDirectionRef.current) {
      onDirectionChange(null);
    }

    if (gestureRef.current === "pan-camera" && dragStartedRef.current) {
      logger.log("[useStageMouseDrag] manual pan end → camera mode retained as free");
    }

    pointerIdRef.current = null;
    gestureRef.current = null;
    lastDirectionRef.current = null;
    dragStartedRef.current = false;
    setIsPanning(false);
  }, [onDirectionChange]);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (isInputLocked || event.button !== 0) return;
      if ((event.target as HTMLElement).tagName !== "CANVAS") return;

      const gesture: StageGesture =
        isStagePanModeEnabled || spacePressedRef.current ? "pan-camera" : "move-character";
      pointerIdRef.current = event.pointerId;
      gestureRef.current = gesture;
      originRef.current = { x: event.clientX, y: event.clientY };
      lastPositionRef.current = { x: event.clientX, y: event.clientY };
      lastDirectionRef.current = null;
      dragStartedRef.current = false;
      setIsPanning(gesture === "pan-camera");
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
    },
    [isInputLocked, isStagePanModeEnabled],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (pointerIdRef.current !== event.pointerId || !gestureRef.current) return;
      event.preventDefault();

      if (isInputLocked) {
        finishGesture();
        return;
      }

      const fromOrigin = {
        screenX: event.clientX - originRef.current.x,
        screenY: event.clientY - originRef.current.y,
      };
      const threshold = GC.UI.MOVEMENT_THRESHOLD ?? 10;

      if (gestureRef.current === "move-character") {
        const direction = screenVectorToDirection(fromOrigin, threshold);
        if (direction !== lastDirectionRef.current) {
          lastDirectionRef.current = direction;
          onDirectionChange(direction);
        }
        return;
      }

      if (!dragStartedRef.current) {
        if (Math.hypot(fromOrigin.screenX, fromOrigin.screenY) < threshold) return;
        const { camera } = useGameStore.getState();
        if (camera.isLocked || camera.mode === "locked") return;
        dragStartedRef.current = true;
        setCameraMode("free");
        logger.log("[useStageMouseDrag] manual pan start → camera mode = free");
      }

      const dx = event.clientX - lastPositionRef.current.x;
      const dy = event.clientY - lastPositionRef.current.y;
      panCameraBy(dx, dy);
      lastPositionRef.current = { x: event.clientX, y: event.clientY };
    },
    [finishGesture, isInputLocked, onDirectionChange, panCameraBy, setCameraMode],
  );

  const handlePointerEnd = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (pointerIdRef.current !== event.pointerId) return;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      finishGesture();
    },
    [finishGesture],
  );

  const toggleStagePanMode = useCallback(() => {
    setIsStagePanModeEnabled((enabled) => !enabled);
  }, []);

  return {
    isStagePanModeEnabled,
    isPanning,
    toggleStagePanMode,
    handlePointerDown,
    handlePointerMove,
    handlePointerEnd,
  };
};

export default useStageMouseDrag;
