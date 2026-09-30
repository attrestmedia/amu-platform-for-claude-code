import "server-only";
import crypto from "crypto";
import sharp from "sharp";
import type { SpritePipelineDirectionVerifyType } from "types/game/asset-pipeline";
import { resolveSmartCutPaths, saveBase64Image } from "libs/server-utils/file/fileStorage";
import { toUnknownRecord, type UnknownRecord } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose 스프라이트 시트 STEP4 슬라이스 검증기 — 셀 균일/빈 셀/잘림/높이 편차 검사 + 방향(row)별 판정 + strip 보존
 * @process raw 디코딩  셀 그리드 분석  행=방향 단위 실패 집계  통과 방향 strip(1024x256) png 슬라이스 저장
 * @domain game.asset-pipeline
 * @scope admin
 */

// 슬라이스 검증 정책 상수 (에셋 계약 v2 §2 STEP4 / P2 통합 설계 §3.4) — 하드코딩 방지용 단일 정의
// 임계값은 2026-07-17 e2e 실물 시트로 캘리브레이션:
// - cropped 0.5%→5%: 실물에서 머리/발끝의 경계 스침이 행당 ~4%로 정상 발생(시각 결함 없음) — 5%는 반신 절단급 접촉만 검출
// - heightVariance 12%→25%: 걸음 포즈의 bbox 높이 자연 변동(~19% 실측)을 오탐하지 않되 스케일 붕괴는 검출
// - 경계 접촉은 feather 반투명을 무시하고 실질 불투명(a>64)만 계수
export const SPRITE_SLICE_VERIFY_POLICY = {
  // 셀 내 불투명(a > opaqueAlphaMin) 픽셀 비율이 이 값 미만이면 빈 셀
  emptyCellOpaqueRatioMin: 0.02,
  // 셀 경계 1px 라인의 실질 불투명 픽셀/둘레 비율이 이 값 초과면 잘림(인접 침범/컷오프)
  croppedBorderRatioMax: 0.05,
  // 행 내 셀 bounding box 높이 (max-min)/cellHeight 초과 시 행 실패
  heightVarianceRatioMax: 0.25,
  opaqueAlphaMin: 8,
  borderOpaqueAlphaMin: 64,
} as const;

export type SheetCellMetricsType = {
  column: number;
  row: number;
  opaqueRatio: number;
  borderContactRatio: number;
  bboxHeightPx: number;
  empty: boolean;
  cropped: boolean;
};

export type SheetDirectionVerifyResultType = {
  direction: string;
  row: number;
  passed: boolean;
  verify: SpritePipelineDirectionVerifyType;
  cells: SheetCellMetricsType[];
};

export type SheetVerifyResultType = {
  width: number;
  height: number;
  cellWidth: number;
  cellHeight: number;
  directions: SheetDirectionVerifyResultType[];
  allPassed: boolean;
};

function codedError(message: string, errorCode: string, status = 422) {
  const err = new Error(message) as Error & { errorCode: string; status: number };
  err.errorCode = errorCode;
  err.status = status;
  return err;
}

// 셀 그리드 분석 — raw RGBA 픽셀에서 셀별 지표 산출 (순수 연산)
export function analyzeCellGrid(args: {
  data: Buffer | Uint8Array;
  width: number;
  height: number;
  channels: number;
  columns: number;
  rows: number;
}): SheetCellMetricsType[][] {
  const { data, width, height, channels, columns, rows } = args;
  const cellWidth = Math.floor(width / columns);
  const cellHeight = Math.floor(height / rows);
  if (cellWidth <= 0 || cellHeight <= 0) throw codedError("sheet_grid_invalid", "SHEET_GRID_INVALID", 422);

  const { opaqueAlphaMin, borderOpaqueAlphaMin, emptyCellOpaqueRatioMin, croppedBorderRatioMax } =
    SPRITE_SLICE_VERIFY_POLICY;
  const grid: SheetCellMetricsType[][] = [];

  for (let row = 0; row < rows; row += 1) {
    const rowCells: SheetCellMetricsType[] = [];
    for (let column = 0; column < columns; column += 1) {
      const startX = column * cellWidth;
      const startY = row * cellHeight;
      let opaque = 0;
      let borderContact = 0;
      let minY = -1;
      let maxY = -1;

      for (let y = 0; y < cellHeight; y += 1) {
        const isBorderRow = y === 0 || y === cellHeight - 1;
        for (let x = 0; x < cellWidth; x += 1) {
          const alpha = data[((startY + y) * width + (startX + x)) * channels + 3];
          if (alpha > opaqueAlphaMin) {
            opaque += 1;
            if (minY < 0) minY = y;
            maxY = y;
            // 경계 접촉은 feather 반투명을 제외한 실질 불투명만 계수 (크로마 키 페더 오탐 방지)
            if (alpha > borderOpaqueAlphaMin && (isBorderRow || x === 0 || x === cellWidth - 1)) borderContact += 1;
          }
        }
      }

      const cellTotal = cellWidth * cellHeight;
      const borderTotal = Math.max(1, 2 * cellWidth + 2 * Math.max(0, cellHeight - 2));
      const opaqueRatio = opaque / cellTotal;
      const borderContactRatio = borderContact / borderTotal;
      const empty = opaqueRatio < emptyCellOpaqueRatioMin;

      rowCells.push({
        column,
        row,
        opaqueRatio,
        borderContactRatio,
        bboxHeightPx: minY >= 0 ? maxY - minY + 1 : 0,
        empty,
        cropped: !empty && borderContactRatio > croppedBorderRatioMax,
      });
    }
    grid.push(rowCells);
  }

  return grid;
}

