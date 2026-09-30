import type {
  GridFootprint,
  GridPoint,
  GridRoundingPolicy,
  IsometricProjectionConfig,
  IsometricWorldBounds,
  LogicalWorldPoint,
  LogicalWorldScale,
  NormalizedAnchor,
  ScreenPoint,
} from "../../types/game/coordinates";

export type IsometricMathErrorCode =
  | "ISO_NON_FINITE_VALUE"
  | "ISO_INVALID_TILE_SIZE"
  | "ISO_INVALID_LOGICAL_SCALE"
  | "ISO_INVALID_FOOTPRINT"
  | "ISO_INVALID_ANCHOR"
  | "ISO_INVALID_ROUNDING_POLICY"
  | "ISO_INVALID_ELEVATION_RANGE";

export class IsometricMathError extends RangeError {
  readonly code: IsometricMathErrorCode;

  constructor(code: IsometricMathErrorCode, message: string) {
    super(message);
    this.name = "IsometricMathError";
    this.code = code;
  }
}

export interface GridToScreenOptions {
  readonly elevationPx?: number;
}

export interface ScreenToGridOptions extends GridToScreenOptions {
  readonly rounding?: GridRoundingPolicy;
}

export interface WorldBoundsOptions {
  readonly minElevationPx?: number;
  readonly maxElevationPx?: number;
}

const DEFAULT_LOGICAL_WORLD_SCALE: LogicalWorldScale = { unitsPerTile: 1 };

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new IsometricMathError("ISO_NON_FINITE_VALUE", `${label} must be finite`);
  }
}

function assertProjection(config: IsometricProjectionConfig): void {
  assertFinite(config.tileWidth, "tileWidth");
  assertFinite(config.tileHeight, "tileHeight");

  if (config.tileWidth <= 0 || config.tileHeight <= 0) {
    throw new IsometricMathError("ISO_INVALID_TILE_SIZE", "tileWidth and tileHeight must be greater than zero");
  }

  if (config.origin) {
    assertFinite(config.origin.screenX, "origin.screenX");
    assertFinite(config.origin.screenY, "origin.screenY");
  }
}

function assertGridPoint(point: GridPoint): void {
  assertFinite(point.gridX, "gridX");
  assertFinite(point.gridY, "gridY");
}

function assertScreenPoint(point: ScreenPoint): void {
  assertFinite(point.screenX, "screenX");
  assertFinite(point.screenY, "screenY");
}

function assertLogicalWorldPoint(point: LogicalWorldPoint): void {
  assertFinite(point.worldX, "worldX");
  assertFinite(point.worldY, "worldY");
}

function assertLogicalWorldScale(scale: LogicalWorldScale): void {
  assertFinite(scale.unitsPerTile, "unitsPerTile");
  if (scale.unitsPerTile <= 0) {
    throw new IsometricMathError("ISO_INVALID_LOGICAL_SCALE", "unitsPerTile must be greater than zero");
  }
}

function assertElevation(elevationPx: number, label = "elevationPx"): void {
  assertFinite(elevationPx, label);
}

export function assertNormalizedAnchor(anchor: NormalizedAnchor): void {
  assertFinite(anchor.x, "anchor.x");
  assertFinite(anchor.y, "anchor.y");

  if (anchor.x < 0 || anchor.x > 1 || anchor.y < 0 || anchor.y > 1) {
    throw new IsometricMathError("ISO_INVALID_ANCHOR", "anchor values must be within the inclusive range 0..1");
  }
}

export function assertGridFootprint(footprint: GridFootprint): void {
  const offsetX = footprint.offsetX ?? 0;
  const offsetY = footprint.offsetY ?? 0;

  assertFinite(footprint.width, "footprint.width");
  assertFinite(footprint.height, "footprint.height");
  assertFinite(offsetX, "footprint.offsetX");
  assertFinite(offsetY, "footprint.offsetY");

  if (
    !Number.isInteger(footprint.width) ||
    !Number.isInteger(footprint.height) ||
    footprint.width <= 0 ||
    footprint.height <= 0 ||
    !Number.isInteger(offsetX) ||
    !Number.isInteger(offsetY)
  ) {
    throw new IsometricMathError(
      "ISO_INVALID_FOOTPRINT",
      "footprint dimensions must be positive integers and offsets must be integers",
    );
  }
}

export function quantizeGridPoint(point: GridPoint, rounding: GridRoundingPolicy): GridPoint {
  assertGridPoint(point);

  if (rounding === "continuous") return point;

  if (rounding === "floor") {
    return {
      gridX: Math.floor(point.gridX),
      gridY: Math.floor(point.gridY),
    };
  }

  if (rounding === "round") {
    return {
      gridX: Math.round(point.gridX),
      gridY: Math.round(point.gridY),
    };
  }

  if (rounding === "nearest-cell") {
    // 2:1 diamond 내부의 nearest cell은 역투영 좌표 각 축의 ±0.5 경계로 결정된다.
    return {
      gridX: Math.floor(point.gridX + 0.5),
      gridY: Math.floor(point.gridY + 0.5),
    };
  }

  throw new IsometricMathError("ISO_INVALID_ROUNDING_POLICY", `unsupported rounding policy: ${rounding}`);
}

