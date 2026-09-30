import type {
  GridFootprint,
  IsometricProjectionConfig,
  LogicalWorldPoint,
  ScreenPoint,
} from "../../types/game/coordinates";
import type {
  DirectionType,
  ICollisionRect,
  IIsometricDepthKey,
  IIsometricMovementRuntime,
  IStageData,
} from "../../types/game/stage";
import { gridToScreen, logicalWorldToGrid, screenToGrid } from "./isometricMath";

export const CHARACTER_FOOTPRINT_TILES = 0.5;
export const NPC_INTERACTION_DISTANCE_TILES = 1.25;
const SWEEP_EPSILON = 1e-6;

export interface LogicalMovementResult {
  readonly position: LogicalWorldPoint;
  readonly appliedDelta: LogicalWorldPoint;
  readonly collidedX: boolean;
  readonly collidedY: boolean;
}

export function resolveIsometricMovementRuntime(stageData: IStageData | null | undefined): IIsometricMovementRuntime | null {
  const isoMeta = stageData?.isoMeta;
  const config = isoMeta?.config;
  const logicalUnitsPerTile = isoMeta?.logicalUnitsPerTile;
  if (
    isoMeta?.coordinateContractVersion !== 2 ||
    config?.projection !== "isometric-2to1" ||
    !Number.isFinite(config.tileWidth) ||
    !Number.isFinite(config.tileHeight) ||
    !Number.isFinite(logicalUnitsPerTile) ||
    (logicalUnitsPerTile as number) <= 0
  ) {
    return null;
  }

  return {
    projection: {
      tileWidth: config.tileWidth as number,
      tileHeight: config.tileHeight as number,
      origin: {
        screenX: config.originX ?? 0,
        screenY: config.originY ?? 0,
      },
    },
    logicalUnitsPerTile: logicalUnitsPerTile as number,
    gridWidth: isoMeta.gridWidth,
    gridHeight: isoMeta.gridHeight,
  };
}

interface SweepHit {
  time: number;
  normalX: number;
  normalY: number;
}

export function directionToScreenVector(direction: DirectionType): ScreenPoint {
  if (!direction) return { screenX: 0, screenY: 0 };

  let screenX = 0;
  let screenY = 0;
  if (direction.includes("left")) screenX -= 1;
  if (direction.includes("right")) screenX += 1;
  if (direction.includes("up")) screenY -= 1;
  if (direction.includes("down")) screenY += 1;

  const length = Math.hypot(screenX, screenY);
  return length > 0
    ? { screenX: screenX / length, screenY: screenY / length }
    : { screenX: 0, screenY: 0 };
}

export function screenVectorToDirection(
  vector: ScreenPoint,
  movementThreshold = 0,
): DirectionType {
  if (!Number.isFinite(movementThreshold) || movementThreshold < 0) {
    throw new RangeError("movementThreshold must be a non-negative finite number");
  }
  if (Math.hypot(vector.screenX, vector.screenY) < movementThreshold) return null;

  const sector = Math.round(Math.atan2(vector.screenY, vector.screenX) / (Math.PI / 4));
  switch (sector) {
    case -4:
    case 4:
      return "left";
    case -3:
      return "up-left";
    case -2:
      return "up";
    case -1:
      return "up-right";
    case 0:
      return "right";
    case 1:
      return "down-right";
    case 2:
      return "down";
    case 3:
      return "down-left";
    default:
      return null;
  }
}

export function screenVectorToLogicalDelta(
  vector: ScreenPoint,
  projection: IsometricProjectionConfig,
  logicalUnitsPerTile: number,
): LogicalWorldPoint {
  if (!Number.isFinite(logicalUnitsPerTile) || logicalUnitsPerTile <= 0) {
    throw new RangeError("logicalUnitsPerTile must be a positive finite number");
  }

  const origin = projection.origin ?? { screenX: 0, screenY: 0 };
  const from = screenToGrid(origin, projection);
  const to = screenToGrid(
    {
      screenX: origin.screenX + vector.screenX,
      screenY: origin.screenY + vector.screenY,
    },
    projection,
  );

  return {
    worldX: (to.gridX - from.gridX) * logicalUnitsPerTile,
    worldY: (to.gridY - from.gridY) * logicalUnitsPerTile,
  };
}

