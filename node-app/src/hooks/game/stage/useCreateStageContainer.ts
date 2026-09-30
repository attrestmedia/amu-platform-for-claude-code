import { useCallback } from "react";
import { Container, Sprite, Text, TextStyle } from "pixi.js";
import type { IBlockImage, IGlobalNpcData, IStageData, IStageDoc, ITextureRefs } from "types/game";
import { isDev } from "utils/common";
import { logger } from "utils/log";
import { SpatialGrid, buildStageDataFromDoc } from "utils/game";
import { useGameStore } from "store/game";
import { useUniverseData } from "../core";
import { useNicknameManager } from "../input";
import useStageObstacles from "./useStageObstacles";
import useStageNpcs from "./useStageNpcs";
import useStageBackground from "./useStageBackground";

interface UseCreateStageContainerParams {
  stageWidth: number;
  stageHeight: number;
  stageDataRef: React.RefObject<Record<string, IStageData>>;
  globalNpcDataRef: React.RefObject<IGlobalNpcData[]>;
  npcsRef: React.RefObject<Sprite[]>;
  obstaclesRef: React.RefObject<Sprite[]>;
  texturesRef: React.RefObject<ITextureRefs>;
  blocks: IBlockImage[];
  npcSize: number;
  logicalSpatialGridRef: React.RefObject<SpatialGrid>;
  onGridChanged?: () => void;
}

/** 단일 v2 StageDoc에서 Pixi container를 생성한다. */
const useCreateStageContainer = ({
  stageWidth,
  stageHeight,
  stageDataRef,
  globalNpcDataRef,
  npcsRef,
  obstaclesRef,
  texturesRef,
  blocks,
  npcSize,
  logicalSpatialGridRef,
  onGridChanged,
}: UseCreateStageContainerParams) => {
  const stageGlobalMetaData = useGameStore((state) => state.stageGlobalMetaData);
  const { universeId } = useUniverseData();
  const { getDisplayName } = useNicknameManager();
  const { createStageBackground } = useStageBackground();
  const { createObstacleSprites } = useStageObstacles({ blocks, texturesRef });
  const { createNpcSprites } = useStageNpcs({ npcSize, texturesRef, universeId, getDisplayName });

  return useCallback(
    (): Container => {
      if (!stageGlobalMetaData) throw new Error("stage_doc_unavailable");
      if (!logicalSpatialGridRef.current) throw new Error("logical_spatial_grid_unavailable");

      const stageContainer = new Container();
      stageContainer.sortableChildren = true;
      if (isDev) {
        const label = new Text({ text: "Stage v2", style: new TextStyle({ fontSize: 14, fill: 0xd9d9d9 }) });
        label.x = stageWidth - 90;
        label.y = stageHeight - 40;
        stageContainer.addChild(label);
      }

      const key = "active";
      const { data: stageData } = buildStageDataFromDoc(stageGlobalMetaData as unknown as IStageDoc);
      stageDataRef.current = { [key]: stageData };
      createStageBackground(stageContainer, stageData);

      const runtime = stageData.isoMeta;
      if (!runtime?.logicalUnitsPerTile) throw new Error("stage_runtime_meta_unavailable");
      const { obstacleSprites } = createObstacleSprites(
        stageData.obstacles,
        logicalSpatialGridRef.current,
        stageContainer,
        key,
        runtime.config,
        runtime.logicalUnitsPerTile,
      );
      obstaclesRef.current = obstacleSprites;

      void createNpcSprites(
        useGameStore.getState().npcs,
        logicalSpatialGridRef.current,
        stageContainer,
        stageData,
      )
        .then(({ npcSprites }) => {
          npcsRef.current = npcSprites;
          globalNpcDataRef.current = useGameStore.getState().npcs;
          onGridChanged?.();
        })
        .catch((error) => logger.error("v2 NPC 초기화 오류:", error));

      return stageContainer;
    },
    [
      createNpcSprites,
      createObstacleSprites,
      createStageBackground,
      globalNpcDataRef,
      logicalSpatialGridRef,
      npcsRef,
      obstaclesRef,
      onGridChanged,
      stageDataRef,
      stageGlobalMetaData,
      stageHeight,
      stageWidth,
    ],
  );
};

export default useCreateStageContainer;
