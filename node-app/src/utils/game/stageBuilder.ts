import type {
  IStageDoc,
  IStageLayout,
  IStageLayoutTile,
  IStageAsset,
  IIsometricConfig,
  IStageRuntime,
  StageProjectionType,
  IStageData,
  IBlockImage,
  ObstacleType,
  IIsometricFootprint,
  StageBoundaryRoleType,
  IsoLayerType,
} from "types/game";
import { resolveStageAssetPath } from "./gameImageUtils";
import { createIsometricRenderPlacement, resolveIsometricLayer } from "./isometricRender";
import { isStageCoordinateV2RuntimeReady, STAGE_MAP_LIMITS } from "./stageCoordinateContract";

/**
 * @docHint
 * @purpose stageBuilder 유틸 기능 제공
 * @process 입력 정규화  변환  보조 처리 제공
 * @domain game-stage
 * @scope game-runtime
 */

// StageDoc v2 projectionConfig → 런타임 ISO 설정
export function resolveIsoConfigForStageDoc(doc: IStageDoc): IIsometricConfig {
  const projectionConfig = doc.projectionConfig;
  return {
    projection: projectionConfig.projection,
    tileWidth: projectionConfig.tileWidth,
    tileHeight: projectionConfig.tileHeight,
    originX: projectionConfig.origin.screenX,
    originY: projectionConfig.origin.screenY,
  };
}

// BlockImage 빌더
interface BuildBlockImagesResult {
  blockImages: IBlockImage[];
}

export function buildBlockImagesForStageDoc(doc: IStageDoc): BuildBlockImagesResult {
  const assets: IStageAsset[] = doc.assets || [];

  const blockImages: IBlockImage[] = assets.map((asset) => {
    const meta = asset.meta || {};
    return {
      name: asset.name,
      fileName: asset.fileName,
      path: resolveStageAssetPath(doc, asset.fileName),
      size: {
        width: asset.size.width,
        height: asset.size.height,
      },
      isoFootprint: meta.isoFootprint,
      isoHeightPx: meta.isoHeightPx,
      isoLayer: meta.isoLayer,
      anchor: meta.isoAnchor
        ? { x: meta.isoAnchor.x, y: meta.isoAnchor.y }
        : {
            x: 0.5,
            y: 1.0,
          },
      role: asset.roles,
      meta: meta,
    };
  });

  return { blockImages };
}

// StageDoc.layout → IStageData 변환
export interface BuildStageDataResult {
  data: IStageData;
  blockImages: IBlockImage[];
}

