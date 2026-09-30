import type {
  GridFootprint,
  GridPoint,
  IsometricProjectionConfig,
  NormalizedAnchor,
  ScreenPoint,
} from "../../types/game/coordinates";
import type { IStageAsset, IStageDoc, IStageLayoutTile } from "../../types/game/stage-doc";
import {
  IsometricMathError,
  assertGridFootprint,
  assertNormalizedAnchor,
  gridToScreen,
  screenToGrid,
  worldBounds,
} from "./isometricMath";
import { shouldBlockMovementByRoles } from "./stageBuilder";

/**
 * @docHint
 * @purpose Stage Map Editor/Forge 아이소 저작용 순수 커널 — 편집면 좌표 변환, 셀 피킹, footprint/충돌 overlay, 투영 메타 검증
 * @process 편집면 fit/pan/zoom 변환 계산  canvas↔stage screen↔grid 변환  overlay 지오메트리 산출  발행 메타 fail-closed 검증
 * @domain game-stage-editor
 * @scope admin-authoring
 */

// 편집면 변환 — 다이아몬드 screen AABB를 canvas 안에 배치하는 scale/offset.
// 런타임과 동일한 gridToScreen/screenToGrid를 공유하므로 편집기 선택 셀 == 런타임 배치 셀이 보장된다.
export interface IsometricEditorTransform {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
}

export interface IsometricEditorRuntime {
  readonly projection: IsometricProjectionConfig;
  readonly gridWidth: number;
  readonly gridHeight: number;
}

