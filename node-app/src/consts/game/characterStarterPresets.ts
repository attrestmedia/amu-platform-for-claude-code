/**
 * STEP1 '새 캐릭터 생성'에서 제공하는 스타터 프리셋 3장 (정확히 3장).
 * 신규 템플릿을 만들지 않고 기존 amu-game-character-sprite-anchor-v2의 변수 조합만 고정한다.
 *
 * 변수값은 anchor-v2 템플릿의 옵션 목록과 일치해야 한다(운영 SSOT):
 *   character_identity / visual_style / outfit_theme
 * 카드에는 프리셋 이름·한 줄 설명·예시 이미지·코인 견적만 노출하고, 영문 변수는 화면에 쓰지 않는다(SR3).
 */

export type CharacterStarterPresetType = {
  key: string;
  label: { ko: string; en: string };
  description: { ko: string; en: string };
  variables: {
    character_identity: string;
    visual_style: string;
    outfit_theme: string;
  };
};

export const CHARACTER_STARTER_PRESET_TEMPLATE_KEY = "amu-game-character-sprite-anchor-v2";

export const CHARACTER_STARTER_PRESETS: CharacterStarterPresetType[] = [
  {
    key: "explorer",
    label: { ko: "탐험가", en: "Explorer" },
    description: { ko: "모험을 떠나는 어린 탐험가", en: "A young explorer ready for adventure" },
    variables: {
      character_identity: "young human explorer",
      visual_style: "premium 2.5D isometric game art",
      outfit_theme: "urban explorer gear",
    },
  },
  {
    key: "tutor",
    label: { ko: "아카데미 튜터", en: "Academy tutor" },
    description: { ko: "아카데미에서 가르치는 튜터", en: "An academy tutor character" },
    variables: {
      character_identity: "academy tutor",
      visual_style: "soft anime game asset",
      outfit_theme: "modern academy uniform",
    },
  },
  {
    key: "companion",
    label: { ko: "몬스터 동료", en: "Monster companion" },
    description: { ko: "함께하는 몬스터 동료", en: "A loyal monster companion" },
    variables: {
      character_identity: "monster companion",
      visual_style: "clean stylized mobile RPG",
      outfit_theme: "minimal futuristic suit",
    },
  },
];