export function projectLogicalPosition(
  position: LogicalWorldPoint,
  runtime: Pick<IIsometricMovementRuntime, "projection" | "logicalUnitsPerTile">,
  elevationPx = 0,
): ScreenPoint {
  const gridPoint = logicalWorldToGrid(position, { unitsPerTile: runtime.logicalUnitsPerTile });
  return gridToScreen(gridPoint, runtime.projection, { elevationPx });
}

export function createLogicalEntityRect(
  position: LogicalWorldPoint,
  footprintTiles = CHARACTER_FOOTPRINT_TILES,
  logicalUnitsPerTile = 1,
  id = "logical-entity",
): ICollisionRect {
  if (!Number.isFinite(footprintTiles) || footprintTiles <= 0) {
    throw new RangeError("footprintTiles must be a positive finite number");
  }
  if (!Number.isFinite(logicalUnitsPerTile) || logicalUnitsPerTile <= 0) {
    throw new RangeError("logicalUnitsPerTile must be a positive finite number");
  }

  const size = footprintTiles * logicalUnitsPerTile;
  return {
    id,
    x: position.worldX - size / 2,
    y: position.worldY - size / 2,
    width: size,
    height: size,
    coordinateSpace: "logical-world",
  };
}

export function createLogicalObstacleRect(
  gridX: number,
  gridY: number,
  footprint: GridFootprint,
  logicalUnitsPerTile: number,
  id: string,
): ICollisionRect {
  const offsetX = footprint.offsetX ?? 0;
  const offsetY = footprint.offsetY ?? 0;
  return {
    id,
    x: (gridX + offsetX - 0.5) * logicalUnitsPerTile,
    y: (gridY + offsetY - 0.5) * logicalUnitsPerTile,
    width: footprint.width * logicalUnitsPerTile,
    height: footprint.height * logicalUnitsPerTile,
    type: "obstacle",
    coordinateSpace: "logical-world",
  };
}

function sweepAabb(moving: ICollisionRect, delta: LogicalWorldPoint, target: ICollisionRect): SweepHit | null {
  const overlapsAtStart =
    moving.x < target.x + target.width &&
    moving.x + moving.width > target.x &&
    moving.y < target.y + target.height &&
    moving.y + moving.height > target.y;
  if (overlapsAtStart) {
    return {
      time: 0,
      normalX: Math.abs(delta.worldX) >= Math.abs(delta.worldY) ? -Math.sign(delta.worldX) : 0,
      normalY: Math.abs(delta.worldY) > Math.abs(delta.worldX) ? -Math.sign(delta.worldY) : 0,
    };
  }

  const axisTimes = (
    start: number,
    size: number,
    movement: number,
    targetStart: number,
    targetSize: number,
  ): { entry: number; exit: number } | null => {
    if (movement === 0) {
      if (start + size <= targetStart || start >= targetStart + targetSize) return null;
      return { entry: Number.NEGATIVE_INFINITY, exit: Number.POSITIVE_INFINITY };
    }

    const inverseEntry = movement > 0 ? targetStart - (start + size) : targetStart + targetSize - start;
    const inverseExit = movement > 0 ? targetStart + targetSize - start : targetStart - (start + size);
    return {
      entry: inverseEntry / movement,
      exit: inverseExit / movement,
    };
  };

  const xTimes = axisTimes(moving.x, moving.width, delta.worldX, target.x, target.width);
  const yTimes = axisTimes(moving.y, moving.height, delta.worldY, target.y, target.height);
  if (!xTimes || !yTimes) return null;

  const entryTime = Math.max(xTimes.entry, yTimes.entry);
  const exitTime = Math.min(xTimes.exit, yTimes.exit);
  if (entryTime > exitTime || entryTime < 0 || entryTime > 1) return null;

  if (xTimes.entry > yTimes.entry) {
    return { time: entryTime, normalX: delta.worldX > 0 ? -1 : 1, normalY: 0 };
  }
  return { time: entryTime, normalX: 0, normalY: delta.worldY > 0 ? -1 : 1 };
}

