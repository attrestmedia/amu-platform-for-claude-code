/**
 * Assets Studio 사용자 언어 용어집 (S0 계약)
 *
 * SR3(simplificationRules) 집행 근거: 영문 도메인 용어(anchor, bible, diagonal4,
 * StageDoc, assetId, templateKey, universeId)는 사용자 화면에 직접 노출하지 않는다.
 * 화면에 쓸 표현은 반드시 이 파일의 매핑을 경유해 사용자 언어(ko/en)로 표기한다.
 *
 * 이 파일은 데이터 정본이며 JSX를 포함하지 않는다. 화면에서는
 * `components/module/i18n`의 `<Lang text={FORGE_GLOSSARY.anchor} />` 또는
 * `lang(FORGE_GLOSSARY.anchor)`로 렌더한다.
 */

/** ko/en 사용자 노출 라벨. i18n Lang/lang의 TextObject와 구조적으로 호환된다. */
export type ForgeLocalizedText = {
  ko: string;
  en: string;
};

/**
 * SR3 금지 목록 — 사용자 화면에 직접 노출하면 안 되는 영문 도메인 용어.
 * 필요한 식별자는 상세 패널의 접힌 영역에만 둔다(SR3).
 */
export const FORGE_FORBIDDEN_DOMAIN_TERMS = [
  "anchor",
  "bible",
  "diagonal4",
  "StageDoc",
  "assetId",
  "templateKey",
  "universeId",
] as const;

/**
 * 도메인 용어 → 사용자 언어 매핑.
 *
 * - anchor       → 기본 컷(STEP1 기준 이미지)
 * - bible        → 방향 시트(5방향 바이블 시트)
 * - sprite sheet → 움직임 시트(8방향 스프라이트 시트)
 * - StageDoc     → 맵
 * - universe     → 세계
 * - asset        → 에셋
 */
export const FORGE_GLOSSARY = {
  /** 서비스 표면 이름. 기존 bible 키는 내부 파이프라인 호환 alias로 유지한다. */
  service: { ko: "에셋 스튜디오", en: "Assets Studio" },
  anchor: { ko: "기본 컷", en: "Base cut" },
  bible: { ko: "방향 시트", en: "Direction sheet" },
  spriteSheet: { ko: "움직임 시트", en: "Sprite sheet" },
  stageDoc: { ko: "맵", en: "Map" },
  universe: { ko: "세계", en: "World" },
  asset: { ko: "에셋", en: "Asset" },
} as const satisfies Record<string, ForgeLocalizedText>;

/**
 * 맵 스튜디오 레이어 사용자 언어(stepCardSpec.step5.layerMapping).
 * 서버 STAGE_AUTHORING_LAYERS(ground/object/boundary/overlay) → 사용자 언어.
 *
 * - ground    → 지형
 * - object    → 오브젝트
 * - overlay   → 장식
 * - boundary  → 통행 불가
 * - character → 캐릭터(배치 대상이지 레이어가 아님)
 * - effect    → 효과(미보유 — 1단계에서 노출하지 않음)
 */
export const FORGE_LAYER_GLOSSARY = {
  ground: { ko: "지형", en: "Ground" },
  object: { ko: "오브젝트", en: "Object" },
  overlay: { ko: "장식", en: "Decor" },
  boundary: { ko: "통행 불가", en: "Impassable" },
  character: { ko: "캐릭터", en: "Character" },
  effect: { ko: "효과", en: "Effect" },
} as const satisfies Record<string, ForgeLocalizedText>;

export type ForgeGlossaryKey = keyof typeof FORGE_GLOSSARY;
export type ForgeLayerKey = keyof typeof FORGE_LAYER_GLOSSARY;
