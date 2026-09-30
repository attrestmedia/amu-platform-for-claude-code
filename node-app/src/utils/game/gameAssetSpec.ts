import type { GameAssetType, IGameAssetDoc } from "types/game/asset";

/**
 * @docHint
 * @purpose 맵/건물 에셋 게임 규격 판정 순수 유틸 (에셋 계약 v2 §4.5 — footprint/anchor/isoHeightPx 필수)
 * @process 대상 assetType 판별  runtime 필수 메타 존재/범위 검사  누락 필드 리포트 반환
 * @domain game.asset
 * @scope global
 */

// 발행 시 게임 규격이 강제되는 assetType (캐릭터/초상화는 대상 외)
export const GAME_SPEC_ENFORCED_ASSET_TYPES: readonly GameAssetType[] = [
  "stage-tileset",
  "prop-sheet",
  "building-sheet",
  "tile",
  "object",
] as const;

export type GameAssetSpecCheckResultType = {
  ok: boolean;
  enforced: boolean;
  missing: string[];
};

export function isGameSpecEnforcedAssetType(assetType: string): boolean {
  return (GAME_SPEC_ENFORCED_ASSET_TYPES as readonly string[]).includes(assetType);
}

// stage 발행 전 규격 판정 — 미충족 시 발행 불가 (draft/review 저장은 허용)
export function validateStageAssetGameSpec(asset: {
  assetType?: string;
  runtime?: IGameAssetDoc["runtime"];
}): GameAssetSpecCheckResultType {
  const assetType = String(asset?.assetType || "");
  if (!isGameSpecEnforcedAssetType(assetType)) {
    return { ok: true, enforced: false, missing: [] };
  }

  const runtime = asset?.runtime || {};
  const missing: string[] = [];

  const footprintWidth = Number(runtime.footprint?.width || 0);
  const footprintHeight = Number(runtime.footprint?.height || 0);
  if (footprintWidth < 1 || footprintHeight < 1) missing.push("runtime.footprint");

  const anchorX = runtime.anchor?.x;
  const anchorY = runtime.anchor?.y;
  if (!Number.isFinite(Number(anchorX)) || !Number.isFinite(Number(anchorY)) || anchorX === undefined || anchorY === undefined) {
    missing.push("runtime.anchor");
  }

  if (Number(runtime.isoHeightPx || 0) < 1) missing.push("runtime.isoHeightPx");

  return { ok: missing.length === 0, enforced: true, missing };
}
