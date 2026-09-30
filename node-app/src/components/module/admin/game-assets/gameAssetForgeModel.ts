import type { IGameAssetDoc } from "types/game";
import type { ImagePromptMetaType } from "types/app";
import { DEFAULT_PLAY_UNIVERSE } from "consts/app";
import {
  GAME_ASSET_STATUSES,
  GAME_ASSET_TYPES,
  type GameAssetStatusType,
  type GameAssetType,
} from "types/game/asset";
import type { IPersonaSprite, PersonaSpriteDirection } from "types/ai";

export { GAME_ASSET_STATUSES, GAME_ASSET_TYPES };
export const GAME_ASSET_DRAFT_TYPES = GAME_ASSET_TYPES.filter((assetType) => assetType !== "motion-guide");

export const GAME_ASSET_STATUS_TEXT: Record<GameAssetStatusType, { ko: string; en: string }> = {
  draft: { ko: "드래프트", en: "Draft" },
  review: { ko: "검수", en: "Review" },
  approved: { ko: "승인", en: "Approved" },
  published: { ko: "발행", en: "Published" },
  archived: { ko: "보관", en: "Archived" },
};

export const GAME_ASSET_TYPE_TEXT: Record<GameAssetType, { ko: string; en: string }> = {
  "character-sprite": { ko: "캐릭터 스프라이트", en: "Character Sprite" },
  "npc-portrait": { ko: "NPC 초상화", en: "NPC Portrait" },
  "stage-tileset": { ko: "스테이지 타일셋", en: "Stage Tileset" },
  "prop-sheet": { ko: "오브젝트 시트", en: "Prop Sheet" },
  "building-sheet": { ko: "건물 시트", en: "Building Sheet" },
  "motion-guide": { ko: "모션 가이드", en: "Motion Guide" },
  tile: { ko: "타일", en: "Tile" },
  object: { ko: "오브젝트", en: "Object" },
};

export const SPRITE_DIRECTION_GUIDES: Array<{
  direction: PersonaSpriteDirection;
  iso: "SW" | "NE" | "NW" | "SE";
}> = [
  { direction: "down", iso: "SW" },
  { direction: "up", iso: "NE" },
  { direction: "left", iso: "NW" },
  { direction: "right", iso: "SE" },
  { direction: "down-left", iso: "NW" },
  { direction: "up-left", iso: "NE" },
  { direction: "up-right", iso: "SE" },
  { direction: "down-right", iso: "SW" },
];

export const REGION_MIN_SIZE = 4;
export const REGION_RESIZE_HANDLES = [
  { mode: "resize-nw", className: "-left-1.5 -top-1.5 cursor-nwse-resize" },
  { mode: "resize-ne", className: "-right-1.5 -top-1.5 cursor-nesw-resize" },
  { mode: "resize-sw", className: "-bottom-1.5 -left-1.5 cursor-nesw-resize" },
  { mode: "resize-se", className: "-bottom-1.5 -right-1.5 cursor-nwse-resize" },
] as const;

export type RegionDragMode = "move" | (typeof REGION_RESIZE_HANDLES)[number]["mode"];
export type RegionRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};
export type RegionDragState = {
  index: number;
  mode: RegionDragMode;
  startClientX: number;
  startClientY: number;
  scaleX: number;
  scaleY: number;
  imageWidth: number;
  imageHeight: number;
  origin: RegionRect;
};

export type DraftFormType = {
  name: string;
  assetType: GameAssetType;
  sourceImageAssetId: string;
  storageUrl: string;
  templateKey: string;
  universeId: string;
  stageId: string;
  tagsText: string;
};

export type RegionDraftType = {
  key: string;
  x: string;
  y: string;
  width: string;
  height: string;
  role: string;
};

export type MetadataFormType = {
  frameWidth: string;
  frameHeight: string;
  columns: string;
  rows: string;
  fps: string;
  regions: RegionDraftType[];
};

export type PublishFormType = {
  targetType: "persona" | "stage";
  universeId: string;
  personaPid: string;
  spriteActionKey: string;
  stageDocumentId: string;
  stageId: string;
  stageName: string;
  assetName: string;
  rolesText: string;
  width: string;
  height: string;
};

export type GameAssetListFiltersType = {
  status: GameAssetStatusType | "all";
  assetType: GameAssetType | "all";
  scope: "all" | "mine";
  universeId: string;
  stageId: string;
};

export const DEFAULT_FORM: DraftFormType = {
  name: "",
  assetType: "character-sprite",
  sourceImageAssetId: "",
  storageUrl: "",
  templateKey: "",
  universeId: DEFAULT_PLAY_UNIVERSE,
  stageId: "",
  tagsText: `${DEFAULT_PLAY_UNIVERSE}, mvp`,
};

