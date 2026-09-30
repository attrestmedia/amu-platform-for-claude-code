import type {
  GridFootprint,
  GridPoint,
  ICameraConstraints,
  IIsometricDepthKey,
  IStageData,
  IStageDoc,
  IsometricProjectionConfig,
  IsometricWorldBounds,
  ScreenPoint,
} from "types/game";
import { clampCameraAxis } from "./cameraUtils";
import { gridToScreen, screenToGrid, worldBounds } from "./isometricMath";
import { resolveIsometricMovementRuntime } from "./isometricMovement";
import { compareIsometricDepth } from "./isometricRender";

export interface IsometricViewportRuntime {
  readonly projection: IsometricProjectionConfig;
  readonly gridWidth: number;
  readonly gridHeight: number;
  readonly logicalUnitsPerTile: number;
  readonly bounds: IsometricWorldBounds;
}

export interface CameraViewportLike {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly zoom?: number;
}

export interface IsometricGridViewportBounds {
  readonly minGridX: number;
  readonly maxGridX: number;
  readonly minGridY: number;
  readonly maxGridY: number;
}

export interface IsometricCullFootprint {
  readonly gridPoint: GridPoint;
  readonly footprint: GridFootprint;
}

export interface IsometricPickObject extends IsometricCullFootprint {
  readonly id: string;
  readonly depthKey?: IIsometricDepthKey;
}

export type IsometricPickResult =
  | {
      readonly kind: "tile";
      readonly gridPoint: GridPoint;
      readonly stageScreenPoint: ScreenPoint;
    }
  | {
      readonly kind: "object";
      readonly gridPoint: GridPoint;
      readonly stageScreenPoint: ScreenPoint;
      readonly objectId: string;
    };