export interface EditorProjectionMetaIssue {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export interface EditorProjectionMetaValidation {
  readonly valid: boolean;
  readonly issues: EditorProjectionMetaIssue[];
}

export interface EditorGhostPlacement {
  readonly gridPoint: GridPoint;
  readonly footprint: GridFootprint;
  readonly inBounds: boolean;
  readonly overlappingTileIds: readonly string[];
  readonly cellPolygons: readonly (readonly ScreenPoint[])[];
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

export function resolveIsometricEditorRuntime(doc: Partial<IStageDoc> | null | undefined): IsometricEditorRuntime | null {
  const layout = doc?.layout;
  const config = doc?.projectionConfig;
  if (
    doc?.coordinateContractVersion !== 2 ||
    !layout ||
    !config ||
    config.projection !== "isometric-2to1" ||
    !isPositiveInteger(layout.width) ||
    !isPositiveInteger(layout.height)
  ) return null;

  const projection: IsometricProjectionConfig = {
    tileWidth: config.tileWidth,
    tileHeight: config.tileHeight,
    origin: config.origin,
  };

  if (
    !Number.isFinite(projection.tileWidth) ||
    !Number.isFinite(projection.tileHeight) ||
    projection.tileWidth <= 0 ||
    projection.tileHeight <= 0
  ) {
    return null;
  }

  return { projection, gridWidth: layout.width, gridHeight: layout.height };
}

// 다이아몬드 전체가 canvas 안에 들어오는 기본(fit) 변환
export function createIsometricEditorTransform(
  runtime: IsometricEditorRuntime,
  canvasWidth: number,
  canvasHeight: number,
  padding = 16,
): IsometricEditorTransform {
  if (
    !Number.isFinite(canvasWidth) ||
    !Number.isFinite(canvasHeight) ||
    !Number.isFinite(padding) ||
    padding < 0 ||
    canvasWidth <= padding * 2 ||
    canvasHeight <= padding * 2
  ) {
    throw new RangeError("editor canvas dimensions must be finite and larger than padding");
  }

  const bounds = worldBounds(
    { gridX: 0, gridY: 0 },
    { width: runtime.gridWidth, height: runtime.gridHeight },
    runtime.projection,
  );
  const scale = Math.min(
    (canvasWidth - padding * 2) / bounds.screen.width,
    (canvasHeight - padding * 2) / bounds.screen.height,
  );

  return {
    scale,
    offsetX: padding - bounds.screen.minScreenX * scale + (canvasWidth - padding * 2 - bounds.screen.width * scale) / 2,
    offsetY: padding - bounds.screen.minScreenY * scale + (canvasHeight - padding * 2 - bounds.screen.height * scale) / 2,
    canvasWidth,
    canvasHeight,
  };
}

// pan/zoom 적용 — anchorCanvasPoint를 고정점으로 scale 변경
export function zoomIsometricEditorTransform(
  transform: IsometricEditorTransform,
  nextScale: number,
  anchorCanvasPoint: ScreenPoint,
): IsometricEditorTransform {
  if (!Number.isFinite(nextScale) || nextScale <= 0) {
    throw new RangeError("editor zoom scale must be a positive finite number");
  }
  const ratio = nextScale / transform.scale;
  return {
    ...transform,
    scale: nextScale,
    offsetX: anchorCanvasPoint.screenX - (anchorCanvasPoint.screenX - transform.offsetX) * ratio,
    offsetY: anchorCanvasPoint.screenY - (anchorCanvasPoint.screenY - transform.offsetY) * ratio,
  };
}

export function panIsometricEditorTransform(
  transform: IsometricEditorTransform,
  deltaX: number,
  deltaY: number,
): IsometricEditorTransform {
  if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) {
    throw new RangeError("editor pan delta must be finite");
  }
  return { ...transform, offsetX: transform.offsetX + deltaX, offsetY: transform.offsetY + deltaY };
}

export function stageScreenToEditorCanvas(point: ScreenPoint, transform: IsometricEditorTransform): ScreenPoint {
  return {
    screenX: point.screenX * transform.scale + transform.offsetX,
    screenY: point.screenY * transform.scale + transform.offsetY,
  };
}

export function editorCanvasToStageScreen(point: ScreenPoint, transform: IsometricEditorTransform): ScreenPoint {
  return {
    screenX: (point.screenX - transform.offsetX) / transform.scale,
    screenY: (point.screenY - transform.offsetY) / transform.scale,
  };
}

// canvas 포인터 → 논리 그리드 셀 (런타임 pointer picking과 동일한 nearest-cell 정책)
export function pickIsometricEditorCell(
  canvasPoint: ScreenPoint,
  transform: IsometricEditorTransform,
  runtime: IsometricEditorRuntime,
): GridPoint | null {
  const stagePoint = editorCanvasToStageScreen(canvasPoint, transform);
  const gridPoint = screenToGrid(stagePoint, runtime.projection, { rounding: "nearest-cell" });

  if (
    gridPoint.gridX < 0 ||
    gridPoint.gridX >= runtime.gridWidth ||
    gridPoint.gridY < 0 ||
    gridPoint.gridY >= runtime.gridHeight
  ) {
    return null;
  }
  return gridPoint;
}

// 셀 다이아몬드 4점 (canvas 좌표) — 셀 중심은 gridToScreen(cell), 꼭짓점은 ±tile/2
export function getIsometricEditorCellPolygon(
  gridPoint: GridPoint,
  transform: IsometricEditorTransform,
  runtime: IsometricEditorRuntime,
): readonly ScreenPoint[] {
  const center = gridToScreen(gridPoint, runtime.projection);
  const halfW = runtime.projection.tileWidth / 2;
  const halfH = runtime.projection.tileHeight / 2;
  return [
    { screenX: center.screenX, screenY: center.screenY - halfH },
    { screenX: center.screenX + halfW, screenY: center.screenY },
    { screenX: center.screenX, screenY: center.screenY + halfH },
    { screenX: center.screenX - halfW, screenY: center.screenY },
  ].map((point) => stageScreenToEditorCanvas(point, transform));
}

// footprint가 점유하는 모든 셀
export function listFootprintCells(gridPoint: GridPoint, footprint: GridFootprint): GridPoint[] {
  assertGridFootprint(footprint);
  const offsetX = footprint.offsetX ?? 0;
  const offsetY = footprint.offsetY ?? 0;
  const cells: GridPoint[] = [];
  for (let dy = 0; dy < footprint.height; dy++) {
    for (let dx = 0; dx < footprint.width; dx++) {
      cells.push({ gridX: gridPoint.gridX + offsetX + dx, gridY: gridPoint.gridY + offsetY + dy });
    }
  }
  return cells;
}

export interface EditorTileOccupancy {
  readonly tile: IStageLayoutTile;
  readonly cells: readonly GridPoint[];
  readonly blocking: boolean;
}

function resolveTileFootprint(tile: IStageLayoutTile, asset: IStageAsset | undefined): GridFootprint {
  const fp = tile.meta?.isoFootprint ?? asset?.meta?.isoFootprint;
  if (fp) return fp;
  return {
    width: Math.max(1, Math.round(asset?.size.width ?? 1)),
    height: Math.max(1, Math.round(asset?.size.height ?? 1)),
    offsetX: 0,
    offsetY: 0,
  };
}

// layout 타일 → 점유 셀/충돌 여부 (충돌 overlay와 ghost 겹침 판정의 단일 정본)
export function buildEditorTileOccupancy(
  tiles: readonly IStageLayoutTile[],
  assetsByName: ReadonlyMap<string, IStageAsset>,
): EditorTileOccupancy[] {
  return tiles.map((tile) => {
    const asset = assetsByName.get(tile.assetName);
    let cells: GridPoint[];
    try {
      cells = listFootprintCells({ gridX: tile.x, gridY: tile.y }, resolveTileFootprint(tile, asset));
    } catch {
      // 잘못된 footprint 메타는 단일 셀로 fail-safe 표시 (편집기에서 눈에 띄게)
      cells = [{ gridX: tile.x, gridY: tile.y }];
    }
    const roles = [
      ...(Array.isArray(asset?.roles) ? (asset?.roles as string[]) : []),
      ...(Array.isArray(tile.meta?.roles) ? (tile.meta?.roles as string[]) : []),
    ];
    return { tile, cells, blocking: shouldBlockMovementByRoles(roles) };
  });
}

// ghost placement — hover 셀에 선택 에셋을 놓았을 때의 점유/경계/겹침 판정
export function resolveEditorGhostPlacement(
  hoverCell: GridPoint,
  asset: IStageAsset | undefined,
  occupancy: readonly EditorTileOccupancy[],
  transform: IsometricEditorTransform,
  runtime: IsometricEditorRuntime,
): EditorGhostPlacement {
  const footprint: GridFootprint = asset?.meta?.isoFootprint ?? {
    width: Math.max(1, Math.round(asset?.size.width ?? 1)),
    height: Math.max(1, Math.round(asset?.size.height ?? 1)),
    offsetX: 0,
    offsetY: 0,
  };

  let cells: GridPoint[];
  try {
    cells = listFootprintCells(hoverCell, footprint);
  } catch {
    cells = [hoverCell];
  }

  const inBounds = cells.every(
    (cell) =>
      cell.gridX >= 0 && cell.gridX < runtime.gridWidth && cell.gridY >= 0 && cell.gridY < runtime.gridHeight,
  );

  const cellKeys = new Set(cells.map((cell) => `${cell.gridX}:${cell.gridY}`));
  const overlappingTileIds = occupancy
    .filter((entry) => entry.cells.some((cell) => cellKeys.has(`${cell.gridX}:${cell.gridY}`)))
    .map((entry) => entry.tile.id);

  return {
    gridPoint: hoverCell,
    footprint,
    inBounds,
    overlappingTileIds,
    cellPolygons: cells.map((cell) => getIsometricEditorCellPolygon(cell, transform, runtime)),
  };
}

// Forge/발행용 투영 메타 검증 — 잘못된 메타는 발행 차단 (fail-closed)
// 대상: footprint(양의 정수/정수 offset), anchor(0..1), isoHeightPx(0 이상 유한), elevation(유한)
export function validateStageAssetProjectionMeta(meta: {
  isoFootprint?: GridFootprint;
  isoAnchor?: NormalizedAnchor;
  isoHeightPx?: number;
  isoZOffsetPx?: number;
  tileWidth?: number;
  tileHeight?: number;
}): EditorProjectionMetaValidation {
  const issues: EditorProjectionMetaIssue[] = [];
  const push = (code: string, path: string, message: string) => issues.push({ code, path, message });

  if (meta.isoFootprint) {
    try {
      assertGridFootprint(meta.isoFootprint);
    } catch (error) {
      push(
        error instanceof IsometricMathError ? error.code : "ISO_INVALID_FOOTPRINT",
        "isoFootprint",
        error instanceof Error ? error.message : "invalid footprint",
      );
    }
  }

  if (meta.isoAnchor) {
    try {
      assertNormalizedAnchor(meta.isoAnchor);
    } catch (error) {
      push(
        error instanceof IsometricMathError ? error.code : "ISO_INVALID_ANCHOR",
        "isoAnchor",
        error instanceof Error ? error.message : "invalid anchor",
      );
    }
  }

  if (meta.isoHeightPx !== undefined && (!Number.isFinite(meta.isoHeightPx) || meta.isoHeightPx < 0)) {
    push("ISO_INVALID_HEIGHT", "isoHeightPx", "isoHeightPx must be a non-negative finite number");
  }

  if (meta.isoZOffsetPx !== undefined && !Number.isFinite(meta.isoZOffsetPx)) {
    push("ISO_INVALID_ELEVATION", "isoZOffsetPx", "isoZOffsetPx must be finite");
  }

  const hasTileSize = meta.tileWidth !== undefined || meta.tileHeight !== undefined;
  if (hasTileSize) {
    const tw = Number(meta.tileWidth);
    const th = Number(meta.tileHeight);
    if (!Number.isFinite(tw) || !Number.isFinite(th) || tw <= 0 || th <= 0) {
      push("ISO_INVALID_TILE_SIZE", "tileWidth/tileHeight", "tile size must be positive finite numbers");
    } else if (Math.abs(tw - th * 2) > Number.EPSILON * tw * 4) {
      push("ISO_INVALID_TILE_RATIO", "tileWidth/tileHeight", "isometric assets require tileWidth:tileHeight=2:1");
    }
  }

  return { valid: issues.length === 0, issues };
}
