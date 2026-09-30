import { useCallback, useRef } from "react";
import { logger } from "utils/log";
import { SpatialGrid, shouldBlockMovementByRoles } from "utils/game";
import type { NpcSpriteType } from "types/game";

interface UseCollisionDetectionProps {
  logicalSpatialGridRef: React.RefObject<SpatialGrid>;
  obstaclesRef: React.RefObject<NpcSpriteType[]>;
  npcsRef: React.RefObject<NpcSpriteType[]>;
  protagonistRef?: React.RefObject<NpcSpriteType | null>;
}

/** v2 논리 world 충돌 그리드만 재구축한다. */
export function useCollisionDetection({
  logicalSpatialGridRef,
  obstaclesRef,
  npcsRef,
  protagonistRef,
}: UseCollisionDetectionProps) {
  const prevStateRef = useRef({ obstaclesCount: 0, npcCount: 0, lastUpdateTime: 0 });

  const updateCollisionGrid = useCallback(
    (opts?: { force?: boolean }): void => {
      const logicalGrid = logicalSpatialGridRef.current;
      if (!logicalGrid) return;

      const now = performance.now();
      if (!opts?.force && now - prevStateRef.current.lastUpdateTime < 100) return;
      prevStateRef.current.lastUpdateTime = now;
      logicalGrid.clear();

      let obstacleCount = 0;
      let npcCount = 0;

      for (const obstacle of obstaclesRef.current ?? []) {
        if (!shouldBlockMovementByRoles(obstacle.role) || !obstacle.__logicalCollision) continue;
        logicalGrid.insert({ ...obstacle.__logicalCollision, role: obstacle.role });
        obstacleCount += 1;
      }

      for (const npc of npcsRef.current ?? []) {
        if (!npc.__logicalCollision) continue;
        const npcId = npc.data?.persona?.pid || npc.label || npc.data?.id || "undefined-npc-id";
        logicalGrid.insert({ ...npc.__logicalCollision, id: npcId, type: "npc" });
        npcCount += 1;
      }

      if (protagonistRef?.current?.__logicalCollision) {
        logicalGrid.insert({
          ...protagonistRef.current.__logicalCollision,
          id: "__protagonist__",
          type: "protagonist",
        });
      }

      if (
        obstacleCount !== prevStateRef.current.obstaclesCount ||
        npcCount !== prevStateRef.current.npcCount
      ) {
        logger.log(`논리 충돌 그리드 업데이트: 장애물 ${obstacleCount}개, NPC ${npcCount}개`);
      }
      prevStateRef.current.obstaclesCount = obstacleCount;
      prevStateRef.current.npcCount = npcCount;
    },
    [logicalSpatialGridRef, obstaclesRef, npcsRef, protagonistRef],
  );

  return { updateCollisionGrid };
}
