import { GAME_ASSET_TEMPLATE_KEYS } from "./gameAssetTemplates";
import type { GameAssetType } from "types/game/asset";

/**
 * 월드 에셋 카탈로그 (STEP4) — UI는 이 파일만 읽는다.
 *
 * 9개 카테고리 + 카테고리별 프리셋(3~4개) + categoryToTemplateMap을 고정한다.
 * 사용자는 templateKey나 변수 문자열을 입력하지 않는다(SR4·SR5) — 서버 route가
 * categoryKey+presetKey를 이 상수에서 해석한다. 카테고리당 프리셋은 5개를 넘기지 않는다(SR2).
 */

export type WorldAssetCategoryKey =
  | "building"
  | "terrain"
  | "tree"
  | "rock"
  | "decor"
  | "object"
  | "tile"
  | "effect"
  | "etc";

export type WorldAssetCategoryLabel = { ko: string; en: string };

/** 월드 에셋 자체가 아니라 AI 실행의 가격 역할을 식별하는 키다. 고정 코인을 저장하지 않는다. */
export const WORLD_ASSET_PRICING_ROLE = "play.world_asset.generate" as const;
export type WorldAssetPricingRoleType = typeof WORLD_ASSET_PRICING_ROLE;

export type WorldAssetPresetType = {
  key: string;
  label: WorldAssetCategoryLabel;
  description: WorldAssetCategoryLabel;
  variables: Record<string, string>;
  pricingRole: WorldAssetPricingRoleType;
};

/** 카테고리 표시 순서·라벨 (effect·etc는 1단계에서 '준비 중'). */
export const WORLD_ASSET_CATEGORIES: Array<{ key: WorldAssetCategoryKey; label: WorldAssetCategoryLabel }> = [
  { key: "building", label: { ko: "건물", en: "Building" } },
  { key: "terrain", label: { ko: "지형", en: "Terrain" } },
  { key: "tree", label: { ko: "나무", en: "Tree" } },
  { key: "rock", label: { ko: "바위", en: "Rock" } },
  { key: "decor", label: { ko: "장식", en: "Decor" } },
  { key: "object", label: { ko: "오브젝트", en: "Object" } },
  { key: "tile", label: { ko: "타일", en: "Tile" } },
  { key: "effect", label: { ko: "효과", en: "Effect" } },
  { key: "etc", label: { ko: "기타", en: "Other" } },
];

export type WorldAssetCategoryTemplateMapEntry =
  | { templateKey: string; assetType: GameAssetType; sizeClass?: string }
  | { status: "deferred"; reason: string };

/** categoryKey → templateKey/assetType 매핑 (S7 서버 route가 참조). */
export const WORLD_ASSET_CATEGORY_TEMPLATE_MAP: Record<WorldAssetCategoryKey, WorldAssetCategoryTemplateMapEntry> = {
  building: { templateKey: GAME_ASSET_TEMPLATE_KEYS.worldObjectSingle, assetType: "building-sheet", sizeClass: "multi-tile" },
  terrain: { templateKey: GAME_ASSET_TEMPLATE_KEYS.worldGroundTile, assetType: "stage-tileset" },
  tree: { templateKey: GAME_ASSET_TEMPLATE_KEYS.worldObjectSingle, assetType: "object", sizeClass: "single-tile" },
  rock: { templateKey: GAME_ASSET_TEMPLATE_KEYS.worldObjectSingle, assetType: "object", sizeClass: "single-tile" },
  decor: { templateKey: GAME_ASSET_TEMPLATE_KEYS.worldObjectSingle, assetType: "prop-sheet", sizeClass: "single-tile" },
  object: { templateKey: GAME_ASSET_TEMPLATE_KEYS.worldObjectSingle, assetType: "object", sizeClass: "single-tile" },
  tile: { templateKey: GAME_ASSET_TEMPLATE_KEYS.worldGroundTile, assetType: "tile" },
  effect: { status: "deferred", reason: "Q6" },
  etc: { status: "deferred", reason: "자유 프롬프트 경로 — D9 확장 게이트 통과 후" },
};

