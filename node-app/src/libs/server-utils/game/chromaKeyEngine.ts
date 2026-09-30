import "server-only";
import sharp from "sharp";
import { processChromaKeyWithSharp } from "libs/server-utils/game/chromaKeySharpAdapter";
import type { SharpAdapterOutputType } from "libs/server-utils/game/chromaKeySharpAdapter";
import type { ChromaKeyOptionsType, ChromaKeyQualityType } from "types/game/chroma-key";
import type { QualityEvaluationType } from "utils/game/chromaKeyQuality";

/**
 * @docHint
 * @purpose ChromaKey v2 + legacy 엔진 서비스 — PNG 버퍼 기반 크로마키 처리 통합 진입점
 * @domain game.asset-pipeline.chroma-key
 * @scope server-only
 *
 * 레거시 removeSolidBackgroundByChromaKey()와 v2 applyV2ChromaKey()를
 * 단일 서비스 파일에서 제공한다. spriteSheetPostProcess.ts에서 CK-200 분할됨.
 */

// ---------------------------------------------------------------------------
// 정책 (원본 spriteSheetPostProcess.ts의 SPRITE_CHROMA_KEY_POLICY 그대로)
// ---------------------------------------------------------------------------

export const SPRITE_CHROMA_KEY_POLICY = {
  borderDominantRatioMin: 0.85,
  borderRingPx: 2,
  keyDistanceFull: 70,
  keyDistanceFeather: 110,
  quantStep: 32,
} as const;

// ---------------------------------------------------------------------------
// Legacy: RGB 거리 기반 단색 배경 크로마키
// (원본 spriteSheetPostProcess.ts의 removeSolidBackgroundByChromaKey를 그대로 이동)
// ---------------------------------------------------------------------------

export async function removeSolidBackgroundByChromaKey(
  buffer: Buffer,
): Promise<{ buffer: Buffer; keyed: boolean; keyColor?: { r: number; g: number; b: number } }> {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  if (channels < 4) return { buffer, keyed: false };

  const { borderRingPx, borderDominantRatioMin, keyDistanceFull, keyDistanceFeather, quantStep } =
    SPRITE_CHROMA_KEY_POLICY;

  // 1) 최외곽 링에서 지배 색상 추출 (quantized histogram)
  const histogram = new Map<string, { count: number; r: number; g: number; b: number }>();
  let borderCount = 0;
  for (let y = 0; y < height; y += 1) {
    const isBorderRow = y < borderRingPx || y >= height - borderRingPx;
    for (let x = 0; x < width; x += 1) {
      if (!isBorderRow && x >= borderRingPx && x < width - borderRingPx) continue;
      const idx = (y * width + x) * channels;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const key = `${Math.floor(r / quantStep)}:${Math.floor(g / quantStep)}:${Math.floor(b / quantStep)}`;
      const bin = histogram.get(key) || { count: 0, r: 0, g: 0, b: 0 };
      bin.count += 1;
      bin.r += r;
      bin.g += g;
      bin.b += b;
      histogram.set(key, bin);
      borderCount += 1;
    }
  }

  let dominant: { count: number; r: number; g: number; b: number } | null = null;
  for (const bin of histogram.values()) {
    if (!dominant || bin.count > dominant.count) dominant = bin;
  }
  if (!dominant || borderCount === 0 || dominant.count / borderCount < borderDominantRatioMin) {
    return { buffer, keyed: false };
  }

  const keyColor = {
    r: Math.round(dominant.r / dominant.count),
    g: Math.round(dominant.g / dominant.count),
    b: Math.round(dominant.b / dominant.count),
  };

  // 2) 거리 기반 알파 키잉 (full 이하 완전 투명, feather 구간 선형)
  const out = Buffer.from(data);
  for (let i = 0; i < width * height; i += 1) {
    const idx = i * channels;
    const dr = out[idx] - keyColor.r;
    const dg = out[idx + 1] - keyColor.g;
    const db = out[idx + 2] - keyColor.b;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    if (dist <= keyDistanceFull) {
      out[idx + 3] = 0;
    } else if (dist < keyDistanceFeather) {
      const ratio = (dist - keyDistanceFull) / (keyDistanceFeather - keyDistanceFull);
      out[idx + 3] = Math.min(out[idx + 3], Math.round(ratio * 255));
    }
  }

  const keyedBuffer = await sharp(out, { raw: { width, height, channels: channels as 4 } })
    .png()
    .toBuffer();
  return { buffer: keyedBuffer, keyed: true, keyColor };
}

// ---------------------------------------------------------------------------
// v2: YCbCr 소프트 알파 크로마키 (CK-105 Sharp adapter 경유) — CK-201 추가
// ---------------------------------------------------------------------------

export type V2ChromaKeyInputType = {
  pngBuffer: Buffer;
  options: Partial<ChromaKeyOptionsType> & {
    keyMode: ChromaKeyOptionsType["keyMode"];
    profile: ChromaKeyOptionsType["profile"];
  };
};

export type V2ChromaKeyOutputType = SharpAdapterOutputType & {
  quality: ChromaKeyQualityType;
  evaluation: QualityEvaluationType;
};

/**
 * v2 YCbCr 소프트 알파 크로마키 파이프라인 실행.
 *
 * Sharp adapter → detectKeyColor → YCbCr kernel → refine → quality analysis 순서.
 * engine mode에 따라 legacy/shadow/canary/enabled에서 호출된다.
 */
export async function applyV2ChromaKey(input: V2ChromaKeyInputType): Promise<V2ChromaKeyOutputType> {
  const result = await processChromaKeyWithSharp({
    pngBuffer: input.pngBuffer,
    options: input.options,
  });

  return {
    ...result,
    quality: result.pipeline.quality,
    evaluation: result.pipeline.evaluation,
  };
}

