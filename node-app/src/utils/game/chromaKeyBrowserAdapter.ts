/**
 * ChromaKey v2 — 브라우저 adapter (CK-400)
 *
 * Web Worker 라이프사이클 관리, requestId 기반 stale 응답 폐기,
 * preview downscale 정책, Worker 미지원/오류 복구 안내를 제공한다.
 *
 * @domain game.asset-pipeline.chroma-key
 * @scope browser
 */

import type { ChromaKeyOptionsType } from "types/game/chroma-key";
import {
  CHROMA_KEY_PREVIEW_MAX_DIMENSION,
  CHROMA_KEY_PIXEL_LIMIT,
} from "consts/game/chromaKey";

// ---------------------------------------------------------------------------
// 타입
// ---------------------------------------------------------------------------

type WorkerSuccessPayload = {
  id: string;
  buffer: ArrayBuffer;
  width: number;
  height: number;
  channels: number;
  evaluation: { verdict: string; reason?: string };
  quality: Record<string, unknown>;
  detection: Record<string, unknown>;
  kernel: Record<string, unknown>;
  refine: Record<string, unknown>;
};

type WorkerMessage = WorkerSuccessPayload | { id: string; error: string };

export type ChromaKeyPreviewResult = {
  imageData: ImageData;
  dataUrl: string;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  evaluation: { verdict: string; reason?: string };
  quality: Record<string, unknown>;
  detection: Record<string, unknown>;
  kernel: Record<string, unknown>;
  refine: Record<string, unknown>;
  downscaled: boolean;
};

export type ChromaKeyWorkerStatus =
  | { available: true }
  | { available: false; reason: string };

// ---------------------------------------------------------------------------
// Worker 가용성 검사
// ---------------------------------------------------------------------------

let _workerSupported: boolean | null = null;

function isWorkerSupported(): boolean {
  if (_workerSupported !== null) return _workerSupported;
  try {
    _workerSupported =
      typeof Worker !== "undefined" &&
      typeof Blob !== "undefined" &&
      typeof URL !== "undefined";
  } catch {
    _workerSupported = false;
  }
  return _workerSupported;
}

export function checkChromaKeyWorkerStatus(): ChromaKeyWorkerStatus {
  if (!isWorkerSupported()) {
    return {
      available: false,
      reason: "Web Worker is not supported in this environment",
    };
  }
  return { available: true };
}


// ---------------------------------------------------------------------------
// Image utilities
// ---------------------------------------------------------------------------

async function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("chroma_key_image_load_failed"));
    img.src = src;
  });
}

function resolvePreviewDimensions(
  originalWidth: number,
  originalHeight: number,
): { width: number; height: number; downscaled: boolean } {
  const maxDim = Math.max(originalWidth, originalHeight);
  if (maxDim <= CHROMA_KEY_PREVIEW_MAX_DIMENSION) {
    return { width: originalWidth, height: originalHeight, downscaled: false };
  }
  const scale = CHROMA_KEY_PREVIEW_MAX_DIMENSION / maxDim;
  return {
    width: Math.round(originalWidth * scale),
    height: Math.round(originalHeight * scale),
    downscaled: true,
  };
}

function canvasImageToImageData(
  img: HTMLImageElement,
  targetWidth: number,
  targetHeight: number,
): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("chroma_key_canvas_unavailable");
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
  return ctx.getImageData(0, 0, targetWidth, targetHeight);
}

