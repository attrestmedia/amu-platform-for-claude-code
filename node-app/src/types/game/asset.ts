import type { UnknownRecord } from "utils/common/typeUtils";

export const GAME_ASSET_TYPES = [
  "character-sprite",
  "npc-portrait",
  "stage-tileset",
  "prop-sheet",
  "building-sheet",
  "motion-guide",
  "tile",
  "object",
] as const;

export const GAME_ASSET_STATUSES = ["draft", "review", "approved", "published", "archived"] as const;
export const GAME_ASSET_SOURCE_TYPES = ["generated", "uploaded", "edited"] as const;

export type GameAssetType = (typeof GAME_ASSET_TYPES)[number];
export type GameAssetStatusType = (typeof GAME_ASSET_STATUSES)[number];
export type GameAssetSourceType = (typeof GAME_ASSET_SOURCE_TYPES)[number];

export type GameAssetRectType = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type GameAssetSpriteSheetType = {
  frameWidth: number;
  frameHeight: number;
  columns: number;
  rows: number;
  fps?: number;
  animations?: Record<
    string,
    {
      row?: number;
      frames: number[];
      fps?: number;
      loop?: boolean;
    }
  >;
};

export type GameAssetRegionType = {
  key: string;
  rect: GameAssetRectType;
  role?: string;
  anchor?: {
    x: number;
    y: number;
  };
  meta?: UnknownRecord;
};

export type GameAssetStorageType = {
  driver?: "r2";
  access?: "public" | "private";
  bucket?: string;
  key?: string;
  url: string;
  mimeType?: string;
  width?: number;
  height?: number;
  bytes?: number;
  sha256?: string;
  ext?: string;
};

export type GameAssetInventorySummaryType = {
  total: number;
  r2Ready: number;
  migrationRequired: number;
  published: number;
  byType: Partial<Record<GameAssetType, number>>;
  publishedByType: Partial<Record<GameAssetType, number>>;
  byStatus: Partial<Record<GameAssetStatusType, number>>;
};

export interface IGameAssetDoc {
  gameAssetId: string;
  name: string;
  assetType: GameAssetType;
  status: GameAssetStatusType;
  sourceType: GameAssetSourceType;
  sourceImageAssetId?: string;
  templateKey?: string;
  provider?: string;
  modelName?: string;
  universeId?: string;
  stageId?: string;
  tags?: string[];
  categories?: string[];
  storage: GameAssetStorageType;
  spriteSheet?: GameAssetSpriteSheetType;
  regions?: GameAssetRegionType[];
  runtime?: {
    textureKey?: string;
    scale?: number;
    anchor?: {
      x: number;
      y: number;
    };
    footprint?: {
      width?: number;
      height?: number;
    };
    // 2:1 iso 오브젝트의 세로 픽셀 높이 — 계약 v2 §4.5, 발행 게이트 필수 항목 (tile/object/building 계열)
    isoHeightPx?: number;
    collision?: UnknownRecord;
  };
  meta?: UnknownRecord;
  createdBy?: string;
  updatedBy?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}
