import type {
  GridFootprint,
  GridPoint,
  IsometricProjectionConfig,
  NormalizedAnchor,
  ScreenPoint,
} from "../../types/game/coordinates";
import type {
  IIsometricDepthKey,
  IIsometricRenderPlacement,
  IsoLayerType,
} from "../../types/game/stage";
import { assertGridFootprint, assertNormalizedAnchor, gridToScreen, worldBounds } from "./isometricMath";

const ISO_LAYER_ORDER: Record<IsoLayerType, number> = {
  ground: 0,
  object: 1,
  roof: 2,
  overlay: 3,
};

const ISO_LAYER_Z_BASE: Record<IsoLayerType, number> = {
  ground: -10_000,
  object: 0,
  roof: 10_000,
  overlay: 20_000,
};

export const ISO_BACKGROUND_Z_INDEX = -20_000;

export interface CreateIsometricRenderPlacementInput {
  readonly stableId: string;
  readonly gridPoint: GridPoint;
  readonly footprint: GridFootprint;
  readonly projection: IsometricProjectionConfig;
  readonly anchor: NormalizedAnchor;
  readonly layer: IsoLayerType;
  readonly elevationPx?: number;
  readonly visualHeightPx?: number;
}

export interface IsometricDepthEntry<T> {
  readonly value: T;
  readonly key: IIsometricDepthKey;
}

export interface IsometricDepthAssignment<T> extends IsometricDepthEntry<T> {
  readonly zIndex: number;
}

export function resolveIsometricLayer(
  explicitLayer: IsoLayerType | undefined,
  roles: readonly string[] | undefined,
): IsoLayerType {
  if (explicitLayer) return explicitLayer;
  if (roles?.some((role) => role === "road" || role === "ground" || role === "pass")) return "ground";
  return "object";
}

export function createIsometricRenderPlacement(
  input: CreateIsometricRenderPlacementInput,
): IIsometricRenderPlacement {
  assertGridFootprint(input.footprint);
  assertNormalizedAnchor(input.anchor);

  const offsetX = input.footprint.offsetX ?? 0;
  const offsetY = input.footprint.offsetY ?? 0;
  const elevationPx = input.elevationPx ?? 0;
  const visualHeightPx = input.visualHeightPx ?? 0;
  const centerGridX = input.gridPoint.gridX + offsetX + (input.footprint.width - 1) / 2;
  const centerGridY = input.gridPoint.gridY + offsetY + (input.footprint.height - 1) / 2;
  const center = gridToScreen({ gridX: centerGridX, gridY: centerGridY }, input.projection, {
    elevationPx,
  });
  const groundHeight = (input.footprint.width + input.footprint.height) * (input.projection.tileHeight / 2);
  const screenPoint: ScreenPoint = {
    screenX: center.screenX,
    screenY: center.screenY + groundHeight / 2,
  };
  const farGridX = input.gridPoint.gridX + offsetX + input.footprint.width - 1;
  const farGridY = input.gridPoint.gridY + offsetY + input.footprint.height - 1;

  return {
    gridPoint: input.gridPoint,
    screenPoint,
    footprint: input.footprint,
    anchor: input.anchor,
    elevationPx,
    visualHeightPx,
    layer: input.layer,
    depthKey: {
      layer: input.layer,
      diagonal: farGridX + farGridY,
      elevationPx,
      gridX: farGridX,
      gridY: farGridY,
      stableId: input.stableId,
    },
  };
}

export function compareIsometricDepth(a: IIsometricDepthKey, b: IIsometricDepthKey): number {
  return (
    ISO_LAYER_ORDER[a.layer] - ISO_LAYER_ORDER[b.layer] ||
    a.diagonal - b.diagonal ||
    a.elevationPx - b.elevationPx ||
    a.gridY - b.gridY ||
    a.gridX - b.gridX ||
    a.stableId.localeCompare(b.stableId)
  );
}

export function assignStableIsometricZ<T>(
  entries: readonly IsometricDepthEntry<T>[],
): IsometricDepthAssignment<T>[] {
  const layerOffsets: Record<IsoLayerType, number> = {
    ground: 0,
    object: 0,
    roof: 0,
    overlay: 0,
  };

  return [...entries].sort((a, b) => compareIsometricDepth(a.key, b.key)).map((entry) => {
    const offset = layerOffsets[entry.key.layer]++;
    return {
      ...entry,
      zIndex: ISO_LAYER_Z_BASE[entry.key.layer] + offset,
    };
  });
}

export function getIsometricSpriteSize(
  footprint: GridFootprint,
  projection: IsometricProjectionConfig,
  layer: IsoLayerType,
  visualHeightPx = 0,
): { width: number; height: number } {
  assertGridFootprint(footprint);
  const width = (footprint.width + footprint.height) * (projection.tileWidth / 2);
  const groundHeight = (footprint.width + footprint.height) * (projection.tileHeight / 2);
  return {
    width,
    height: layer === "ground" ? groundHeight : Math.max(groundHeight, visualHeightPx),
  };
}

export function getIsometricStageDiamond(
  gridWidth: number,
  gridHeight: number,
  projection: IsometricProjectionConfig,
): readonly [ScreenPoint, ScreenPoint, ScreenPoint, ScreenPoint] {
  return worldBounds(
    { gridX: 0, gridY: 0 },
    { width: gridWidth, height: gridHeight },
    projection,
  ).corners;
}
