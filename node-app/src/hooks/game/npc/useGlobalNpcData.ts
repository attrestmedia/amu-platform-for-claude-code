import { useEffect } from "react";
import type { IExtendedNpcData, IGlobalNpcData, INpcImage, INpcInterface, LogicalWorldPoint } from "types/game";
import { logger } from "utils/log";
import { useGameStore } from "store/game";

function buildGlobalNpc(
  npcBase: INpcImage,
  npcId: string,
  logicalPosition: LogicalWorldPoint,
): IGlobalNpcData {
  const fromBase = npcBase.persona as IExtendedNpcData;
  const persona: IExtendedNpcData = {
    ...fromBase,
    pid: fromBase.pid || npcId,
    personaType: fromBase.personaType || "human",
    name: fromBase.name || "???",
  };
  const info: INpcInterface = {
    id: npcId,
    persona,
    displayName: npcBase.displayName ?? persona.name,
    behavior: npcBase.behavior,
    direction: undefined,
    logicalPosition,
  };
  return {
    id: npcId,
    logicalPosition,
    info,
  };
}

function buildLogicalNpcs(
  npcs: INpcImage[],
  gridWidth: number,
  gridHeight: number,
  logicalUnitsPerTile: number,
): IGlobalNpcData[] {
  if (!npcs.length || gridWidth <= 0 || gridHeight <= 0 || logicalUnitsPerTile <= 0) return [];
  const usableWidth = Math.max(1, gridWidth - 2);
  const usableHeight = Math.max(1, gridHeight - 2);
  return npcs.map((npc, index) => {
    const pid = npc.persona?.pid || `npc-${index}`;
    const gridX = Math.min(gridWidth - 1, 1 + ((index * 3 + 1) % usableWidth));
    const gridY = Math.min(gridHeight - 1, 1 + ((index * 5 + 2) % usableHeight));
    return buildGlobalNpc(npc, `${pid}-${index}`, {
      worldX: gridX * logicalUnitsPerTile,
      worldY: gridY * logicalUnitsPerTile,
    });
  });
}

export const useGlobalNpcData = ({
  npcs,
  gridWidth,
  gridHeight,
  logicalUnitsPerTile,
}: {
  npcs: INpcImage[];
  gridWidth: number;
  gridHeight: number;
  logicalUnitsPerTile: number;
}) => {
  const setNpcs = useGameStore((state) => state.setNpcs);
  const globalNpcData = useGameStore((state) => state.npcs) as IGlobalNpcData[];

  useEffect(() => {
    const next = buildLogicalNpcs(npcs, gridWidth, gridHeight, logicalUnitsPerTile);
    const previous = useGameStore.getState().npcs as IGlobalNpcData[];
    const unchanged =
      previous.length === next.length &&
      previous.every((npc, index) =>
        npc.id === next[index]?.id &&
        npc.logicalPosition?.worldX === next[index]?.logicalPosition?.worldX &&
        npc.logicalPosition?.worldY === next[index]?.logicalPosition?.worldY,
      );
    if (unchanged) return;
    logger.log(`v2 논리 NPC 데이터 업데이트: ${next.length}개`);
    setNpcs(next);
  }, [gridHeight, gridWidth, logicalUnitsPerTile, npcs, setNpcs]);

  return globalNpcData;
};
