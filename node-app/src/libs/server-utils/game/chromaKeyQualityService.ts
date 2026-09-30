import "server-only";
import sharp from "sharp";

/**
 * @docHint
 * @purpose 스프라이트 시트 알파 품질 분석 서비스 — 바이너리 분석 + 품질 게이트
 * @domain game.asset-pipeline.chroma-key
 * @scope server-only
 *
 * 레거시 analyzeSheetAlphaQuality()를 spriteSheetPostProcess.ts에서 CK-200 분할.
 */

// ---------------------------------------------------------------------------
// 정책 (원본 spriteSheetPostProcess.ts의 SPRITE_ALPHA_QUALITY_POLICY 그대로)
// ---------------------------------------------------------------------------

export const SPRITE_ALPHA_QUALITY_POLICY = {
  borderOpaqueRatioMax: 0.02,
  transparentRatioMin: 0.15,
  semiAlphaRatioMax: 0.08,
  opaqueAlphaMin: 8,
  removeBgTimeoutMs: 180_000,
  fetchTimeoutMs: 30_000,
  maxBytes: 24 * 1024 * 1024,
} as const;

export type SheetAlphaAnalysisType = {
  width: number;
  height: number;
  transparentRatio: number;
  semiAlphaRatio: number;
  borderOpaqueRatio: number;
  transparentBackground: boolean;
  semiAlphaNoise: boolean;
};

// ---------------------------------------------------------------------------
// Legacy: sharp raw 기반 알파 품질 분석
// (원본 spriteSheetPostProcess.ts의 analyzeSheetAlphaQuality를 그대로 이동)
// ---------------------------------------------------------------------------

export async function analyzeSheetAlphaQuality(buffer: Buffer): Promise<SheetAlphaAnalysisType> {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const total = width * height;
  if (!total || channels < 4) {
    const err = new Error("sheet_alpha_decode_failed") as Error & { errorCode: string; status: number };
    err.errorCode = "SHEET_ALPHA_DECODE_FAILED";
    err.status = 422;
    throw err;
  }

  let transparent = 0;
  let semiAlpha = 0;
  let borderOpaque = 0;
  const borderTotal = Math.max(1, 2 * width + 2 * Math.max(0, height - 2));
  const { opaqueAlphaMin } = SPRITE_ALPHA_QUALITY_POLICY;

  for (let y = 0; y < height; y += 1) {
    const isBorderRow = y === 0 || y === height - 1;
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * channels + 3];
      if (alpha === 0) transparent += 1;
      else if (alpha < 255) semiAlpha += 1;

      if ((isBorderRow || x === 0 || x === width - 1) && alpha > opaqueAlphaMin) borderOpaque += 1;
    }
  }

  const transparentRatio = transparent / total;
  const semiAlphaRatio = semiAlpha / total;
  const borderOpaqueRatio = borderOpaque / borderTotal;

  return {
    width,
    height,
    transparentRatio,
    semiAlphaRatio,
    borderOpaqueRatio,
    transparentBackground:
      borderOpaqueRatio <= SPRITE_ALPHA_QUALITY_POLICY.borderOpaqueRatioMax &&
      transparentRatio >= SPRITE_ALPHA_QUALITY_POLICY.transparentRatioMin,
    semiAlphaNoise: semiAlphaRatio > SPRITE_ALPHA_QUALITY_POLICY.semiAlphaRatioMax,
  };
}

