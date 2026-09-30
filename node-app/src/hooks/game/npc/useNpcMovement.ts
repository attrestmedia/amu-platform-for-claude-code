import { useCallback, useEffect, useRef } from "react";
import {
  calculateDirection8,
  CHARACTER_FOOTPRINT_TILES,
  createCharacterDepthKey,
  createLogicalEntityRect,
  getSpriteIdleDirection,
  getSpriteSequenceIndexByTick,
  hasSpriteSheet,
  logicalDistanceInTiles,
  NPC_INTERACTION_DISTANCE_TILES,
  pickDirectionTexture,
  projectLogicalPosition,
  resolveCharacterData,
  resolveIsometricMovementRuntime,
  resolveSweptLogicalMovement,
  screenVectorToLogicalDelta,
  SpatialGrid,
} from "utils/game";
import type { DirectionFacingType, IStageData, ITextureRefs, NpcSpriteType } from "types/game";
import { useGameStore, type GameStore } from "store/game";
import { GAME_CONSTANTS as GC } from "consts/game";

interface UseNpcMovementParams {
  npcsRef: React.RefObject<NpcSpriteType[]>;
  protagonistRef: React.RefObject<NpcSpriteType | null>;
  movementStep?: number;
  logicalSpatialGridRef: React.RefObject<SpatialGrid>;
  stageDataRef: React.RefObject<Record<string, IStageData>>;
  texturesRef: React.RefObject<ITextureRefs>;
}

interface LogicalNpcMotion {
  dx: number;
  dy: number;
  remainingSteps: number;
  pauseSteps: number;
}

function createMotion(step: number): LogicalNpcMotion {
  const angle = Math.random() * Math.PI * 2;
  return {
    dx: Math.cos(angle) * step,
    dy: Math.sin(angle) * step,
    remainingSteps: Math.floor(Math.random() * GC.MOVEMENT_STEPS.RANGE) + GC.MOVEMENT_STEPS.MIN,
    pauseSteps: 0,
  };
}

