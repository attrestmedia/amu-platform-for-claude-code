import { useCallback } from "react";
import { Container, Graphics } from "pixi.js";
import type { IStageData } from "types/game";
import { ISO_BACKGROUND_Z_INDEX, getIsometricStageDiamond } from "utils/game";

/** v2 다이아몬드 underlay를 생성한다. 바닥·도로 이미지는 layout tile이 담당한다. */
export default function useStageBackground() {
  const createStageBackground = useCallback(
    (stageContainer: Container, stageData: IStageData): void => {
      const isoMeta = stageData.isoMeta;
      const config = isoMeta?.config;
      if (
        isoMeta?.coordinateContractVersion !== 2 ||
        config?.projection !== "isometric-2to1" ||
        !Number.isFinite(config.tileWidth) ||
        !Number.isFinite(config.tileHeight)
      ) {
        throw new Error("stage_isometric_background_contract_invalid");
      }

      const corners = getIsometricStageDiamond(isoMeta.gridWidth, isoMeta.gridHeight, {
        tileWidth: config.tileWidth as number,
        tileHeight: config.tileHeight as number,
        origin: { screenX: config.originX ?? 0, screenY: config.originY ?? 0 },
      });
      const background = new Graphics();
      background.poly(corners.flatMap((point) => [point.screenX, point.screenY])).fill({ color: 0x18252c });
      background.label = "stage-isometric-diamond";
      background.zIndex = ISO_BACKGROUND_Z_INDEX;
      stageContainer.addChild(background);
    },
    [],
  );

  return { createStageBackground };
}
