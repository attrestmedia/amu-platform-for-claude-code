import type { GridFootprint, GridPoint } from "../../types/game/coordinates";
import type { IStageAsset, IStageLayoutTile } from "../../types/game/stage-doc";
import { listFootprintCells } from "./isometricEditor";

export const STAGE_AUTHORING_LAYERS = ["ground", "object", "boundary", "overlay"] as const;
export const STAGE_BRUSH_RADII = [1, 3, 5] as const;

export type StageAuthoringLayerType = (typeof STAGE_AUTHORING_LAYERS)[number];
export type StageMapPaintToolType = "brush" | "rectangle" | "fill" | "eraser";

export type StageMapPaintResult = {
  tiles: IStageLayoutTile[];
  changed: number;
  skipped: number;
  truncated: boolean;
  issue?: "asset_requires_single_cell" | "asset_not_found" | "points_required";
};

const cellKey = (point: GridPoint) => `${point.gridX}:${point.gridY}`;

function isBoundaryRole(role: string) {
  return role === "boundary" || role.startsWith("boundary-");
}

export function resolveStageAssetAuthoringLayer(asset: IStageAsset | undefined): StageAuthoringLayerType {
  if (asset?.roles?.some(isBoundaryRole)) return "boundary";
  if (asset?.meta?.isoLayer === "ground") return "ground";
  if (asset?.meta?.isoLayer === "overlay" || asset?.meta?.isoLayer === "roof") return "overlay";
  return "object";
}

export function resolveStageTileAuthoringLayer(
  tile: IStageLayoutTile,
  asset: IStageAsset | undefined,
): StageAuthoringLayerType {
  const explicit = tile.meta?.authoringLayer;
  if (explicit && STAGE_AUTHORING_LAYERS.includes(explicit)) return explicit;
  if (tile.meta?.roles?.some(isBoundaryRole)) return "boundary";
  if (tile.meta?.isoLayer === "ground") return "ground";
  if (tile.meta?.isoLayer === "overlay" || tile.meta?.isoLayer === "roof") return "overlay";
  return resolveStageAssetAuthoringLayer(asset);
}

export function doStageAuthoringLayersConflict(
  left: StageAuthoringLayerType,
  right: StageAuthoringLayerType,
) {
  if (left === "ground" || right === "ground") return left === right;
  if (left === "overlay" || right === "overlay") return left === right;
  return true;
}

function isInBounds(point: GridPoint, width: number, height: number) {
  return point.gridX >= 0 && point.gridY >= 0 && point.gridX < width && point.gridY < height;
}

function uniqueBoundedCells(points: readonly GridPoint[], width: number, height: number) {
  const seen = new Set<string>();
  const cells: GridPoint[] = [];
  for (const point of points) {
    if (!isInBounds(point, width, height)) continue;
    const key = cellKey(point);
    if (seen.has(key)) continue;
    seen.add(key);
    cells.push(point);
  }
  return cells;
}

export function listStageBrushCells(
  centers: readonly GridPoint[],
  radius: number,
  width: number,
  height: number,
) {
  const normalizedRadius = STAGE_BRUSH_RADII.includes(radius as (typeof STAGE_BRUSH_RADII)[number]) ? radius : 1;
  const cells: GridPoint[] = [];
  for (const center of centers) {
    for (let y = center.gridY - normalizedRadius; y <= center.gridY + normalizedRadius; y += 1) {
      for (let x = center.gridX - normalizedRadius; x <= center.gridX + normalizedRadius; x += 1) {
        cells.push({ gridX: x, gridY: y });
      }
    }
  }
  return uniqueBoundedCells(cells, width, height);
}

export function listStageRectangleCells(start: GridPoint, end: GridPoint, width: number, height: number) {
  const cells: GridPoint[] = [];
  const minX = Math.min(start.gridX, end.gridX);
  const maxX = Math.max(start.gridX, end.gridX);
  const minY = Math.min(start.gridY, end.gridY);
  const maxY = Math.max(start.gridY, end.gridY);
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) cells.push({ gridX: x, gridY: y });
  }
  return uniqueBoundedCells(cells, width, height);
}

function isSingleCellAsset(asset: IStageAsset) {
  const footprint = asset.meta?.isoFootprint;
  return (footprint?.width ?? asset.size.width) === 1 && (footprint?.height ?? asset.size.height) === 1;
}

function resolveTileFootprint(tile: IStageLayoutTile, asset: IStageAsset | undefined): GridFootprint {
  return tile.meta?.isoFootprint ?? asset?.meta?.isoFootprint ?? {
    width: asset?.size.width ?? 1,
    height: asset?.size.height ?? 1,
  };
}