const objectPreset = (key: string, label: WorldAssetCategoryLabel, objectKind: string, theme: string, sizeClass: string): WorldAssetPresetType => ({
  key,
  label,
  description: {
    ko: `${label.ko} · ${sizeClass === "multi-tile" ? "여러 칸 구조물" : "한 칸 오브젝트"}`,
    en: `${label.en} · ${sizeClass === "multi-tile" ? "multi-tile structure" : "single-tile object"}`,
  },
  pricingRole: WORLD_ASSET_PRICING_ROLE,
  variables: {
    object_kind: objectKind,
    object_theme: theme,
    visual_style: "premium 2.5D isometric game art",
    size_class: sizeClass,
  },
});

const tilePreset = (key: string, label: WorldAssetCategoryLabel, surface: string, theme: string): WorldAssetPresetType => ({
  key,
  label,
  description: {
    ko: `${label.ko} · 반복 배치용 지면 타일`,
    en: `${label.en} · repeatable ground tile`,
  },
  pricingRole: WORLD_ASSET_PRICING_ROLE,
  variables: {
    tile_surface: surface,
    tile_theme: theme,
    edge_behavior: "seamless tileable edge",
  },
});

/** 카테고리별 큐레이션 프리셋(3~4개). effect·etc는 프리셋이 없다(준비 중). */
export const WORLD_ASSET_CATEGORY_PRESETS: Record<Exclude<WorldAssetCategoryKey, "effect" | "etc">, WorldAssetPresetType[]> = {
  building: [
    objectPreset("shop", { ko: "상점", en: "Shop" }, "shop building", "urban", "multi-tile"),
    objectPreset("house", { ko: "주거", en: "House" }, "residential house", "urban", "multi-tile"),
    objectPreset("office", { ko: "관공서", en: "Office" }, "public office building", "urban", "multi-tile"),
    objectPreset("warehouse", { ko: "창고", en: "Warehouse" }, "warehouse", "industrial", "multi-tile"),
  ],
  terrain: [
    tilePreset("grass", { ko: "잔디", en: "Grass" }, "grass", "forest"),
    tilePreset("sand", { ko: "모래", en: "Sand" }, "sand", "desert"),
    tilePreset("stone", { ko: "돌", en: "Stone" }, "stone pavement", "urban"),
    tilePreset("water", { ko: "물", en: "Water" }, "shallow water", "natural"),
  ],
  tree: [
    objectPreset("pine", { ko: "소나무", en: "Pine" }, "pine tree", "forest", "single-tile"),
    objectPreset("oak", { ko: "참나무", en: "Oak" }, "broad oak tree", "forest", "single-tile"),
    objectPreset("palm", { ko: "야자수", en: "Palm" }, "palm tree", "desert", "single-tile"),
  ],
  rock: [
    objectPreset("boulder", { ko: "큰 바위", en: "Boulder" }, "large boulder", "natural", "single-tile"),
    objectPreset("stones", { ko: "돌무더기", en: "Stones" }, "cluster of small stones", "natural", "single-tile"),
    objectPreset("crystal", { ko: "수정", en: "Crystal" }, "glowing crystal", "fantasy", "single-tile"),
  ],
  decor: [
    objectPreset("fence", { ko: "울타리", en: "Fence" }, "wooden fence segment", "forest", "single-tile"),
    objectPreset("lamp", { ko: "가로등", en: "Lamp" }, "street lamp", "urban", "single-tile"),
    objectPreset("fountain", { ko: "분수", en: "Fountain" }, "stone fountain", "urban", "single-tile"),
  ],
  object: [
    objectPreset("barrel", { ko: "나무통", en: "Barrel" }, "wooden barrel", "industrial", "single-tile"),
    objectPreset("crate", { ko: "상자", en: "Crate" }, "wooden crate", "industrial", "single-tile"),
    objectPreset("sign", { ko: "표지판", en: "Sign" }, "wooden sign post", "forest", "single-tile"),
  ],
  tile: [
    tilePreset("grass", { ko: "잔디", en: "Grass" }, "grass", "forest"),
    tilePreset("stone", { ko: "돌", en: "Stone" }, "stone pavement", "urban"),
    tilePreset("wood", { ko: "나무", en: "Wood" }, "wooden planks", "urban"),
  ],
};
