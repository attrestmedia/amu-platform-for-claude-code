import { GAME_ASSET_TEMPLATE_KEYS } from "consts/game/gameAssetTemplates";

export const CHARACTER_ANCHOR_GENERATION_TEMPLATE_KEYS: readonly string[] = Object.freeze([
  GAME_ASSET_TEMPLATE_KEYS.characterSpriteAnchorV2,
]);

export const CHARACTER_ANCHOR_RECOMMENDED_TEMPLATE_KEYS: readonly string[] = Object.freeze([
  GAME_ASSET_TEMPLATE_KEYS.characterSpriteAnchorV2,
]);

export const CHARACTER_ANCHOR_RECOMMENDED_DESCRIPTION = {
  ko: "게임 캐릭터 기준 컷에 맞춘 템플릿이에요. 전신·한 명·단색 배경으로 만들어져 8방향 제작에 바로 쓰여요.",
  en: "Templates tuned for a game character anchor cut — full body, one character, flat background, ready for 8-direction production.",
};

export function isCharacterAnchorGenerationTemplateKey(templateKey: unknown): templateKey is string {
  return typeof templateKey === "string"
    && CHARACTER_ANCHOR_GENERATION_TEMPLATE_KEYS.includes(templateKey.trim());
}