function imageDataToDataUrl(imageData: ImageData): string {
  const canvas = document.createElement("canvas");
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("chroma_key_canvas_unavailable");
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

// ---------------------------------------------------------------------------
// ChromaKeyBrowserSession
// ---------------------------------------------------------------------------

export class ChromaKeyBrowserSession {
  private worker: Worker | null = null;
  private nextRequestId = 0;
  private latestRequestId = 0;
  private pendingResolve: Map<
    string,
    { resolve: (v: WorkerSuccessPayload) => void; reject: (e: Error) => void }
  > = new Map();
  private destroyed = false;
  private workerError: string | null = null;

  private ensureWorker(): Worker {
    if (this.destroyed) throw new Error("ChromaKeyBrowserSession destroyed");
    if (this.workerError) throw new Error(`Worker unavailable: ${this.workerError}`);
    if (this.worker) return this.worker;
    if (!isWorkerSupported()) {
      this.workerError = "Web Worker not supported";
      throw new Error("Web Worker is not supported in this environment");
    }
    try {
      this.worker = new Worker(
        new URL("./chromaKeyBrowserWorker.ts", import.meta.url),
        { type: "module" },
      );
      this.worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
        const payload = event.data as WorkerMessage;
        const pending = this.pendingResolve.get(payload.id);
        if (!pending) return;
        this.pendingResolve.delete(payload.id);
        const reqNum = Number(payload.id.split("-")[0] || "0");
        if (reqNum < this.latestRequestId) return; // stale 폐기
        if ("error" in payload) {
          pending.reject(new Error(payload.error));
        } else {
          pending.resolve(payload);
        }
      };
      this.worker.onerror = () => {
        this.workerError = "Worker unrecoverable error";
        for (const [, p] of this.pendingResolve) p.reject(new Error("Worker error"));
        this.pendingResolve.clear();
        this.worker = null;
      };
    } catch (err) {
      this.workerError = `Worker creation failed: ${err instanceof Error ? err.message : String(err)}`;
      throw new Error(this.workerError);
    }
    return this.worker;
  }

  private async runInWorker(
    imageData: ImageData,
    options: ChromaKeyOptionsType,
  ): Promise<WorkerSuccessPayload> {
    const requestId = `${++this.nextRequestId}-${Date.now()}`;
    this.latestRequestId = this.nextRequestId;
    const worker = this.ensureWorker();
    return new Promise((resolve, reject) => {
      this.pendingResolve.set(requestId, { resolve, reject });
      const buffer = imageData.data.buffer.slice(0);
      worker.postMessage(
        { id: requestId, buffer, width: imageData.width, height: imageData.height, channels: 4, options },
        [buffer],
      );
    });
  }

  async processPreview(
    imageSrc: string,
    options: ChromaKeyOptionsType,
  ): Promise<ChromaKeyPreviewResult> {
    if (this.destroyed) throw new Error("ChromaKeyBrowserSession destroyed");
    const img = await loadImageElement(imageSrc);
    const ow = Math.max(1, img.naturalWidth || img.width || 1);
    const oh = Math.max(1, img.naturalHeight || img.height || 1);
    if (ow * oh > CHROMA_KEY_PIXEL_LIMIT) {
      throw new Error(`image_too_large: ${ow}×${oh} exceeds ${CHROMA_KEY_PIXEL_LIMIT}px`);
    }
    const { width, height, downscaled } = resolvePreviewDimensions(ow, oh);
    const imageData = canvasImageToImageData(img, width, height);
    const result = await this.runInWorker(imageData, options);
    const resultImageData = new ImageData(new Uint8ClampedArray(result.buffer), result.width, result.height);
    const dataUrl = imageDataToDataUrl(resultImageData);
    return {
      imageData: resultImageData,
      dataUrl,
      width: result.width,
      height: result.height,
      originalWidth: ow,
      originalHeight: oh,
      evaluation: result.evaluation as ChromaKeyPreviewResult["evaluation"],
      quality: result.quality,
      detection: result.detection,
      kernel: result.kernel,
      refine: result.refine,
      downscaled,
    };
  }

  destroy(): void {
    this.destroyed = true;
    for (const [, p] of this.pendingResolve) p.reject(new Error("Session destroyed"));
    this.pendingResolve.clear();
    if (this.worker) { this.worker.terminate(); this.worker = null; }
  }

  get status(): ChromaKeyWorkerStatus {
    if (this.workerError) return { available: false, reason: this.workerError };
    if (this.destroyed) return { available: false, reason: "Session destroyed" };
    return checkChromaKeyWorkerStatus();
  }
}

export function createChromaKeyBrowserSession(): ChromaKeyBrowserSession {
  return new ChromaKeyBrowserSession();
}