function broadPhaseRect(rect: ICollisionRect, delta: LogicalWorldPoint): ICollisionRect {
  return {
    id: `${rect.id}-broad-phase`,
    x: Math.min(rect.x, rect.x + delta.worldX),
    y: Math.min(rect.y, rect.y + delta.worldY),
    width: rect.width + Math.abs(delta.worldX),
    height: rect.height + Math.abs(delta.worldY),
    coordinateSpace: "logical-world",
  };
}

export function resolveSweptLogicalMovement(
  rect: ICollisionRect,
  delta: LogicalWorldPoint,
  queryCandidates: (broadPhase: ICollisionRect) => readonly ICollisionRect[],
): LogicalMovementResult {
  const start: LogicalWorldPoint = {
    worldX: rect.x + rect.width / 2,
    worldY: rect.y + rect.height / 2,
  };
  let appliedX = 0;
  let appliedY = 0;
  let remaining = delta;
  let movingRect = { ...rect };
  let collidedX = false;
  let collidedY = false;

  for (let pass = 0; pass < 2; pass++) {
    let earliest: SweepHit | null = null;
    for (const candidate of queryCandidates(broadPhaseRect(movingRect, remaining))) {
      const hit = sweepAabb(movingRect, remaining, candidate);
      if (hit && (!earliest || hit.time < earliest.time)) earliest = hit;
    }

    if (!earliest) {
      appliedX += remaining.worldX;
      appliedY += remaining.worldY;
      break;
    }

    const safeTime = Math.max(0, earliest.time - SWEEP_EPSILON);
    const moveX = remaining.worldX * safeTime;
    const moveY = remaining.worldY * safeTime;
    appliedX += moveX;
    appliedY += moveY;
    movingRect = { ...movingRect, x: movingRect.x + moveX, y: movingRect.y + moveY };

    const remainingScale = 1 - earliest.time;
    collidedX ||= earliest.normalX !== 0;
    collidedY ||= earliest.normalY !== 0;
    remaining = {
      worldX: earliest.normalX !== 0 ? 0 : remaining.worldX * remainingScale,
      worldY: earliest.normalY !== 0 ? 0 : remaining.worldY * remainingScale,
    };
    if (remaining.worldX === 0 && remaining.worldY === 0) break;
  }

  return {
    position: { worldX: start.worldX + appliedX, worldY: start.worldY + appliedY },
    appliedDelta: { worldX: appliedX, worldY: appliedY },
    collidedX,
    collidedY,
  };
}

export function logicalDistanceInTiles(
  a: LogicalWorldPoint,
  b: LogicalWorldPoint,
  logicalUnitsPerTile: number,
): number {
  if (!Number.isFinite(logicalUnitsPerTile) || logicalUnitsPerTile <= 0) {
    throw new RangeError("logicalUnitsPerTile must be a positive finite number");
  }
  return Math.hypot(a.worldX - b.worldX, a.worldY - b.worldY) / logicalUnitsPerTile;
}

export function createCharacterDepthKey(
  stableId: string,
  position: LogicalWorldPoint,
  runtime: Pick<IIsometricMovementRuntime, "logicalUnitsPerTile">,
): IIsometricDepthKey {
  const grid = logicalWorldToGrid(position, { unitsPerTile: runtime.logicalUnitsPerTile });
  return {
    layer: "object",
    diagonal: grid.gridX + grid.gridY,
    elevationPx: 0,
    gridX: grid.gridX,
    gridY: grid.gridY,
    stableId,
  };
}
