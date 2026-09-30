import { useCallback } from "react";
import { Container, Sprite } from "pixi.js";
import type { IExtendedNpcData, IGlobalNpcData, IStageData, ITextureRefs, NpcSpriteType } from "types/game";
import {
  SpatialGrid,
  buildDirectionTexturesFromSprite,
  calculateSpriteSize,
  CHARACTER_FOOTPRINT_TILES,
  createCharacterDepthKey,
  createCharacterNameContainer,
  createLogicalEntityRect,
  getSpriteIdleDirection,
  getSpriteRatio,
  hasSpriteSheet,
  pickDirectionTexture,
  projectLogicalPosition,
  resolveIsometricMovementRuntime,
} from "utils/game";
import { logger } from "utils/log";
import { GAME_CONSTANTS as GC } from "consts/game";

const getNpcEntityId = (npc: IGlobalNpcData): string => {
  const baseId = npc.info?.id || npc.id;
  return baseId;
};

/** logicalPosition이 명시된 v2 NPC만 Pixi stage에 생성한다. */
export default function useStageNpcs(params: {
  npcSize: number;
  texturesRef: React.RefObject<ITextureRefs>;
  universeId: string;
  getDisplayName: (persona: IExtendedNpcData) => string;
}) {
  const { npcSize, texturesRef, universeId, getDisplayName } = params;

  const createNpcSprites = useCallback(
    async (
      npcs: IGlobalNpcData[],
      logicalSpatialGrid: SpatialGrid,
      stageContainer: Container,
      stageData: IStageData,
    ): Promise<{ npcSprites: NpcSpriteType[] }> => {
      const runtime = resolveIsometricMovementRuntime(stageData);
      if (!runtime) throw new Error("stage_npc_projection_contract_invalid");

      const npcSprites: NpcSpriteType[] = [];
      for (const npcData of npcs) {
        const npcInfo = npcData.info;
        const persona = npcInfo?.persona as IExtendedNpcData | undefined;
        const logicalPosition = npcData.logicalPosition ?? npcInfo?.logicalPosition;
        if (!persona || !logicalPosition) {
          logger.warn("[useStageNpcs] v2 NPC 데이터 누락:", {
            id: npcData.id,
            persona: Boolean(persona),
            logicalPosition: Boolean(logicalPosition),
          });
          continue;
        }

        const textureKey = persona.pid || npcInfo.id;
        let directionTextures = texturesRef.current?.npcs?.get(textureKey)?.sprite;
        if (!directionTextures) {
          if (!hasSpriteSheet(persona.sprite)) {
            logger.warn(`[useStageNpcs] NPC 스프라이트 시트 누락: ${textureKey}`);
            continue;
          }
          directionTextures = await buildDirectionTexturesFromSprite(persona.sprite, true);
          if (texturesRef.current) {
            const next = new Map(texturesRef.current.npcs);
            next.set(textureKey, { sprite: directionTextures });
            texturesRef.current = { ...texturesRef.current, npcs: next };
          }
        }

        const initialDirection = getSpriteIdleDirection(persona.sprite);
        const texture = pickDirectionTexture(directionTextures, initialDirection, 0);
        if (!texture) continue;

        const entityId = getNpcEntityId(npcData);
        let resolvedPosition = logicalPosition;
        let logicalRect = createLogicalEntityRect(
          resolvedPosition,
          CHARACTER_FOOTPRINT_TILES,
          runtime.logicalUnitsPerTile,
          entityId,
        );
        if (logicalSpatialGrid.checkCollision(logicalRect, (object) => object.id !== entityId)) {
          let found = false;
          for (let gridY = 0; gridY < runtime.gridHeight && !found; gridY += 1) {
            for (let gridX = 0; gridX < runtime.gridWidth; gridX += 1) {
              const candidate = {
                worldX: gridX * runtime.logicalUnitsPerTile,
                worldY: gridY * runtime.logicalUnitsPerTile,
              };
              const candidateRect = createLogicalEntityRect(
                candidate,
                CHARACTER_FOOTPRINT_TILES,
                runtime.logicalUnitsPerTile,
                entityId,
              );
              if (!logicalSpatialGrid.checkCollision(candidateRect, (object) => object.id !== entityId)) {
                resolvedPosition = candidate;
                logicalRect = candidateRect;
                found = true;
                break;
              }
            }
          }
          if (!found) {
            logger.warn(`[useStageNpcs] 안전한 논리 스폰 위치 없음: ${entityId}`);
            continue;
          }
        }

        const screen = projectLogicalPosition(resolvedPosition, runtime);
        const spriteSize = calculateSpriteSize(npcSize, getSpriteRatio(universeId));
        const sprite = new Sprite(texture) as NpcSpriteType;
        sprite.width = spriteSize.width;
        sprite.height = spriteSize.height;
        sprite.anchor.set(0.5, 1);
        sprite.x = screen.screenX;
        sprite.y = screen.screenY;
        sprite.label = entityId;
        sprite.data = { ...npcInfo, logicalPosition: resolvedPosition };
        sprite.currentDirection = initialDirection;
        sprite.zIndex = GC.STAGE.Z_INDEX.NPC;
        sprite.__logicalPosition = resolvedPosition;
        sprite.__logicalCollision = { ...logicalRect, type: "npc" };
        sprite.__isoDepthKey = createCharacterDepthKey(entityId, resolvedPosition, runtime);

        sprite.nameContainer = createCharacterNameContainer({
          stageContainer,
          label: `${entityId}-name`,
          name: getDisplayName(persona),
          x: screen.screenX,
          y: screen.screenY,
          size: npcSize,
          color: GC.UI.NPC_TEXT_COLOR,
          zIndex: GC.STAGE.Z_INDEX.NPC_NAME,
        });
        sprite.nameContainer.x = screen.screenX;
        sprite.nameContainer.y = screen.screenY + GC.INTERACTION.MESSAGE_OFFSET_Y;

        npcData.logicalPosition = resolvedPosition;
        npcInfo.logicalPosition = resolvedPosition;

        logicalSpatialGrid.insert(sprite.__logicalCollision);
        stageContainer.addChild(sprite);
        npcSprites.push(sprite);
      }
      return { npcSprites };
    },
    [getDisplayName, npcSize, texturesRef, universeId],
  );

  return { createNpcSprites };
}
