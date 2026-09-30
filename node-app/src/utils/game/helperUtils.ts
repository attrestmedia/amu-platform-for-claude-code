import { GAME_CONSTANTS as GC } from "consts/game";
import { useGameStore } from "store/game";
import type { RouteHintType } from "types/ai";
import { DEFAULT_FANTASY_UNIVERSE } from "consts/app";
import { toUnknownRecord } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose helperUtils 유틸 기능 제공
 * @process 입력 정규화  변환  보조 처리 제공
 * @domain game-core
 * @scope game-runtime
 */

// 유니버스 타입 판별 함수
export const resolveIsCommerce = (routeHint?: RouteHintType) => {
  if (routeHint) return routeHint === "commerce";
  const stageMeta = toUnknownRecord(toUnknownRecord(useGameStore.getState()).stageGlobalMetaData);
  const type = toUnknownRecord(stageMeta._resolved).type || stageMeta.type; // 안전한 fallback
  return type === "commerce";
};

// 유니버스 ID에 따른 스프라이트 비율을 반환
export const getSpriteRatio = (universeId: string): { width: number; height: number } => {
  const { SPRITE_RATIO } = GC;

  // `DEFAULT_FANTASY_UNIVERSE`인 경우 정사각형 비율 반환
  if (universeId === DEFAULT_FANTASY_UNIVERSE) {
    return SPRITE_RATIO["1:1"];
  }

  // 그 외의 경우 기본 비율(4:5) 반환
  return SPRITE_RATIO.default;
};

// 기준 크기와 비율을 기반으로 실제 width/height 계산
export const calculateSpriteSize = (
  baseSize: number,
  ratio: { width: number; height: number },
): { width: number; height: number } => {
  return {
    width: baseSize * ratio.width,
    height: baseSize * ratio.height,
  };
};