/** NPC 이동을 v2 논리 world와 footprint 충돌만으로 처리한다. */
export const useNpcMovement = ({
  npcsRef,
  protagonistRef,
  movementStep = 1,
  logicalSpatialGridRef,
  stageDataRef,
  texturesRef,
}: UseNpcMovementParams): void => {
  const motionsRef = useRef(new Map<NpcSpriteType, LogicalNpcMotion>());
  const frameRef = useRef(0);
  const updateNpcPosition = useGameStore((state: GameStore) => state.updateNpcPosition);

  const syncTexture = useCallback(
    (npc: NpcSpriteType, direction: DirectionFacingType, moving: boolean) => {
      const persona = resolveCharacterData(npc);
      if (!hasSpriteSheet(persona?.sprite)) return;
      const key = persona.pid || npc.data?.id || "unknown-npc";
      const spriteMap = texturesRef.current?.npcs?.get(key)?.sprite;
      if (!spriteMap) return;
      const frame = getSpriteSequenceIndexByTick({
        sprite: persona.sprite,
        direction,
        tick: frameRef.current,
        moving,
        intervalMs: GC.INTERVALS.MOVEMENT,
      });
      const texture = pickDirectionTexture(spriteMap, direction, frame);
      if (texture && npc.texture !== texture) npc.texture = texture;
      npc.currentDirection = direction;
    },
    [texturesRef],
  );

  useEffect(() => {
    const interval = setInterval(() => {
      frameRef.current = (frameRef.current + 1) % 1000;
      const stageData = Object.values(stageDataRef.current)[0];
      const runtime = resolveIsometricMovementRuntime(stageData);
      const grid = logicalSpatialGridRef.current;
      if (!runtime || !grid) return;

      for (const npc of npcsRef.current ?? []) {
        if (!npc.__logicalPosition || !npc.__logicalCollision) continue;
        let motion = motionsRef.current.get(npc);
        if (!motion) {
          motion = createMotion(movementStep);
          motionsRef.current.set(npc, motion);
        }
        if (motion.pauseSteps > 0) {
          motion.pauseSteps -= 1;
          continue;
        }
        if (motion.remainingSteps <= 0) {
          motionsRef.current.set(npc, { ...createMotion(movementStep), pauseSteps: 15 });
          continue;
        }

        const protagonist = protagonistRef.current;
        if (
          protagonist?.__logicalPosition &&
          logicalDistanceInTiles(
            npc.__logicalPosition,
            protagonist.__logicalPosition,
            runtime.logicalUnitsPerTile,
          ) <= NPC_INTERACTION_DISTANCE_TILES
        ) {
          continue;
        }

        const logicalDelta = screenVectorToLogicalDelta(
          { screenX: motion.dx, screenY: motion.dy },
          runtime.projection,
          runtime.logicalUnitsPerTile,
        );
        const entityId = npc.label || npc.data?.id || "npc";
        const currentRect = createLogicalEntityRect(
          npc.__logicalPosition,
          CHARACTER_FOOTPRINT_TILES,
          runtime.logicalUnitsPerTile,
          entityId,
        );
        const movement = resolveSweptLogicalMovement(currentRect, logicalDelta, (broadPhase) =>
          grid.queryRect(
            broadPhase,
            (object) => object.id !== entityId && !object.role?.includes("pass"),
          ),
        );
        const halfFootprint = CHARACTER_FOOTPRINT_TILES * runtime.logicalUnitsPerTile / 2;
        const min = -runtime.logicalUnitsPerTile / 2 + halfFootprint;
        const maxX = (runtime.gridWidth - 0.5) * runtime.logicalUnitsPerTile - halfFootprint;
        const maxY = (runtime.gridHeight - 0.5) * runtime.logicalUnitsPerTile - halfFootprint;
        const inBounds =
          movement.position.worldX >= min &&
          movement.position.worldY >= min &&
          movement.position.worldX <= maxX &&
          movement.position.worldY <= maxY;
        if (!inBounds || movement.collidedX || movement.collidedY) {
          motionsRef.current.set(npc, { ...createMotion(movementStep), pauseSteps: 10 });
          continue;
        }

        const screen = projectLogicalPosition(movement.position, runtime);
        const direction = calculateDirection8(motion.dx, motion.dy, true) as DirectionFacingType;
        const walkCycle = (frameRef.current % GC.ANIMATION.WALKING.STEP_FREQUENCY) / GC.ANIMATION.WALKING.STEP_FREQUENCY;
        const animationOffset = -Math.abs(Math.sin(walkCycle * Math.PI)) * GC.ANIMATION.WALKING.HEIGHT_OFFSET;

        npc.__logicalPosition = movement.position;
        npc.__logicalCollision = createLogicalEntityRect(
          movement.position,
          CHARACTER_FOOTPRINT_TILES,
          runtime.logicalUnitsPerTile,
          entityId,
        );
        npc.__logicalCollision.type = "npc";
        npc.__isoDepthKey = createCharacterDepthKey(entityId, movement.position, runtime);
        npc.x = screen.screenX;
        npc.y = screen.screenY + animationOffset;
        npc.data = { ...npc.data, logicalPosition: movement.position, direction };
        grid.upsert(npc.__logicalCollision);
        if (npc.nameContainer) {
          npc.nameContainer.x = screen.screenX;
          npc.nameContainer.y = screen.screenY + GC.INTERACTION.MESSAGE_OFFSET_Y;
        }
        syncTexture(npc, direction || getSpriteIdleDirection(resolveCharacterData(npc)?.sprite), true);
        if (npc.data?.id) updateNpcPosition(npc.data.id, movement.position.worldX, movement.position.worldY);
        motion.remainingSteps -= 1;
      }
    }, GC.INTERVALS.MOVEMENT);

    return () => clearInterval(interval);
  }, [
    logicalSpatialGridRef,
    movementStep,
    npcsRef,
    protagonistRef,
    stageDataRef,
    syncTexture,
    updateNpcPosition,
  ]);
};

export default useNpcMovement;
