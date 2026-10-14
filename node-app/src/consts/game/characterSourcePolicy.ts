/**
 * @docHint
 * @purpose Assets Studio 캐릭터 이미지 선택과 업로드의 공유 계약 상수
 * @process 목적·제외 템플릿·업로드 표면 식별자 제공
 * @domain game.character
 * @scope shared-policy
 */

import { SPRITE_PIPELINE_V2_TEMPLATE_KEYS } from "consts/game/gameAssetTemplates";

export const CHARACTER_ANCHOR_PURPOSE = "character-anchor" as const;
export const CHARACTER_ANCHOR_EXCLUDED_TEMPLATE_KEYS: readonly string[] = Object.freeze([
  SPRITE_PIPELINE_V2_TEMPLATE_KEYS.base4,
  SPRITE_PIPELINE_V2_TEMPLATE_KEYS.diagonal4,
  SPRITE_PIPELINE_V2_TEMPLATE_KEYS.bible,
]);
export const CHARACTER_ANCHOR_EXCLUDED_MODEL_NAME_PREFIX = "sprite-sheet-" as const;
export const CHARACTER_UPLOAD_SOURCE_SURFACE = "assets-studio-character" as const;
