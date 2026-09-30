import { GAME_CONSTANTS as GC } from "consts/game";
import type { IIsometricFootprint, IStageDoc, IStageProjectionConfigV2 } from "types/game";
import { assertGridFootprint, assertNormalizedAnchor, IsometricMathError } from "./isometricMath";

/** StageDoc v2 좌표 계약의 생성·조회·쓰기 검증 정본. */

export const STAGE_COORDINATE_CONTRACT_VERSION = 2 as const;

export const STAGE_MAP_LIMITS = {
  recommendedDimension: 128,
  maxWidth: 256,
  maxHeight: 256,
  maxCells: 65_536,
  maxTileInstances: 4_096,
} as const;

export const DEFAULT_STAGE_PROJECTION_CONFIG_V2: IStageProjectionConfigV2 = {
  projection: "isometric-2to1",
  tileWidth: GC.ISO.TILE_WIDTH,
  tileHeight: GC.ISO.TILE_HEIGHT,
  origin: { screenX: 0, screenY: 0 },
  logicalUnitsPerTile: 1,
  rounding: {
    storage: "integer",
    occupancy: "floor",
    snap: "round",
    picking: "nearest-cell",
  },
};

export interface StageCoordinateContractIssue {
  code: string;
  path: string;
  message: string;
}

export interface StageCoordinateContractValidation {
  valid: boolean;
  issues: StageCoordinateContractIssue[];
}

export interface StageCoordinateReadResult {
  doc: IStageDoc;
  validation: StageCoordinateContractValidation;
}

const COORDINATE_WRITE_FIELDS = new Set([
  "coordinateContractVersion",
  "projectionConfig",
  "layout",
  "assets",
  "background",
  "border",
  "portals",
]);

function addIssue(
  issues: StageCoordinateContractIssue[],
  code: string,
  path: string,
  message: string,
): void {
  issues.push({ code, path, message });
}

function isPositiveFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function validateFootprint(
  footprint: IIsometricFootprint | undefined,
  path: string,
  issues: StageCoordinateContractIssue[],
): void {
  if (!footprint) return;
  try {
    assertGridFootprint(footprint);
  } catch (error) {
    addIssue(
      issues,
      error instanceof IsometricMathError ? error.code : "STAGE_INVALID_FOOTPRINT",
      path,
      error instanceof Error ? error.message : "invalid footprint",
    );
  }
}