export const DEFAULT_METADATA_FORM: MetadataFormType = {
  frameWidth: "256",
  frameHeight: "256",
  columns: "4",
  rows: "8",
  fps: "8",
  regions: [],
};

export const DEFAULT_PUBLISH_FORM: PublishFormType = {
  targetType: "persona",
  universeId: DEFAULT_PLAY_UNIVERSE,
  personaPid: "",
  spriteActionKey: "walk",
  stageDocumentId: "",
  stageId: "",
  stageName: "",
  assetName: "",
  rolesText: "",
  width: "1",
  height: "1",
};

export const DEFAULT_LIST_FILTERS: GameAssetListFiltersType = {
  status: "all",
  assetType: "all",
  scope: "all",
  universeId: DEFAULT_PLAY_UNIVERSE,
  stageId: "",
};

export function applyStudioImageToDraft(
  current: DraftFormType,
  image: ImagePromptMetaType,
): DraftFormType {
  const inferredName = String(image.templateKey || image.assetId || "game-asset").replace(
    /[^a-zA-Z0-9_-]+/g,
    "-",
  );
  return {
    ...current,
    name: current.name || inferredName,
    sourceImageAssetId: image.assetId,
    storageUrl: image.url,
    templateKey: image.templateKey,
    universeId: image.universeId || current.universeId,
  };
}

export function splitTags(value: string) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function toPositiveInteger(value: string, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.floor(parsed));
}

export function toFiniteNumber(value: string, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function clampNumber(value: number, min: number, max: number) {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}

export function getRegionRect(region: RegionDraftType): RegionRect {
  return {
    x: Math.max(0, toFiniteNumber(region.x, 0)),
    y: Math.max(0, toFiniteNumber(region.y, 0)),
    width: Math.max(REGION_MIN_SIZE, toFiniteNumber(region.width, 256)),
    height: Math.max(REGION_MIN_SIZE, toFiniteNumber(region.height, 256)),
  };
}

export function formatRegionNumber(value: number) {
  return String(Math.max(0, Math.round(value)));
}

export function formatDate(value: unknown) {
  if (!(typeof value === "string" || typeof value === "number" || value instanceof Date)) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleDateString();
}

export function createRegionDraft(index: number): RegionDraftType {
  return {
    key: `region-${index + 1}`,
    x: "0",
    y: "0",
    width: "256",
    height: "256",
    role: "",
  };
}

export function getFrameSequence(columns: number) {
  return Array.from({ length: Math.min(4, Math.max(1, columns)) }, (_, index) => index);
}

export function createSpritePreview(asset: IGameAssetDoc | null, form: MetadataFormType): IPersonaSprite | null {
  const url = asset?.storage?.url?.trim();
  if (!url || asset?.assetType !== "character-sprite") return null;

  const columns = toPositiveInteger(form.columns, 4);
  const rows = toPositiveInteger(form.rows, 4);
  const frames = getFrameSequence(columns);

  return {
    url,
    frameWidth: toPositiveInteger(form.frameWidth, 256),
    frameHeight: toPositiveInteger(form.frameHeight, 256),
    columns,
    rows,
    fps: toPositiveInteger(form.fps, 8),
    idleFps: 0,
    idleDirection: "down",
    directionCount: 8,
    animations: Object.fromEntries(
      SPRITE_DIRECTION_GUIDES.map(({ direction }, row) => [
        direction,
        { row: Math.min(row, rows - 1), frames },
      ]),
    ) as IPersonaSprite["animations"],
  };
}

export function getRegionPreviewSize(asset: IGameAssetDoc | null, form: MetadataFormType) {
  const frameWidth = toPositiveInteger(form.frameWidth, 256);
  const frameHeight = toPositiveInteger(form.frameHeight, 256);
  const columns = toPositiveInteger(form.columns, 4);
  const rows = toPositiveInteger(form.rows, 4);
  return {
    width: asset?.storage?.width || frameWidth * columns,
    height: asset?.storage?.height || frameHeight * rows,
  };
}

export function getAssetSpriteSheetForm(asset?: IGameAssetDoc | null): MetadataFormType {
  const sheet = asset?.spriteSheet;
  return {
    frameWidth: String(sheet?.frameWidth || 256),
    frameHeight: String(sheet?.frameHeight || 256),
    columns: String(sheet?.columns || 4),
    rows: String(sheet?.rows || 4),
    fps: String(sheet?.fps || 8),
    regions: Array.isArray(asset?.regions)
      ? asset.regions.map((region, index) => ({
          key: String(region.key || `region-${index + 1}`),
          x: String(region.rect?.x || 0),
          y: String(region.rect?.y || 0),
          width: String(region.rect?.width || 256),
          height: String(region.rect?.height || 256),
          role: String(region.role || ""),
        }))
      : [],
  };
}
