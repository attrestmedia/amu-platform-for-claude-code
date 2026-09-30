import type { ImagePromptMetaType } from "types/app";
import { SPRITE_PIPELINE_V2_TEMPLATE_KEYS } from "consts/game/gameAssetTemplates";

// 파이프라인 산출물을 다시 기준 컷으로 쓰지 않도록 후보 판정을 한곳에서 유지한다.
export const PIPELINE_OUTPUT_TEMPLATE_KEYS = new Set<string>([
  SPRITE_PIPELINE_V2_TEMPLATE_KEYS.base4,
  SPRITE_PIPELINE_V2_TEMPLATE_KEYS.diagonal4,
  SPRITE_PIPELINE_V2_TEMPLATE_KEYS.bible,
]);

export const CHARACTER_SOURCE_TEMPLATE_KEYS = new Set<string>([
  "amu-game-character-sprite-anchor-v2",
  "amu-game-character-sprite-v1",
  "amu-game-npc-portrait-v1",
]);

export function isAnchorCandidate(meta: ImagePromptMetaType) {
  if (!meta.assetId || !meta.url || meta.state === "deleted") return false;
  if (PIPELINE_OUTPUT_TEMPLATE_KEYS.has(String(meta.templateKey || ""))) return false;
  if (String(meta.modelName || "") === "sprite-sheet-v2") return false;
  return true;
}

export function isCharacterCandidate(meta: ImagePromptMetaType) {
  return CHARACTER_SOURCE_TEMPLATE_KEYS.has(String(meta.templateKey || ""));
}