// StageDoc.layout 기반으로 런타임용 IStageData + IBlockImage 생성
// - obstacles.x / y 는 논리 world 좌표 / 화면 투영은 isoRender로 분리
export function buildStageDataFromDoc(doc: IStageDoc): BuildStageDataResult {
  const layout = doc.layout;
  if (!layout) {
    return {
      data: {
        obstacles: [],
        isoMeta: undefined,
      },
      blockImages: [],
    };
  }

  const isoConfig = resolveIsoConfigForStageDoc(doc);
  const { blockImages } = buildBlockImagesForStageDoc(doc);

  if (!isStageCoordinateV2RuntimeReady(doc)) {
    throw new Error("stage_coordinate_contract_v2_required");
  }
  const logicalUnitsPerTile = doc.projectionConfig.logicalUnitsPerTile;

  const findBlockImageIndex = (assetName: string): number => {
    return blockImages.findIndex((b) => b.name === assetName);
  };

  const obstacles: ObstacleType[] = layout.tiles.map((tile) => {
    const gridX = tile.x;
    const gridY = tile.y;

    const textureIndex = findBlockImageIndex(tile.assetName);
    const bi = textureIndex >= 0 ? blockImages[textureIndex] : undefined;

    const assetFootprint = bi?.isoFootprint;
    const tileFootprint = tile.meta?.isoFootprint;
    const fp = tileFootprint || assetFootprint;
    const inferredFootprint: IIsometricFootprint | undefined =
      fp ??
      (bi
        ? {
            width: bi.size.width,
            height: bi.size.height,
            offsetX: 0,
            offsetY: 0,
          }
        : undefined);

    const widthTiles = fp?.width ?? bi?.size.width ?? 1;
    const heightTiles = fp?.height ?? bi?.size.height ?? 1;

    const offsetX = fp?.offsetX ?? 0;
    const offsetY = fp?.offsetY ?? 0;

    const runtimeX = (gridX + offsetX) * logicalUnitsPerTile;
    const runtimeY = (gridY + offsetY) * logicalUnitsPerTile;
    const runtimeWidth = widthTiles * logicalUnitsPerTile;
    const runtimeHeight = heightTiles * logicalUnitsPerTile;

    const meta = {
      ...(tile.meta || {}),
      _gridX: gridX,
      _gridY: gridY,
    };
    const anchor = bi?.anchor ?? { x: 0.5, y: 1 };
    const explicitLayer = tile.meta?.isoLayer ?? bi?.isoLayer;
    const layer = resolveIsometricLayer(explicitLayer as IsoLayerType | undefined, bi?.role);
    const projection = {
      tileWidth: isoConfig.tileWidth,
      tileHeight: isoConfig.tileHeight,
      origin: {
        screenX: isoConfig.originX ?? 0,
        screenY: isoConfig.originY ?? 0,
      },
    };
    const isoRender = createIsometricRenderPlacement({
      stableId: tile.id,
      gridPoint: { gridX, gridY },
      footprint: inferredFootprint ?? { width: 1, height: 1 },
      projection,
      anchor,
      layer,
      elevationPx: tile.meta?.isoZOffsetPx ?? 0,
      visualHeightPx: tile.meta?.isoHeightPx ?? bi?.isoHeightPx ?? 0,
    });

    const obstacle: ObstacleType = {
      id: tile.id,
      assetName: tile.assetName,
      x: runtimeX,
      y: runtimeY,
      rotation: tile.rotation,
      scale: tile.scale,
      state: tile.state,
      meta,
      textureIndex,
      isoFootprint: inferredFootprint,
      isoRender,
      width: runtimeWidth,
      height: runtimeHeight,
      productData: undefined,
    };

    return obstacle;
  });

  const data: IStageData = {
    obstacles,
    isoMeta: {
      coordinateContractVersion: 2,
      logicalUnitsPerTile,
      gridWidth: layout.width,
      gridHeight: layout.height,
      worldWidth: layout.width * logicalUnitsPerTile,
      worldHeight: layout.height * logicalUnitsPerTile,
      config: isoConfig,
    },
  };

  return { data, blockImages };
}

export interface IStageLogicalWorldSize {
  worldWidth: number;
  worldHeight: number;
  gridWidth: number;
  gridHeight: number;
  logicalUnitsPerTile: number;
}

export function resolveStageLogicalWorldSize(
  doc: Pick<IStageDoc, "layout" | "projectionConfig"> | null | undefined,
): IStageLogicalWorldSize | null {
  if (!doc) return null;
  const layout = doc.layout;
  if (!layout) return null;

  const gridWidth = Number(layout.width);
  const gridHeight = Number(layout.height);
  if (!Number.isFinite(gridWidth) || !Number.isFinite(gridHeight) || gridWidth <= 0 || gridHeight <= 0) return null;

  const logicalUnitsPerTile = Number(doc.projectionConfig.logicalUnitsPerTile);
  if (!Number.isFinite(logicalUnitsPerTile) || logicalUnitsPerTile <= 0) return null;

  return {
    worldWidth: gridWidth * logicalUnitsPerTile,
    worldHeight: gridHeight * logicalUnitsPerTile,
    gridWidth,
    gridHeight,
    logicalUnitsPerTile,
  };
}

// StageDoc layout 전체를 단일 v2 런타임 데이터로 변환한다.
// **비정형 경계 role (P1-5, D3 / 계약 v2 §4)**

// 경계 role 정본 — StageBoundaryRoleType(types/game/stage-doc.ts)과 1:1
export const STAGE_BOUNDARY_ROLES: readonly StageBoundaryRoleType[] = [
  "boundary",
  "boundary-cliff",
  "boundary-water",
  "boundary-fence",
];

const STAGE_BOUNDARY_ROLE_SET = new Set<string>(STAGE_BOUNDARY_ROLES);