export function gridToScreen(
  point: GridPoint,
  config: IsometricProjectionConfig,
  options: GridToScreenOptions = {},
): ScreenPoint {
  assertGridPoint(point);
  assertProjection(config);

  const elevationPx = options.elevationPx ?? 0;
  assertElevation(elevationPx);

  const originX = config.origin?.screenX ?? 0;
  const originY = config.origin?.screenY ?? 0;

  return {
    screenX: originX + (point.gridX - point.gridY) * (config.tileWidth / 2),
    screenY: originY + (point.gridX + point.gridY) * (config.tileHeight / 2) - elevationPx,
  };
}

export function screenToGrid(
  point: ScreenPoint,
  config: IsometricProjectionConfig,
  options: ScreenToGridOptions = {},
): GridPoint {
  assertScreenPoint(point);
  assertProjection(config);

  const elevationPx = options.elevationPx ?? 0;
  assertElevation(elevationPx);

  const originX = config.origin?.screenX ?? 0;
  const originY = config.origin?.screenY ?? 0;
  const dx = (point.screenX - originX) / (config.tileWidth / 2);
  const dy = (point.screenY - originY + elevationPx) / (config.tileHeight / 2);

  return quantizeGridPoint(
    {
      gridX: (dx + dy) / 2,
      gridY: (dy - dx) / 2,
    },
    options.rounding ?? "continuous",
  );
}

export function gridToLogicalWorld(
  point: GridPoint,
  scale: LogicalWorldScale = DEFAULT_LOGICAL_WORLD_SCALE,
): LogicalWorldPoint {
  assertGridPoint(point);
  assertLogicalWorldScale(scale);

  return {
    worldX: point.gridX * scale.unitsPerTile,
    worldY: point.gridY * scale.unitsPerTile,
  };
}

export function logicalWorldToGrid(
  point: LogicalWorldPoint,
  scale: LogicalWorldScale = DEFAULT_LOGICAL_WORLD_SCALE,
  rounding: GridRoundingPolicy = "continuous",
): GridPoint {
  assertLogicalWorldPoint(point);
  assertLogicalWorldScale(scale);

  return quantizeGridPoint(
    {
      gridX: point.worldX / scale.unitsPerTile,
      gridY: point.worldY / scale.unitsPerTile,
    },
    rounding,
  );
}

export function worldBounds(
  origin: GridPoint,
  footprint: GridFootprint,
  config: IsometricProjectionConfig,
  options: WorldBoundsOptions = {},
): IsometricWorldBounds {
  assertGridPoint(origin);
  assertGridFootprint(footprint);
  assertProjection(config);

  const minElevationPx = options.minElevationPx ?? 0;
  const maxElevationPx = options.maxElevationPx ?? minElevationPx;
  assertElevation(minElevationPx, "minElevationPx");
  assertElevation(maxElevationPx, "maxElevationPx");

  if (minElevationPx > maxElevationPx) {
    throw new IsometricMathError(
      "ISO_INVALID_ELEVATION_RANGE",
      "minElevationPx must be less than or equal to maxElevationPx",
    );
  }

  const minGridX = origin.gridX + (footprint.offsetX ?? 0) - 0.5;
  const minGridY = origin.gridY + (footprint.offsetY ?? 0) - 0.5;
  const maxGridX = minGridX + footprint.width;
  const maxGridY = minGridY + footprint.height;
  const groundCorners = [
    gridToScreen({ gridX: minGridX, gridY: minGridY }, config),
    gridToScreen({ gridX: maxGridX, gridY: minGridY }, config),
    gridToScreen({ gridX: maxGridX, gridY: maxGridY }, config),
    gridToScreen({ gridX: minGridX, gridY: maxGridY }, config),
  ] as const;
  const minScreenX = Math.min(...groundCorners.map((corner) => corner.screenX));
  const maxScreenX = Math.max(...groundCorners.map((corner) => corner.screenX));
  const groundMinScreenY = Math.min(...groundCorners.map((corner) => corner.screenY));
  const groundMaxScreenY = Math.max(...groundCorners.map((corner) => corner.screenY));
  const minScreenY = groundMinScreenY - maxElevationPx;
  const maxScreenY = groundMaxScreenY - minElevationPx;
  const corners: readonly [ScreenPoint, ScreenPoint, ScreenPoint, ScreenPoint] = [
    { screenX: groundCorners[0].screenX, screenY: groundCorners[0].screenY - minElevationPx },
    { screenX: groundCorners[1].screenX, screenY: groundCorners[1].screenY - minElevationPx },
    { screenX: groundCorners[2].screenX, screenY: groundCorners[2].screenY - minElevationPx },
    { screenX: groundCorners[3].screenX, screenY: groundCorners[3].screenY - minElevationPx },
  ];

  return {
    minGridX,
    maxGridX,
    minGridY,
    maxGridY,
    screen: {
      minScreenX,
      maxScreenX,
      minScreenY,
      maxScreenY,
      width: maxScreenX - minScreenX,
      height: maxScreenY - minScreenY,
    },
    corners,
  };
}

/**
 * @deprecated primitive 인자 API는 ISO-1 호환 경계다. 새 코드는 gridToScreen을 사용한다.
 */
export function isoGridToScreen(
  gridX: number,
  gridY: number,
  iso: { tileWidth: number; tileHeight: number; originX?: number; originY?: number },
): ScreenPoint {
  return gridToScreen(
    { gridX, gridY },
    {
      tileWidth: iso.tileWidth,
      tileHeight: iso.tileHeight,
      origin: {
        screenX: iso.originX ?? 0,
        screenY: iso.originY ?? 0,
      },
    },
  );
}
