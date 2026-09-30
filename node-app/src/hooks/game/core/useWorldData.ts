import { useCallback } from "react";
import type { IStageData, IWorldData, IWorldObject, NpcSpriteType } from "types/game";
import {
  getCameraViewport,
  getIsometricCameraConstraints,
  isWorldRectInViewport,
  projectLogicalPosition,
  resolveIsometricMovementRuntime,
  resolveIsometricViewportRuntime,
} from "utils/game";
import { useGameStore } from "store/game";

/** 미니맵·카메라 관측용 worldData를 v2 투영 좌표에서만 생성한다. */
export function useWorldData(params: {
  stageDataRef: React.RefObject<Record<string, IStageData>>;
  protagonistRef: React.RefObject<NpcSpriteType | null>;
  userSize: number;
  npcSize: number;
  stageWidth: number;
  stageHeight: number;
}) {
  const { stageDataRef, protagonistRef, userSize, npcSize, stageWidth, stageHeight } = params;
  const storeWorldData = useGameStore((state) => state.worldData);
  const setWorldData = useGameStore((state) => state.setWorldData);
  const worldData = storeWorldData;

  const updateWorldData = useCallback(() => {
    const stageData = Object.values(stageDataRef.current)[0];
    const movementRuntime = resolveIsometricMovementRuntime(stageData);
    const viewportRuntime = resolveIsometricViewportRuntime(stageData);
    if (!stageData || !movementRuntime || !viewportRuntime) return;

    const objects: IWorldObject[] = [];
    for (const obstacle of stageData.obstacles) {
      if (!obstacle.isoRender) continue;
      objects.push({
        id: obstacle.id,
        type: "obstacle",
        x: obstacle.isoRender.screenPoint.screenX,
        y: obstacle.isoRender.screenPoint.screenY,
        width: obstacle.width ?? 1,
        height: obstacle.height ?? 1,
        role: obstacle.isoRender.layer === "ground" ? ["road"] : ["obstacle"],
      });
    }

    for (const npc of useGameStore.getState().npcs) {
      if (!npc.logicalPosition) continue;
      const screen = projectLogicalPosition(npc.logicalPosition, movementRuntime);
      objects.push({ id: npc.id, type: "npc", x: screen.screenX, y: screen.screenY, width: npcSize, height: npcSize });
    }

    const protagonist = protagonistRef.current;
    if (protagonist?.__logicalPosition) {
      const screen = projectLogicalPosition(protagonist.__logicalPosition, movementRuntime);
      objects.push({ id: "protagonist", type: "protagonist", x: screen.screenX, y: screen.screenY, width: userSize, height: userSize });
    }

    const next: IWorldData = { stageWidth, stageHeight, objects };
    setWorldData(next);
    useGameStore.getState().setCameraConstraints(getIsometricCameraConstraints(viewportRuntime));
  }, [npcSize, protagonistRef, setWorldData, stageDataRef, stageHeight, stageWidth, userSize]);

  const getFilteredWorldData = useCallback(
    (viewportX: number, viewportY: number, viewWidth: number, viewHeight: number) => ({
      ...worldData,
      objects: worldData.objects.filter((object) =>
        isWorldRectInViewport(object, { x: viewportX, y: viewportY, width: viewWidth, height: viewHeight }, npcSize * 2),
      ),
    }),
    [npcSize, worldData],
  );

  const getWorldDataForCamera = useCallback(() => {
    const viewport = getCameraViewport();
    return getFilteredWorldData(viewport.x, viewport.y, viewport.width, viewport.height);
  }, [getFilteredWorldData]);

  return { worldData, updateWorldData, getFilteredWorldData, getWorldDataForCamera };
}