function resolveFloodCells({
  start,
  width,
  height,
  tiles,
  assetsByName,
  activeLayer,
}: {
  start: GridPoint;
  width: number;
  height: number;
  tiles: readonly IStageLayoutTile[];
  assetsByName: ReadonlyMap<string, IStageAsset>;
  activeLayer: StageAuthoringLayerType;
}) {
  if (!isInBounds(start, width, height)) return [];
  const byCell = new Map<string, IStageLayoutTile>();
  for (const tile of tiles) {
    if (resolveStageTileAuthoringLayer(tile, assetsByName.get(tile.assetName)) === activeLayer) {
      byCell.set(`${tile.x}:${tile.y}`, tile);
    }
  }
  const sourceAssetName = byCell.get(cellKey(start))?.assetName ?? null;
  const visited = new Set<string>();
  const queue: GridPoint[] = [start];
  const result: GridPoint[] = [];
  for (let index = 0; index < queue.length; index += 1) {
    const point = queue[index];
    const key = cellKey(point);
    if (visited.has(key) || !isInBounds(point, width, height)) continue;
    visited.add(key);
    const tile = byCell.get(key);
    if ((tile?.assetName ?? null) !== sourceAssetName) continue;
    result.push(point);
    queue.push(
      { gridX: point.gridX - 1, gridY: point.gridY },
      { gridX: point.gridX + 1, gridY: point.gridY },
      { gridX: point.gridX, gridY: point.gridY - 1 },
      { gridX: point.gridX, gridY: point.gridY + 1 },
    );
  }
  return result;
}

function createPaintTile(
  point: GridPoint,
  assetName: string,
  activeLayer: StageAuthoringLayerType,
  id: string,
): IStageLayoutTile {
  const runtimeLayer = activeLayer === "boundary" ? "object" : activeLayer;
  return {
    id,
    assetName,
    x: point.gridX,
    y: point.gridY,
    rotation: 0,
    scale: 1,
    state: "normal",
    meta: {
      authoringLayer: activeLayer,
      isoLayer: runtimeLayer,
      ...(activeLayer === "boundary" ? { roles: ["boundary"] } : {}),
    },
  };
}

export function applyStageMapPaint({
  tool,
  points,
  brushRadius,
  activeLayer,
  assetName,
  assets,
  tiles,
  width,
  height,
  maxTileInstances,
}: {
  tool: StageMapPaintToolType;
  points: readonly GridPoint[];
  brushRadius: number;
  activeLayer: StageAuthoringLayerType;
  assetName?: string | null;
  assets: readonly IStageAsset[];
  tiles: readonly IStageLayoutTile[];
  width: number;
  height: number;
  maxTileInstances: number;
}): StageMapPaintResult {
  const first = points[0];
  if (!first) return { tiles: [...tiles], changed: 0, skipped: 0, truncated: false, issue: "points_required" };

  const assetsByName = new Map(assets.map((asset) => [asset.name, asset]));
  const asset = assetName ? assetsByName.get(assetName) : undefined;
  if (tool !== "eraser" && !asset) {
    return { tiles: [...tiles], changed: 0, skipped: 0, truncated: false, issue: "asset_not_found" };
  }
  if (tool !== "eraser" && asset && !isSingleCellAsset(asset)) {
    return { tiles: [...tiles], changed: 0, skipped: 0, truncated: false, issue: "asset_requires_single_cell" };
  }

  const targets = tool === "fill"
    ? resolveFloodCells({ start: first, width, height, tiles, assetsByName, activeLayer })
    : tool === "rectangle"
      ? listStageRectangleCells(first, points.at(-1) ?? first, width, height)
      : listStageBrushCells(points, brushRadius, width, height);
  const targetKeys = new Set(targets.map(cellKey));

  if (tool === "eraser") {
    const nextTiles = tiles.filter((tile) => {
      const tileAsset = assetsByName.get(tile.assetName);
      const layer = resolveStageTileAuthoringLayer(tile, tileAsset);
      if (layer !== activeLayer) return true;
      return !listFootprintCells(
        { gridX: tile.x, gridY: tile.y },
        resolveTileFootprint(tile, tileAsset),
      ).some((cell) => targetKeys.has(cellKey(cell)));
    });
    return {
      tiles: nextTiles,
      changed: tiles.length - nextTiles.length,
      skipped: 0,
      truncated: false,
    };
  }

  const nextTiles = [...tiles];
  let changed = 0;
  let skipped = 0;
  let truncated = false;
  const usedIds = new Set(nextTiles.map((tile) => tile.id));

  for (const point of targets) {
    const sameLayerIndex = nextTiles.findIndex((tile) => {
      if (tile.x !== point.gridX || tile.y !== point.gridY) return false;
      return resolveStageTileAuthoringLayer(tile, assetsByName.get(tile.assetName)) === activeLayer;
    });
    const conflict = nextTiles.some((tile, index) => {
      if (index === sameLayerIndex || tile.x !== point.gridX || tile.y !== point.gridY) return false;
      const layer = resolveStageTileAuthoringLayer(tile, assetsByName.get(tile.assetName));
      return doStageAuthoringLayersConflict(layer, activeLayer);
    });
    if (conflict) {
      skipped += 1;
      continue;
    }

    const current = sameLayerIndex >= 0 ? nextTiles[sameLayerIndex] : undefined;
    if (current?.assetName === assetName) continue;
    if (!current && nextTiles.length >= maxTileInstances) {
      truncated = true;
      continue;
    }

    let id = current?.id ?? `paint_${activeLayer}_${point.gridX}_${point.gridY}`;
    for (let suffix = 1; usedIds.has(id) && id !== current?.id; suffix += 1) {
      id = `paint_${activeLayer}_${point.gridX}_${point.gridY}_${suffix}`;
    }
    usedIds.add(id);
    const nextTile = createPaintTile(point, assetName!, activeLayer, id);
    if (sameLayerIndex >= 0) nextTiles[sameLayerIndex] = nextTile;
    else nextTiles.push(nextTile);
    changed += 1;
  }

  return { tiles: nextTiles, changed, skipped, truncated };
}
