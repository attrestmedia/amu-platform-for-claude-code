import { useEffect, useRef, type RefObject } from "react";
import type { Application } from "pixi.js";
import type { IStageData } from "types/game";
import {
  pickIsometricTargetAtViewportPoint,
  resolveIsometricViewportRuntime,
  type IsometricPickObject,
} from "utils/game";
import { useGameStore } from "store/game";

export const ISOMETRIC_STAGE_PICK_EVENT = "isometricStagePick";

interface UseIsometricPointerPickingParams {
  appRef: RefObject<Application | null>;
  stageDataRef: RefObject<Record<string, IStageData>>;
  enabled: boolean;
}

interface PointerStart {
  pointerId: number;
  clientX: number;
  clientY: number;
}

export default function useIsometricPointerPicking({
  appRef,
  stageDataRef,
  enabled,
}: UseIsometricPointerPickingParams): void {
  const pointerStartRef = useRef<PointerStart | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const app = appRef.current as (Application & { canvas?: HTMLCanvasElement }) | null;
    const canvas = app?.canvas;
    if (!canvas) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      pointerStartRef.current = {
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
      };
    };

    const clearPointer = () => {
      pointerStartRef.current = null;
    };

    const handlePointerUp = (event: PointerEvent) => {
      const start = pointerStartRef.current;
      clearPointer();
      if (!start || start.pointerId !== event.pointerId) return;
      if (Math.hypot(event.clientX - start.clientX, event.clientY - start.clientY) > 5) return;

      const stageData = Object.values(stageDataRef.current).find(
        (candidate) => resolveIsometricViewportRuntime(candidate) !== null,
      );
      const runtime = resolveIsometricViewportRuntime(stageData);
      if (!runtime) return;

      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const { camera } = useGameStore.getState();
      const viewportWidth = camera.width > 0 ? camera.width : rect.width;
      const viewportHeight = camera.height > 0 ? camera.height : rect.height;
      const viewportPoint = {
        screenX: ((event.clientX - rect.left) / rect.width) * viewportWidth,
        screenY: ((event.clientY - rect.top) / rect.height) * viewportHeight,
      };
      const objects: IsometricPickObject[] = (stageData?.obstacles ?? [])
        .filter((obstacle) => obstacle.isoRender)
        .map((obstacle) => ({
          id: obstacle.id,
          gridPoint: obstacle.isoRender!.gridPoint,
          footprint: obstacle.isoRender!.footprint,
          depthKey: obstacle.isoRender!.depthKey,
        }));
      const result = pickIsometricTargetAtViewportPoint(viewportPoint, camera, runtime, objects);
      if (!result) return;

      window.dispatchEvent(
        new CustomEvent(ISOMETRIC_STAGE_PICK_EVENT, {
          detail: result,
        }),
      );
    };

    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("pointercancel", clearPointer);
    return () => {
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("pointercancel", clearPointer);
      pointerStartRef.current = null;
    };
  }, [appRef, enabled, stageDataRef]);
}
