/**
 * ChromaKey v2 — Web Worker (CK-400)
 *
 * 메인 스레드에서 대형 RGBA 순회를 분리해 slider·canvas 입력이 끊기지 않게 한다.
 * Transferable ArrayBuffer로 zero-copy 입출력, requestId로 stale 응답을 폐기한다.
 *
 * Worker는 postMessage로 { id, buffer, width, height, channels, options }를 받고,
 * runChromaKeyPipeline을 실행한 후 { id, result, buffer }를 전송한다.
 * 오류 발생 시 { id, error }를 전송한다.
 *
 * @domain game.asset-pipeline.chroma-key
 * @scope browser-worker
 */

import type { ChromaKeyOptionsType } from "types/game/chroma-key";
import { runChromaKeyPipeline } from "./chromaKeyPipeline";

// ---------------------------------------------------------------------------
// Message protocol
// ---------------------------------------------------------------------------

type WorkerRequest = {
  id: string;
  buffer: ArrayBuffer;
  width: number;
  height: number;
  channels: number;
  options: ChromaKeyOptionsType;
};

type WorkerSuccessResponse = {
  id: string;
  buffer: ArrayBuffer;
  width: number;
  height: number;
  channels: number;
  evaluation: ReturnType<typeof runChromaKeyPipeline>["evaluation"];
  quality: ReturnType<typeof runChromaKeyPipeline>["quality"];
  detection: ReturnType<typeof runChromaKeyPipeline>["detection"];
  kernel: ReturnType<typeof runChromaKeyPipeline>["kernel"];
  refine: ReturnType<typeof runChromaKeyPipeline>["refine"];
};

type WorkerErrorResponse = {
  id: string;
  error: string;
};

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, buffer, width, height, channels, options } = event.data;

  try {
    // pixel limit safety check
    const pixelCount = width * height;
    if (pixelCount > 8_500_000) {
      const response: WorkerErrorResponse = {
        id,
        error: `image_too_large: ${pixelCount} pixels exceeds 8,500,000 limit`,
      };
      // Return original buffer since we couldn't process it
      (self as unknown as Worker).postMessage(response, [buffer]);
      return;
    }

    // Run the chroma key pipeline (in-place on the buffer)
    const result = runChromaKeyPipeline({
      data: new Uint8Array(buffer),
      width,
      height,
      channels,
      options,
    });

    // Transfer the modified buffer back
    const resultBuffer = result.data.buffer as ArrayBuffer;
    const response: WorkerSuccessResponse = {
      id,
      buffer: resultBuffer,
      width,
      height,
      channels,
      evaluation: result.evaluation,
      quality: result.quality,
      detection: result.detection,
      kernel: result.kernel,
      refine: result.refine,
    };

    (self as unknown as Worker).postMessage(response, [resultBuffer]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const response: WorkerErrorResponse = { id, error: `pipeline_error: ${message}` };

    // Return original buffer on error
    try {
      (self as unknown as Worker).postMessage(response, [buffer]);
    } catch {
      (self as unknown as Worker).postMessage(response);
    }
  }
};
