import type { IGameAssetDoc, IStageDoc, IUserGameCharacterDoc } from "types/game";
import { getStageThumbnail } from "../steps/map/mapStudioModel";
import type { ForgeLocalizedText } from "../model/forgeGlossary";

export const FORGE_LIBRARY_KINDS = ["characters", "assets", "maps", "favorites"] as const;
export type ForgeLibraryKind = (typeof FORGE_LIBRARY_KINDS)[number];

export const ASSET_CATEGORY_OPTIONS = [
  { key: "all", label: { ko: "전체", en: "All" } },
  { key: "building", label: { ko: "건물", en: "Buildings" } },
  { key: "terrain", label: { ko: "지형", en: "Terrain" } },
  { key: "tree", label: { ko: "나무", en: "Trees" } },
  { key: "rock", label: { ko: "바위", en: "Rocks" } },
  { key: "decor", label: { ko: "장식", en: "Decor" } },
  { key: "object", label: { ko: "오브젝트", en: "Objects" } },
  { key: "tile", label: { ko: "타일", en: "Tiles" } },
] as const;
export type AssetCategoryKey = Exclude<(typeof ASSET_CATEGORY_OPTIONS)[number]["key"], "all">;

type LibraryStatusKey = "progress" | "success" | "muted" | "shared";

export type ForgeLibraryItem = {
  id: string;
  kind: Exclude<ForgeLibraryKind, "favorites">;
  name: string;
  imageUrl: string;
  alt: string;
  detail: ForgeLocalizedText;
  status: { key: LibraryStatusKey; label: ForgeLocalizedText };
  updatedAt?: string | Date;
  href: string;
  actionLabel: ForgeLocalizedText;
};

const WORLD_ASSET_TYPES = new Set<IGameAssetDoc["assetType"]>([
  "stage-tileset",
  "prop-sheet",
  "building-sheet",
  "tile",
  "object",
]);

const ASSET_TYPE_CATEGORY: Partial<Record<IGameAssetDoc["assetType"], AssetCategoryKey>> = {
  "stage-tileset": "terrain",
  "building-sheet": "building",
  "prop-sheet": "decor",
  tile: "tile",
  object: "object",
};

const CATEGORY_LABELS = new Map(ASSET_CATEGORY_OPTIONS.map((option) => [option.key, option.label]));
const CATEGORY_KEY_SET = new Set<AssetCategoryKey>(ASSET_CATEGORY_OPTIONS.filter((option) => option.key !== "all").map((option) => option.key));

function sourceImageUrl(assetId?: string) {
  const id = String(assetId || "").trim();
  return id ? `/api/persona/image-library?assetId=${encodeURIComponent(id)}&variant=optimized` : "";
}

function characterStatus(character: IUserGameCharacterDoc) {
  if (character.status === "disabled") return { key: "muted" as const, label: { ko: "비활성", en: "Inactive" } };
  if (character.status === "active") return { key: "success" as const, label: { ko: "완료", en: "Complete" } };
  return { key: "progress" as const, label: { ko: "제작 중", en: "In progress" } };
}

function characterHref(character: IUserGameCharacterDoc) {
  if (character.status === "disabled") return "/assets-studio/character?method=template";
  if (character.status === "active") return `/assets-studio/sprite?characterId=${encodeURIComponent(character.characterId)}`;
  return `/assets-studio/direction-sheet?characterId=${encodeURIComponent(character.characterId)}`;
}

export function toCharacterLibraryItem(character: IUserGameCharacterDoc): ForgeLibraryItem {
  const href = characterHref(character);
  return {
    id: character.characterId,
    kind: "characters",
    name: character.name || "이름 없는 캐릭터",
    imageUrl: sourceImageUrl(character.sourceImageAssetId),
    alt: `${character.name || "캐릭터"} 미리보기`,
    detail: { ko: "캐릭터", en: "Character" },
    status: characterStatus(character),
    updatedAt: character.updatedAt || character.createdAt,
    href,
    actionLabel: character.status === "disabled"
      ? { ko: "새로 등록", en: "Register again" }
      : { ko: "이어서 만들기", en: "Continue" },
  };
}

export function getAssetCategory(asset: IGameAssetDoc): AssetCategoryKey {
  const category = (asset.categories || []).map((value) => String(value || "").trim().toLowerCase())
    .find((value): value is AssetCategoryKey => CATEGORY_KEY_SET.has(value as AssetCategoryKey));
  return category || ASSET_TYPE_CATEGORY[asset.assetType] || "object";
}

export function isForgeLibraryAsset(asset: IGameAssetDoc) {
  return WORLD_ASSET_TYPES.has(asset.assetType);
}

function assetStatus(asset: IGameAssetDoc) {
  if (asset.status === "published") return { key: "shared" as const, label: { ko: "공용", en: "Shared" } };
  if (asset.status === "archived") return { key: "muted" as const, label: { ko: "보관됨", en: "Archived" } };
  if (asset.status === "approved") return { key: "success" as const, label: { ko: "사용 가능", en: "Ready" } };
  return { key: "progress" as const, label: { ko: "준비 중", en: "In progress" } };
}

export function toAssetLibraryItem(asset: IGameAssetDoc): ForgeLibraryItem {
  const category = getAssetCategory(asset);
  const categoryLabel = CATEGORY_LABELS.get(category) || CATEGORY_LABELS.get("object")!;
  return {
    id: asset.gameAssetId,
    kind: "assets",
    name: asset.name || "이름 없는 에셋",
    imageUrl: asset.storage?.url || "",
    alt: `${asset.name || "에셋"} 미리보기`,
    detail: categoryLabel,
    status: assetStatus(asset),
    updatedAt: asset.updatedAt || asset.createdAt,
    href: `/assets-studio/world?category=${encodeURIComponent(category)}`,
    actionLabel: { ko: "월드 에셋에서 보기", en: "Open world assets" },
  };
}

export function toMapLibraryItem(stage: IStageDoc & { _id?: string }): ForgeLibraryItem {
  const width = stage.layout?.width || 32;
  const height = stage.layout?.height || 32;
  const tileCount = stage.layout?.tiles?.length || 0;
  const stageRef = stage.stageId || stage._id || "";
  const href = `/assets-studio/map?stageId=${encodeURIComponent(stageRef)}`;
  return {
    id: stage._id || stage.stageId,
    kind: "maps",
    name: stage.stageName || "이름 없는 맵",
    imageUrl: getStageThumbnail(stage) || "",
    alt: `${stage.stageName || "맵"} 미리보기`,
    detail: { ko: `${width}×${height} · ${tileCount}개 배치`, en: `${width}×${height} · ${tileCount} placements` },
    status: { key: "success", label: { ko: "완료", en: "Ready" } },
    updatedAt: stage.updatedAt || stage.createdAt,
    href,
    actionLabel: { ko: "이어서 만들기", en: "Continue" },
  };
}
