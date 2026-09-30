import "server-only";
import crypto from "crypto";
import sharp from "sharp";
import {
  SPRITE_SHEET_PROFILES,
  SPRITE_SHEET_V2_CONTRACT,
  type SpriteSheetProfileKeyType,
} from "consts/game/gameAssetTemplates";
import type { GameAssetSpriteSheetType } from "types/game/asset";

/**
 * @docHint
 * @purpose 스프라이트 시트 STEP5 합성기 — 방향별 strip 8개를 선택 프로필(4·6·8프레임, rowOrder 8행) WebP로 서버 합성
 * @process strip 치수 검증(fail-closed)  rowOrder 순 composite  WebP 변환  sha256/치수 산출  animations 메타 빌드
 * @domain game.asset-pipeline
 * @scope admin
 */

// 합성 출력 정책 상수 — 런타임 1회 로드 자산이므로 셀 경계 선명도 우선
export const SPRITE_SHEET_COMPOSE_POLICY = {
  format: "webp",
  quality: 90,
  alphaQuality: 100,
} as const;

export type ComposedSheetType = {
  buffer: Buffer;
  width: number;
  height: number;
  bytes: number;
  sha256: string;
  mimeType: string;
};

export async function reflowGridToStrip(
  buffer: Buffer,
  args: { cols: number; rows: number; frameCount: number },
): Promise<Buffer> {
  const meta = await sharp(buffer).metadata();
  const width = Number(meta.width || 0);
  const height = Number(meta.height || 0);
  const cols = Math.max(1, Number(args.cols || 0));
  const rows = Math.max(1, Number(args.rows || 0));
  const frameCount = Math.max(1, Number(args.frameCount || 0));
  if (!width || !height || frameCount > cols * rows || width % cols !== 0 || height % rows !== 0) {
    throw codedError("direction_grid_dimension_invalid", "DIRECTION_GRID_DIMENSION_INVALID", 422);
  }

  const sourceCellWidth = width / cols;
  const sourceCellHeight = height / rows;
  const targetCellWidth = SPRITE_SHEET_V2_CONTRACT.cellWidth;
  const targetCellHeight = SPRITE_SHEET_V2_CONTRACT.cellHeight;
  const composites: Array<{ input: Buffer; left: number; top: number }> = [];

  for (let frame = 0; frame < frameCount; frame += 1) {
    const row = Math.floor(frame / cols);
    const column = frame % cols;
    const cell = await sharp(buffer)
      .extract({
        left: column * sourceCellWidth,
        top: row * sourceCellHeight,
        width: sourceCellWidth,
        height: sourceCellHeight,
      })
      .resize(targetCellWidth, targetCellHeight, { fit: "fill" })
      .png()
      .toBuffer();
    composites.push({ input: cell, left: frame * targetCellWidth, top: 0 });
  }

  return sharp({
    create: {
      width: targetCellWidth * frameCount,
      height: targetCellHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .png()
    .toBuffer();
}

export async function reflowSheet4GridToRuntimeRows(
  buffer: Buffer,
  profileKey: SpriteSheetProfileKeyType = "v2",
): Promise<Buffer> {
  const profile = SPRITE_SHEET_PROFILES[profileKey];
  const sourceGrid = profile.sheet4Generation;
  const metadata = await sharp(buffer).metadata();
  const width = Number(metadata.width || 0);
  const height = Number(metadata.height || 0);
  if (!width || !height || width % sourceGrid.columns !== 0 || height % sourceGrid.rows !== 0) {
    throw codedError("sheet4_grid_dimension_invalid", "SHEET4_GRID_DIMENSION_INVALID", 422);
  }

  const sourceCellWidth = width / sourceGrid.columns;
  const sourceCellHeight = height / sourceGrid.rows;
  const composites: Array<{ input: Buffer; left: number; top: number }> = [];
  for (let directionIndex = 0; directionIndex < 4; directionIndex += 1) {
    for (let frameIndex = 0; frameIndex < profile.frameCount; frameIndex += 1) {
      const sourceColumn = sourceGrid.directionAxis === "columns" ? directionIndex : frameIndex;
      const sourceRow = sourceGrid.directionAxis === "columns" ? frameIndex : directionIndex;
      const cell = await sharp(buffer)
        .extract({
          left: sourceColumn * sourceCellWidth,
          top: sourceRow * sourceCellHeight,
          width: sourceCellWidth,
          height: sourceCellHeight,
        })
        .resize(profile.cellWidth, profile.cellHeight, { fit: "fill" })
        .png()
        .toBuffer();
      composites.push({
        input: cell,
        left: frameIndex * profile.cellWidth,
        top: directionIndex * profile.cellHeight,
      });
    }
  }

  return sharp({
    create: {
      width: profile.sheetWidth,
      height: profile.cellHeight * 4,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .png()
    .toBuffer();
}

export async function mirrorSpriteDirectionStrip(
  buffer: Buffer,
  frameCount: number = SPRITE_SHEET_V2_CONTRACT.columns,
) {
  const meta = await sharp(buffer).metadata();
  const width = Number(meta.width || 0);
  const height = Number(meta.height || 0);
  const columns = Math.max(1, Number(frameCount || 0));
  if (!width || !height || width % columns !== 0) {
    throw codedError("direction_strip_dimension_invalid", "DIRECTION_STRIP_DIMENSION_INVALID", 422);
  }
  const cellWidth = width / columns;
  const composites: Array<{ input: Buffer; left: number; top: number }> = [];
  for (let frame = 0; frame < columns; frame += 1) {
    const mirroredCell = await sharp(buffer)
      .extract({ left: frame * cellWidth, top: 0, width: cellWidth, height })
      .flop()
      .png()
      .toBuffer();
    composites.push({ input: mirroredCell, left: frame * cellWidth, top: 0 });
  }
  return sharp({
    create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(composites)
    .png()
    .toBuffer();
}

function codedError(message: string, errorCode: string, status = 422) {
  const err = new Error(message) as Error & { errorCode: string; status: number };
  err.errorCode = errorCode;
  err.status = status;
  return err;
}

// strip 8개(방향 키)를 D1 rowOrder 순서로 선택 프로필 시트에 합성
export async function composeSpriteSheet(
  strips: Record<string, Buffer>,
  profileKey: SpriteSheetProfileKeyType = "v2",
): Promise<ComposedSheetType> {
  const profile = SPRITE_SHEET_PROFILES[profileKey];
  const { sheetWidth, sheetHeight, cellHeight } = profile;
  const { rowOrder } = SPRITE_SHEET_V2_CONTRACT;

  const composites: Array<{ input: Buffer; left: number; top: number }> = [];
  for (let row = 0; row < rowOrder.length; row += 1) {
    const direction = rowOrder[row];
    const strip = strips[direction];
    if (!strip) throw codedError(`sheet_strip_missing:${direction}`, "SHEET_STRIP_MISSING", 409);

    const meta = await sharp(strip).metadata();
    if (Number(meta.width || 0) !== sheetWidth || Number(meta.height || 0) !== cellHeight) {
      throw codedError(
        `sheet_strip_dimension_mismatch:${direction}:${meta.width}x${meta.height}`,
        "SHEET_STRIP_DIMENSION_MISMATCH",
        422,
      );
    }

    composites.push({ input: strip, left: 0, top: row * cellHeight });
  }

  const buffer = await sharp({
    create: {
      width: sheetWidth,
      height: sheetHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .webp({ quality: SPRITE_SHEET_COMPOSE_POLICY.quality, alphaQuality: SPRITE_SHEET_COMPOSE_POLICY.alphaQuality })
    .toBuffer();

  return {
    buffer,
    width: sheetWidth,
    height: sheetHeight,
    bytes: buffer.length,
    sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
    mimeType: "image/webp",
  };
}

export async function composeSpriteSheetV2(strips: Record<string, Buffer>): Promise<ComposedSheetType> {
  return composeSpriteSheet(strips, "v2");
}

// D1 rowOrder 기반 8행 animations 메타 — 발행 시 createSpriteFromAsset이 그대로 사용 (런타임 행 매핑의 권위)
export function buildSpriteSheetAnimations(
  profileKey: SpriteSheetProfileKeyType = "v2",
): NonNullable<GameAssetSpriteSheetType["animations"]> {
  const frames = Array.from({ length: SPRITE_SHEET_PROFILES[profileKey].frameCount }, (_, index) => index);
  const animations: NonNullable<GameAssetSpriteSheetType["animations"]> = {};
  SPRITE_SHEET_V2_CONTRACT.rowOrder.forEach((direction, row) => {
    animations[direction] = { row, frames: [...frames] };
  });
  return animations;
}

export function buildSpriteSheetMeta(profileKey: SpriteSheetProfileKeyType = "v2"): GameAssetSpriteSheetType {
  const profile = SPRITE_SHEET_PROFILES[profileKey];
  return {
    frameWidth: profile.cellWidth,
    frameHeight: profile.cellHeight,
    columns: profile.frameCount,
    rows: SPRITE_SHEET_V2_CONTRACT.rows,
    fps: 8,
    animations: buildSpriteSheetAnimations(profileKey),
  };
}

export function buildSpriteSheetV2Animations(): NonNullable<GameAssetSpriteSheetType["animations"]> {
  return buildSpriteSheetAnimations("v2");
}

export function buildSpriteSheetV2Meta(): GameAssetSpriteSheetType {
  return buildSpriteSheetMeta("v2");
}