export function validateStageCoordinateV2(doc: IStageDoc): StageCoordinateContractValidation {
  const issues: StageCoordinateContractIssue[] = [];
  const config = doc.projectionConfig;

  if (doc.coordinateContractVersion !== STAGE_COORDINATE_CONTRACT_VERSION) {
    addIssue(
      issues,
      "STAGE_COORDINATE_VERSION_REQUIRED",
      "coordinateContractVersion",
      "coordinateContractVersion must be 2",
    );
  }

  if (!config) {
    addIssue(issues, "STAGE_PROJECTION_CONFIG_REQUIRED", "projectionConfig", "projectionConfig is required");
  } else {
    if (config.projection !== "isometric-2to1") {
      addIssue(
        issues,
        "STAGE_PROJECTION_UNSUPPORTED",
        "projectionConfig.projection",
        "projection must be isometric-2to1",
      );
    }
    if (!isPositiveFinite(config.tileWidth) || !isPositiveFinite(config.tileHeight)) {
      addIssue(
        issues,
        "STAGE_TILE_SIZE_INVALID",
        "projectionConfig",
        "tileWidth and tileHeight must be positive finite numbers",
      );
    } else if (Math.abs(config.tileWidth - config.tileHeight * 2) > Number.EPSILON * config.tileWidth * 4) {
      addIssue(
        issues,
        "STAGE_TILE_RATIO_INVALID",
        "projectionConfig",
        "v2 StageDoc assets require tileWidth:tileHeight=2:1",
      );
    }
    if (!Number.isFinite(config.origin?.screenX) || !Number.isFinite(config.origin?.screenY)) {
      addIssue(issues, "STAGE_ORIGIN_INVALID", "projectionConfig.origin", "origin must contain finite screen px");
    }
    if (!isPositiveFinite(config.logicalUnitsPerTile)) {
      addIssue(
        issues,
        "STAGE_LOGICAL_SCALE_INVALID",
        "projectionConfig.logicalUnitsPerTile",
        "logicalUnitsPerTile must be positive and finite",
      );
    }
    if (
      config.rounding?.storage !== "integer" ||
      config.rounding?.occupancy !== "floor" ||
      config.rounding?.snap !== "round" ||
      config.rounding?.picking !== "nearest-cell"
    ) {
      addIssue(
        issues,
        "STAGE_ROUNDING_POLICY_INVALID",
        "projectionConfig.rounding",
        "v2 rounding policies must match the coordinate contract",
      );
    }
  }

  const assetNames = new Set<string>();
  if (doc.background?.name && !isHttpsUrl(doc.background.name)) {
    addIssue(issues, "STAGE_MEDIA_URL_REQUIRED", "background.name", "stage media must use an HTTPS R2 URL");
  }
  for (const [side, value] of Object.entries(doc.border ?? {})) {
    if (value && !isHttpsUrl(value)) {
      addIssue(issues, "STAGE_MEDIA_URL_REQUIRED", `border.${side}`, "stage media must use an HTTPS R2 URL");
    }
  }
  for (const [index, asset] of (doc.assets ?? []).entries()) {
    if (!asset.name || assetNames.has(asset.name)) {
      addIssue(issues, "STAGE_ASSET_NAME_INVALID", `assets[${index}].name`, "asset names must be non-empty and unique");
    }
    assetNames.add(asset.name);
    if (!isHttpsUrl(asset.fileName)) {
      addIssue(issues, "STAGE_MEDIA_URL_REQUIRED", `assets[${index}].fileName`, "stage media must use an HTTPS R2 URL");
    }
    for (const [stateIndex, state] of (asset.meta?.states ?? []).entries()) {
      if (!isHttpsUrl(state.fileName)) {
        addIssue(
          issues,
          "STAGE_MEDIA_URL_REQUIRED",
          `assets[${index}].meta.states[${stateIndex}].fileName`,
          "stage media must use an HTTPS R2 URL",
        );
      }
    }
    validateFootprint(asset.meta?.isoFootprint, `assets[${index}].meta.isoFootprint`, issues);
    if (asset.meta?.isoAnchor) {
      try {
        assertNormalizedAnchor(asset.meta.isoAnchor);
      } catch (error) {
        addIssue(
          issues,
          error instanceof IsometricMathError ? error.code : "STAGE_INVALID_ANCHOR",
          `assets[${index}].meta.isoAnchor`,
          error instanceof Error ? error.message : "invalid anchor",
        );
      }
    }
  }

  const layout = doc.layout;
  if (layout) {
    if (!Number.isInteger(layout.width) || layout.width <= 0 || !Number.isInteger(layout.height) || layout.height <= 0) {
      addIssue(issues, "STAGE_LAYOUT_SIZE_INVALID", "layout", "layout width and height must be positive integers");
    } else if (
      layout.width > STAGE_MAP_LIMITS.maxWidth ||
      layout.height > STAGE_MAP_LIMITS.maxHeight ||
      layout.width * layout.height > STAGE_MAP_LIMITS.maxCells
    ) {
      addIssue(
        issues,
        "STAGE_LAYOUT_SIZE_LIMIT_EXCEEDED",
        "layout",
        `layout must be within ${STAGE_MAP_LIMITS.maxWidth}x${STAGE_MAP_LIMITS.maxHeight} and ${STAGE_MAP_LIMITS.maxCells} cells`,
      );
    }
    if (layout.tiles.length > STAGE_MAP_LIMITS.maxTileInstances) {
      addIssue(
        issues,
        "STAGE_TILE_INSTANCE_LIMIT_EXCEEDED",
        "layout.tiles",
        `layout may contain at most ${STAGE_MAP_LIMITS.maxTileInstances} tile instances`,
      );
    }

    const tileIds = new Set<string>();
    for (const [index, tile] of layout.tiles.entries()) {
      const prefix = `layout.tiles[${index}]`;
      if (!tile.id || tileIds.has(tile.id)) {
        addIssue(issues, "STAGE_TILE_ID_INVALID", `${prefix}.id`, "tile ids must be non-empty and unique");
      }
      tileIds.add(tile.id);
      if (!assetNames.has(tile.assetName)) {
        addIssue(issues, "STAGE_TILE_ASSET_MISSING", `${prefix}.assetName`, "tile must reference an existing asset");
      }
      if (!Number.isInteger(tile.x) || !Number.isInteger(tile.y)) {
        addIssue(issues, "STAGE_TILE_COORDINATE_INVALID", prefix, "tile x/y must be finite integers");
      } else if (tile.x < 0 || tile.y < 0 || tile.x >= layout.width || tile.y >= layout.height) {
        addIssue(issues, "STAGE_TILE_OUT_OF_BOUNDS", prefix, "tile x/y must be inside layout bounds");
      }
      validateFootprint(tile.meta?.isoFootprint, `${prefix}.meta.isoFootprint`, issues);
    }
  }

  return { valid: issues.length === 0, issues };
}

export function isStageCoordinateV2RuntimeReady(doc: Partial<IStageDoc> | null | undefined): boolean {
  if (!doc?.layout) return false;
  return validateStageCoordinateV2(doc as IStageDoc).valid;
}

export function resolveStageCoordinateRead(doc: IStageDoc): StageCoordinateReadResult {
  return { doc, validation: validateStageCoordinateV2(doc) };
}

export function prepareStageCoordinateV2Write<T extends Partial<IStageDoc>>(
  payload: T,
): T & Pick<IStageDoc, "coordinateContractVersion" | "projectionConfig"> {
  return {
    ...payload,
    coordinateContractVersion: STAGE_COORDINATE_CONTRACT_VERSION,
    projectionConfig: payload.projectionConfig ?? structuredClone(DEFAULT_STAGE_PROJECTION_CONFIG_V2),
  };
}

export function hasStageCoordinateWrite(payload: Partial<IStageDoc>): boolean {
  return Object.keys(payload).some((key) => COORDINATE_WRITE_FIELDS.has(key));
}

export function validateStageCoordinateWrite(
  payload: Partial<IStageDoc>,
  existing?: IStageDoc | null,
): StageCoordinateContractValidation {
  if (!hasStageCoordinateWrite(payload)) return { valid: true, issues: [] };
  return validateStageCoordinateV2({ ...(existing ?? {}), ...payload } as IStageDoc);
}