// 시트 1장 검증 — 행 순서(directions 배열)와 그리드를 받아 방향별 판정 산출
export async function verifySheetSlices(args: {
  buffer: Buffer;
  columns: number;
  rows: number;
  directions: readonly string[];
  directionAxis?: "rows" | "columns";
}): Promise<SheetVerifyResultType> {
  const { buffer, columns, rows, directions, directionAxis = "rows" } = args;
  const directionCount = directionAxis === "columns" ? columns : rows;
  if (directions.length !== directionCount) {
    throw codedError("sheet_direction_count_mismatch", "SHEET_DIRECTION_COUNT_MISMATCH", 422);
  }

  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.channels < 4) throw codedError("sheet_alpha_decode_failed", "SHEET_ALPHA_DECODE_FAILED", 422);

  const grid = analyzeCellGrid({
    data,
    width: info.width,
    height: info.height,
    channels: info.channels,
    columns,
    rows,
  });

  const cellHeight = Math.floor(info.height / rows);
  const directionCells =
    directionAxis === "columns"
      ? Array.from({ length: columns }, (_, column) => grid.map((rowCells) => rowCells[column]))
      : grid;
  const crossDirectionHeights =
    directionAxis === "columns"
      ? directionCells.flatMap((cells) => cells.filter((cell) => !cell.empty).map((cell) => cell.bboxHeightPx))
      : [];
  const crossDirectionHeightVariancePx =
    crossDirectionHeights.length > 1
      ? Math.max(...crossDirectionHeights) - Math.min(...crossDirectionHeights)
      : 0;
  const crossDirectionHeightVarianceFailed =
    directionAxis === "columns" &&
    crossDirectionHeightVariancePx / cellHeight > SPRITE_SLICE_VERIFY_POLICY.heightVarianceRatioMax;
  const results: SheetDirectionVerifyResultType[] = directionCells.map((cells, directionIndex) => {
    const emptyCells = cells.filter((cell) => cell.empty).length;
    const croppedCells = cells.filter((cell) => cell.cropped).length;
    const bboxHeights = cells.filter((cell) => !cell.empty).map((cell) => cell.bboxHeightPx);
    const heightVariancePx = bboxHeights.length > 1 ? Math.max(...bboxHeights) - Math.min(...bboxHeights) : 0;
    const heightVarianceFailed = heightVariancePx / cellHeight > SPRITE_SLICE_VERIFY_POLICY.heightVarianceRatioMax;

    return {
      direction: directions[directionIndex],
      row: directionAxis === "rows" ? directionIndex : 0,
      passed:
        emptyCells === 0 &&
        croppedCells === 0 &&
        !heightVarianceFailed &&
        !crossDirectionHeightVarianceFailed,
      verify: {
        emptyCells,
        croppedCells,
        heightVariancePx: Math.max(heightVariancePx, crossDirectionHeightVariancePx),
        alphaCoverage: cells.reduce((sum, cell) => sum + cell.opaqueRatio, 0) / Math.max(1, cells.length),
      },
      cells,
    };
  });

  return {
    width: info.width,
    height: info.height,
    cellWidth: Math.floor(info.width / columns),
    cellHeight,
    directions: results,
    allPassed: results.every((item) => item.passed),
  };
}

// 방향 strip(가로 전체 x 1행) 슬라이스 — png 무손실 보존 (D2b 중간 산출물 레이어)
export async function sliceDirectionStrip(args: { buffer: Buffer; row: number; rows: number }): Promise<Buffer> {
  const meta = await sharp(args.buffer).metadata();
  const width = Number(meta.width || 0);
  const height = Number(meta.height || 0);
  const stripHeight = Math.floor(height / args.rows);
  if (!width || !stripHeight) throw codedError("sheet_strip_slice_invalid", "SHEET_STRIP_SLICE_INVALID", 422);

  return await sharp(args.buffer)
    .extract({ left: 0, top: args.row * stripHeight, width, height: stripHeight })
    .png()
    .toBuffer();
}

export async function saveDirectionStrip(args: {
  uid: string;
  direction: string;
  stripBuffer: Buffer;
}): Promise<{ url: string; storage?: UnknownRecord; sha256: string }> {
  const paths = resolveSmartCutPaths({ scope: "user", uid: args.uid });
  const saved = await saveBase64Image({
    base64: args.stripBuffer.toString("base64"),
    dir: paths.dir,
    storagePrefix: paths.storagePrefix,
    visibility: "private",
    mimeType: "image/png",
    outputFormat: "png",
    modelName: `sprite-strip-${args.direction}`,
  });
  const savedRec = toUnknownRecord(saved);
  const storage = toUnknownRecord(savedRec.storage);

  return {
    url: String(savedRec.url || storage.url || ""),
    storage: savedRec.storage ? (storage as UnknownRecord) : undefined,
    sha256: crypto.createHash("sha256").update(args.stripBuffer).digest("hex"),
  };
}