// P0-3에서 예약한 StageBoundaryRoleType을 런타임 role 문자열에 연결하는 type guard
export function isStageBoundaryRole(role: string): role is StageBoundaryRoleType {
  return STAGE_BOUNDARY_ROLE_SET.has(role);
}

export function hasStageBoundaryRole(roles?: string[] | null): boolean {
  return Array.isArray(roles) && roles.some(isStageBoundaryRole);
}

// 이동 차단(충돌 그리드 등록) 판정 단일 정본 (P1-5)
// - 경계 role은 항상 차단 (fail-closed — "pass"와 동시 지정된 데이터 오류에도 경계 우선)
// - "pass"는 통과, 그 외(기본 obstacle)는 차단
export function shouldBlockMovementByRoles(roles?: string[] | null): boolean {
  if (hasStageBoundaryRole(roles)) return true;
  if (Array.isArray(roles) && roles.includes("pass")) return false;
  return true;
}

// Auto Layout (랜덤 배치)
export interface AutoLayoutOptions {
  width?: number;
  height?: number;
  density?: number; // 0~1, 기본 0.3
  assetFilter?: (asset: IStageAsset) => boolean;
  preserveExistingTiles?: boolean; // true면 기존 타일 유지 + 빈 셀만 채움
}

// Auto Layout을 생성하여 StageDoc.layout 을 갱신하는 유틸
// - 맵 에디터에서 Auto Layout 버튼 눌렀을 때만 사용 (StageMap Editor 전용)
export function buildAutoLayoutForStageDoc(doc: IStageDoc, options: AutoLayoutOptions = {}): { layout: IStageLayout } {
  const prevLayout = doc.layout;

  const width = options.width ?? prevLayout?.width ?? 16;
  const height = options.height ?? prevLayout?.height ?? 16;
  const density = Math.max(0, Math.min(1, options.density ?? 0.3));

  const assets: IStageAsset[] = (doc.assets || []).filter((a) => (options.assetFilter ? options.assetFilter(a) : true));

  if (assets.length === 0) {
    // 에셋이 없으면 빈 레이아웃만 반환
    const empty: IStageLayout = {
      mode: prevLayout?.mode ?? "auto",
      width,
      height,
      tiles: prevLayout?.tiles || [],
    };
    return { layout: empty };
  }

  // 기존 타일 유지 여부
  const baseTiles: IStageLayoutTile[] =
    options.preserveExistingTiles && prevLayout?.tiles?.length ? [...prevLayout.tiles] : [];

  const usedKeys = new Set<string>();
  baseTiles.forEach((t) => usedKeys.add(`${t.x}:${t.y}`));

  const tiles: IStageLayoutTile[] = [...baseTiles];

  const randomId = (x: number, y: number) =>
    `tile_${x}_${y}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  layoutRows: for (let gy = 0; gy < height; gy += 1) {
    for (let gx = 0; gx < width; gx += 1) {
      if (tiles.length >= STAGE_MAP_LIMITS.maxTileInstances) break layoutRows;
      const key = `${gx}:${gy}`;

      if (usedKeys.has(key)) continue; // preserveExistingTiles=true 인 경우 기존 타일 유지

      if (Math.random() > density) continue;

      const asset = assets[Math.floor(Math.random() * assets.length)];
      if (!asset) continue;

      const tile: IStageLayoutTile = {
        id: randomId(gx, gy),
        assetName: asset.name,
        x: gx,
        y: gy,
        rotation: 0,
        scale: 1,
        state: "normal",
        meta: {},
      };

      tiles.push(tile);
    }
  }

  const layout: IStageLayout = {
    mode: prevLayout?.mode ?? "auto",
    width,
    height,
    tiles,
  };

  return { layout };
}

// Build Stage Runtime Data
export function buildStageRuntimeFromDoc(doc: IStageDoc): IStageRuntime {
  const isoConfigFromDoc = resolveIsoConfigForStageDoc(doc);

  const { data, blockImages } = buildStageDataFromDoc(doc);

  const projection: StageProjectionType = "isometric-2to1";

  return {
    doc,
    data,
    assets: doc.assets ?? [],
    blockImages,
    projection,
    isoConfig: isoConfigFromDoc,
  };
}
