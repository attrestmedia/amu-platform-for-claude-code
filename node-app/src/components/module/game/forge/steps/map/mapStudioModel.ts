import type { IGameAssetDoc, IStageAsset, IStageDoc } from "types/game";

const MAP_ASSET_TYPES = new Set<IGameAssetDoc["assetType"]>([
  "stage-tileset",
  "prop-sheet",
  "building-sheet",
  "tile",
  "object",
]);

const positiveInt = (value: unknown, fallback = 1) => {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
};

function isNormalized(value: unknown): value is { x: number; y: number } {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { x?: unknown; y?: unknown };
  return (
    typeof candidate.x === "number" &&
    Number.isFinite(candidate.x) &&
    candidate.x >= 0 &&
    candidate.x <= 1 &&
    typeof candidate.y === "number" &&
    Number.isFinite(candidate.y) &&
    candidate.y >= 0 &&
    candidate.y <= 1
  );
}

function assetLayer(asset: IGameAssetDoc): "ground" | "object" {
  return asset.assetType === "stage-tileset" || asset.assetType === "tile" ? "ground" : "object";
}

/** GameAsset API 결과를 StageMapEditor가 소비하는 StageAsset 계약으로 좁힌다. */
export function toStagePaletteAsset(asset: IGameAssetDoc): IStageAsset | null {
  const fileName = asset.storage?.url?.trim();
  if (!MAP_ASSET_TYPES.has(asset.assetType) || !fileName || !asset.gameAssetId) return null;

  const footprint = asset.runtime?.footprint;
  const width = positiveInt(footprint?.width, 1);
  const height = positiveInt(footprint?.height, 1);
  const layer = assetLayer(asset);
  const meta = asset.meta || {};
  const roles = Array.isArray(meta.roles) ? meta.roles.filter((role): role is string => typeof role === "string") : [];

  return {
    name: asset.gameAssetId,
    fileName,
    size: { width, height },
    roles,
    meta: {
      isoLayer: layer,
      ...(footprint ? { isoFootprint: { width, height, offsetX: 0, offsetY: 0 } } : {}),
      ...(asset.runtime?.isoHeightPx ? { isoHeightPx: asset.runtime.isoHeightPx } : {}),
      ...(isNormalized(asset.runtime?.anchor) ? { isoAnchor: asset.runtime.anchor } : {}),
    },
  };
}

export function mergeStagePaletteAssets(stageDoc: IStageDoc, paletteAssets: IStageAsset[]): IStageDoc {
  const byName = new Map<string, IStageAsset>();
  for (const asset of stageDoc.assets || []) byName.set(asset.name, asset);
  for (const asset of paletteAssets) {
    if (!byName.has(asset.name)) byName.set(asset.name, asset);
  }
  return { ...stageDoc, assets: Array.from(byName.values()) };
}

export function buildMapStageId(stageName: string): string {
  const readable = stageName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 28);
  return `map-${readable || "untitled"}-${Date.now().toString(36)}`;
}

export function buildNewMapPayload(stageName: string, size: number) {
  return {
    stageId: buildMapStageId(stageName),
    stageName: stageName.trim(),
    layout: { mode: "manual" as const, width: size, height: size, tiles: [] },
  };
}

export function getStageThumbnail(stage: IStageDoc): string | null {
  if (stage.background?.name) return stage.background.name;
  const tileAssetName = stage.layout?.tiles[0]?.assetName;
  if (tileAssetName) {
    const tileAsset = stage.assets?.find((asset) => asset.name === tileAssetName);
    if (tileAsset?.fileName) return tileAsset.fileName;
  }
  return stage.assets?.[0]?.fileName || null;
}
