/**
 * ChromaKey v2 — Sharp 서버 adapter (CK-105)
 *
 * Sharp(0.34.5)로 PNG ↔ raw RGBA 변환 후, 환경 중립 파이프라인에 위임한다.
 * Node.js 서버 전용 — 브라우저/Worker에서는 사용하지 않는다.
 *
 * @domain game.asset-pipeline.chroma-key
 * @scope server-only
 */

import sharp from "sharp";
import { normalizeChromaKeyOptions } from "utils/game/chromaKeyOptions";
import { runChromaKeyPipeline } from "utils/game/chromaKeyPipeline";
import type { ChromaKeyPipelineResultType } from "utils/game/chromaKeyPipeline";
import type { ChromaKeyOptionsType } from "types/game/chroma-key";

// ---------------------------------------------------------------------------
// PNG Buffer → RGBA raw → pipeline → PNG Buffer
// ---------------------------------------------------------------------------

export type SharpAdapterInputType = {
  /** PNG Buffer */
  pngBuffer: Buffer;
  /** 크로마키 옵션 (부분 허용, normalize로 기본값 채움) */
  options: Partial<ChromaKeyOptionsType> & { keyMode: ChromaKeyOptionsType["keyMode"]; profile: ChromaKeyOptionsType["profile"] };
};

export type SharpAdapterOutputType = {
  /** 처리된 PNG Buffer */
  pngBuffer: Buffer;
  /** 파이프라인 전체 결과 */
  pipeline: ChromaKeyPipelineResultType;
  /** 원본 메타 */
  source: { width: number; height: number; channels: number };
};

export async function processChromaKeyWithSharp(input: SharpAdapterInputType): Promise<SharpAdapterOutputType> {
  const normalized = normalizeChromaKeyOptions(input.options);

  // 1) Sharp로 PNG → raw RGBA
  const { data, info } = await sharp(input.pngBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;

  // 2) 환경 중립 파이프라인 실행 (in-place)
  const pipeline = runChromaKeyPipeline({
    data: new Uint8Array(data),
    width, height, channels,
    options: normalized,
  });

  // 3) Sharp로 RGBA → PNG
  const pngBuffer = await sharp(pipeline.data, {
    raw: { width, height, channels: channels as 4 },
  }).png().toBuffer();

  return { pngBuffer, pipeline, source: { width, height, channels } };
}