export interface IsometricMinimapTransform {
  readonly scale: number;
  readonly padding: number;
  readonly mapWidth: number;
  readonly mapHeight: number;
  readonly minScreenX: number;
  readonly minScreenY: number;
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function createRuntime(
  projection: IsometricProjectionConfig,
  gridWidth: number,
  gridHeight: number,
  logicalUnitsPerTile: number,
): IsometricViewportRuntime | null {
  if (
    !isPositiveInteger(gridWidth) ||
    !isPositiveInteger(gridHeight) ||
    !Number.isFinite(logicalUnitsPerTile) ||
    logicalUnitsPerTile <= 0
  ) {
    return null;
  }

  const bounds = worldBounds(
    { gridX: 0, gridY: 0 },
    { width: gridWidth, height: gridHeight },
    projection,
  );

  return {
    projection,
    gridWidth,
    gridHeight,
    logicalUnitsPerTile,
    bounds,
  };
}

export function resolveIsometricViewportRuntime(
  stageData: IStageData | null | undefined,
): IsometricViewportRuntime | null {
  const movementRuntime = resolveIsometricMovementRuntime(stageData);
  if (!movementRuntime) return null;

  return createRuntime(
    movementRuntime.projection,
    movementRuntime.gridWidth,
    movementRuntime.gridHeight,
    movementRuntime.logicalUnitsPerTile,
  );
}

export function resolveIsometricViewportRuntimeFromDoc(
  doc: IStageDoc | null | undefined,
): IsometricViewportRuntime | null {
  const config = doc?.projectionConfig;
  const layout = doc?.layout;
  if (
    doc?.coordinateContractVersion !== 2 ||
    config?.projection !== "isometric-2to1" ||
    !layout
  ) {
    return null;
  }

  return createRuntime(
    {
      tileWidth: config.tileWidth,
      tileHeight: config.tileHeight,
      origin: config.origin,
    },
    layout.width,
    layout.height,
    config.logicalUnitsPerTile,
  );
}

export function getIsometricCameraConstraints(runtime: IsometricViewportRuntime): ICameraConstraints {
  const { screen } = runtime.bounds;
  return {
    minX: screen.minScreenX,
    maxX: screen.maxScreenX,
    minY: screen.minScreenY,
    maxY: screen.maxScreenY,
  };
}

export function clampIsometricCameraPosition(
  camera: CameraViewportLike,
  runtime: IsometricViewportRuntime,
): { x: number; y: number } {
  const zoom = Number.isFinite(camera.zoom) && (camera.zoom as number) > 0 ? (camera.zoom as number) : 1;
  const viewportWidth = camera.width / zoom;
  const viewportHeight = camera.height / zoom;
  const constraints = getIsometricCameraConstraints(runtime);

  return {
    x: clampCameraAxis(camera.x, constraints.minX, constraints.maxX, viewportWidth),
    y: clampCameraAxis(camera.y, constraints.minY, constraints.maxY, viewportHeight),
  };
}

export function viewportPointToStageScreen(
  viewportPoint: ScreenPoint,
  camera: CameraViewportLike,
): ScreenPoint {
  const zoom = Number.isFinite(camera.zoom) && (camera.zoom as number) > 0 ? (camera.zoom as number) : 1;
  return {
    screenX: camera.x + viewportPoint.screenX / zoom,
    screenY: camera.y + viewportPoint.screenY / zoom,
  };
}

export function getIsometricViewportGridBounds(
  camera: CameraViewportLike,
  runtime: IsometricViewportRuntime,
  paddingPx = 0,
): IsometricGridViewportBounds {
  if (!Number.isFinite(paddingPx) || paddingPx < 0) {
    throw new RangeError("paddingPx must be a non-negative finite number");
  }

  const zoom = Number.isFinite(camera.zoom) && (camera.zoom as number) > 0 ? (camera.zoom as number) : 1;
  const padding = paddingPx / zoom;
  const minScreenX = camera.x - padding;
  const minScreenY = camera.y - padding;
  const maxScreenX = camera.x + camera.width / zoom + padding;
  const maxScreenY = camera.y + camera.height / zoom + padding;
  const corners = [
    screenToGrid({ screenX: minScreenX, screenY: minScreenY }, runtime.projection),
    screenToGrid({ screenX: maxScreenX, screenY: minScreenY }, runtime.projection),
    screenToGrid({ screenX: maxScreenX, screenY: maxScreenY }, runtime.projection),
    screenToGrid({ screenX: minScreenX, screenY: maxScreenY }, runtime.projection),
  ];

  return {
    minGridX: Math.max(-0.5, Math.min(...corners.map((point) => point.gridX))),
    maxGridX: Math.min(runtime.gridWidth - 0.5, Math.max(...corners.map((point) => point.gridX))),
    minGridY: Math.max(-0.5, Math.min(...corners.map((point) => point.gridY))),
    maxGridY: Math.min(runtime.gridHeight - 0.5, Math.max(...corners.map((point) => point.gridY))),
  };
}

export function isIsometricGridFootprintVisible(
  placement: IsometricCullFootprint,
  viewport: IsometricGridViewportBounds,
): boolean {
  const offsetX = placement.footprint.offsetX ?? 0;
  const offsetY = placement.footprint.offsetY ?? 0;
  const minGridX = placement.gridPoint.gridX + offsetX - 0.5;
  const minGridY = placement.gridPoint.gridY + offsetY - 0.5;
  const maxGridX = minGridX + placement.footprint.width;
  const maxGridY = minGridY + placement.footprint.height;

  return (
    maxGridX >= viewport.minGridX &&
    minGridX <= viewport.maxGridX &&
    maxGridY >= viewport.minGridY &&
    minGridY <= viewport.maxGridY
  );
}

export function pickIsometricTargetAtViewportPoint(
  viewportPoint: ScreenPoint,
  camera: CameraViewportLike,
  runtime: IsometricViewportRuntime,
  objects: readonly IsometricPickObject[] = [],
): IsometricPickResult | null {
  const stageScreenPoint = viewportPointToStageScreen(viewportPoint, camera);
  const gridPoint = screenToGrid(stageScreenPoint, runtime.projection, { rounding: "nearest-cell" });

  if (
    gridPoint.gridX < 0 ||
    gridPoint.gridX >= runtime.gridWidth ||
    gridPoint.gridY < 0 ||
    gridPoint.gridY >= runtime.gridHeight
  ) {
    return null;
  }

  const hits = objects
    .filter((object) => {
      const offsetX = object.footprint.offsetX ?? 0;
      const offsetY = object.footprint.offsetY ?? 0;
      const minGridX = object.gridPoint.gridX + offsetX;
      const minGridY = object.gridPoint.gridY + offsetY;
      return (
        gridPoint.gridX >= minGridX &&
        gridPoint.gridX < minGridX + object.footprint.width &&
        gridPoint.gridY >= minGridY &&
        gridPoint.gridY < minGridY + object.footprint.height
      );
    })
    .sort((a, b) => {
      if (a.depthKey && b.depthKey) {
        const depthOrder = compareIsometricDepth(b.depthKey, a.depthKey);
        if (depthOrder !== 0) return depthOrder;
      } else if (a.depthKey || b.depthKey) {
        return a.depthKey ? -1 : 1;
      }
      return a.id.localeCompare(b.id);
    });

  if (hits[0]) {
    return {
      kind: "object",
      gridPoint,
      stageScreenPoint,
      objectId: hits[0].id,
    };
  }

  return {
    kind: "tile",
    gridPoint,
    stageScreenPoint,
  };
}

export function createIsometricMinimapTransform(
  runtime: IsometricViewportRuntime,
  maxWidth: number,
  maxHeight: number,
  padding = 8,
): IsometricMinimapTransform {
  if (
    !Number.isFinite(maxWidth) ||
    !Number.isFinite(maxHeight) ||
    !Number.isFinite(padding) ||
    maxWidth <= padding * 2 ||
    maxHeight <= padding * 2 ||
    padding < 0
  ) {
    throw new RangeError("minimap dimensions must be finite and larger than padding");
  }

  const screenBounds = runtime.bounds.screen;
  const scale = Math.min(
    (maxWidth - padding * 2) / screenBounds.width,
    (maxHeight - padding * 2) / screenBounds.height,
  );

  return {
    scale,
    padding,
    mapWidth: screenBounds.width * scale + padding * 2,
    mapHeight: screenBounds.height * scale + padding * 2,
    minScreenX: screenBounds.minScreenX,
    minScreenY: screenBounds.minScreenY,
  };
}

export function projectStageScreenPointToMinimap(
  point: ScreenPoint,
  transform: IsometricMinimapTransform,
): ScreenPoint {
  return {
    screenX: transform.padding + (point.screenX - transform.minScreenX) * transform.scale,
    screenY: transform.padding + (point.screenY - transform.minScreenY) * transform.scale,
  };
}

export function projectGridPointToMinimap(
  point: GridPoint,
  runtime: IsometricViewportRuntime,
  transform: IsometricMinimapTransform,
): ScreenPoint {
  return projectStageScreenPointToMinimap(gridToScreen(point, runtime.projection), transform);
}

export function projectCameraViewportToMinimap(
  camera: CameraViewportLike,
  transform: IsometricMinimapTransform,
): readonly [ScreenPoint, ScreenPoint, ScreenPoint, ScreenPoint] {
  const zoom = Number.isFinite(camera.zoom) && (camera.zoom as number) > 0 ? (camera.zoom as number) : 1;
  const width = camera.width / zoom;
  const height = camera.height / zoom;
  return [
    projectStageScreenPointToMinimap({ screenX: camera.x, screenY: camera.y }, transform),
    projectStageScreenPointToMinimap({ screenX: camera.x + width, screenY: camera.y }, transform),
    projectStageScreenPointToMinimap({ screenX: camera.x + width, screenY: camera.y + height }, transform),
    projectStageScreenPointToMinimap({ screenX: camera.x, screenY: camera.y + height }, transform),
  ];
}
