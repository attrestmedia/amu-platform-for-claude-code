import { useCallback } from "react";
import { Container, Sprite } from "pixi.js";
import type { IBlockImage, IIsometricConfig, ITextureRefs, NpcSpriteType, ObstacleType } from "types/game";
import {
  SpatialGrid,
  assignStableIsometricZ,
  createLogicalObstacleRect,
  getIsometricSpriteSize,
  hasStageBoundaryRole,
} from "utils/game";
import { logger } from "utils/log";
import { GAME_CONSTANTS as GC } from "consts/game";

/** v2 layout obstacle을 투영하고 논리 충돌 그리드에 등록한다. */
export default function useStageObstacles(params: {
  blocks: IBlockImage[];
  texturesRef: React.RefObject<ITextureRefs>;
}) {
  const { blocks, texturesRef } = params;

  const createObstacleSprites = useCallback(
    (
      obstacles: ObstacleType[],
      logicalSpatialGrid: SpatialGrid,
      stageContainer: Container,
      stageKey: string,
      isoConfig: Partial<IIsometricConfig>,
      logicalUnitsPerTile: number,
    ): { obstacleSprites: NpcSpriteType[] } => {
      if (
        isoConfig.projection !== "isometric-2to1" ||
        !Number.isFinite(isoConfig.tileWidth) ||
        !Number.isFinite(isoConfig.tileHeight) ||
        !Number.isFinite(logicalUnitsPerTile) ||
        logicalUnitsPerTile <= 0
      ) {
        throw new Error("stage_obstacle_projection_contract_invalid");
      }

      const obstacleSprites: NpcSpriteType[] = [];
      const depthEntries: Array<{
        value: NpcSpriteType;
        key: NonNullable<ObstacleType["isoRender"]>["depthKey"];
      }> = [];

      obstacles.forEach((obstacleData, index) => {
        const block = blocks[obstacleData.textureIndex];
        const texture = texturesRef.current?.obstacles?.[obstacleData.textureIndex];
        const isoRender = obstacleData.isoRender;
        if (!block || !texture || !isoRender) {
          logger.warn("[useStageObstacles] v2 obstacle 메타 또는 텍스처 누락:", {
            id: obstacleData.id,
            textureIndex: obstacleData.textureIndex,
          });
          return;
        }

        const stableLabel = obstacleData.id || `obstacle-${index}`;
        const gridId = `${stageKey}:${stableLabel}`;
        const sprite = new Sprite(texture) as NpcSpriteType;
        const isoSize = getIsometricSpriteSize(
          isoRender.footprint,
          { tileWidth: isoConfig.tileWidth as number, tileHeight: isoConfig.tileHeight as number },
          isoRender.layer,
          isoRender.visualHeightPx,
        );
        sprite.width = isoSize.width;
        sprite.height = isoSize.height;

        let roles = block.role || ["obstacle"];
        if (hasStageBoundaryRole(roles) && roles.includes("pass")) {
          roles = roles.filter((role) => role !== "pass");
          logger.warn(`[useStageObstacles] boundary+pass role 정규화: ${stableLabel}`);
        }
        sprite.role = roles;
        sprite.label = stableLabel;
        sprite.anchor.set(isoRender.anchor.x, isoRender.anchor.y);
        sprite.x = isoRender.screenPoint.screenX;
        sprite.y = isoRender.screenPoint.screenY;
        sprite.zIndex = GC.STAGE.Z_INDEX.OBSTACLE;
        sprite.__isoDepthKey = isoRender.depthKey;
        sprite.__isoCullFootprint = {
          gridPoint: isoRender.gridPoint,
          footprint: isoRender.footprint,
        };

        const logicalRect = createLogicalObstacleRect(
          isoRender.gridPoint.gridX,
          isoRender.gridPoint.gridY,
          isoRender.footprint,
          logicalUnitsPerTile,
          gridId,
        );
        logicalRect.role = roles;
        sprite.__logicalCollision = logicalRect;
        if (!roles.includes("pass")) logicalSpatialGrid.upsert(logicalRect);

        depthEntries.push({ value: sprite, key: isoRender.depthKey });
        stageContainer.addChild(sprite);
        obstacleSprites.push(sprite);
      });

      assignStableIsometricZ(depthEntries).forEach(({ value, zIndex }) => {
        value.zIndex = zIndex;
      });
      return { obstacleSprites };
    },
    [blocks, texturesRef],
  );

  return { createObstacleSprites };
}
