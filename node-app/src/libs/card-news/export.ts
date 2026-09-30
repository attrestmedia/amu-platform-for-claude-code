/**
 * @docHint
 * @purpose 동일 CardNews renderer를 display Canvas와 고정 해상도 PNG export에 연결
 * @process backing canvas 준비 → logical transform → renderCardScene → toBlob/download
 * @domain card-news
 * @scope browser_export_adapter
 */

import type { CardNewsPreparedScene, CardNewsRenderSurface } from "types/card-news/scene";
import { renderCardScene } from "libs/card-news/renderer";
import { assertCardNewsCanvasReadable } from "libs/card-news/browserAsset";
import { canvasToBlob, downloadBlob } from "libs/canvas/blob";

export type CardNewsCanvasOptions = {
  canvas?: HTMLCanvasElement;
  surface?: CardNewsRenderSurface;
  /** display/preview Canvas에 적용할 CSS 논리 너비. */
  cssWidth?: number;
  /** display/preview Canvas에 적용할 CSS 논리 높이. */
  cssHeight?: number;
  /** display/preview Canvas의 DPR. exportCardNewsPng는 항상 1을 사용한다. */
  pixelRatio?: number;
};

export type CardNewsPngResult = {
  blob: Blob;
  filename: string;
  width: number;
  height: number;
};

export type CardNewsDeckPngResult = Omit<CardNewsPngResult, "blob"> & { blob?: Blob };

export type CardNewsExportErrorCode =
  | "CANVAS_BROWSER_UNAVAILABLE"
  | "CANVAS_CONTEXT_UNAVAILABLE"
  | "CANVAS_SECURITY_ERROR"
  | "CANVAS_MEMORY_LIMIT"
  | "PNG_BLOB_FAILED"
  | "DOWNLOAD_FAILED"
  | "DECK_EXPORT_EMPTY";

export class CardNewsExportError extends Error {
  readonly code: CardNewsExportErrorCode;

  constructor(code: CardNewsExportErrorCode, options?: { cause?: unknown }) {
    super(code);
    this.name = "CardNewsExportError";
    this.code = code;
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}

function getPixelRatio(options: CardNewsCanvasOptions) {
  const requested = Number(options.pixelRatio);
  if (Number.isFinite(requested) && requested > 0) return Math.min(4, requested);
  if (typeof window !== "undefined" && Number.isFinite(window.devicePixelRatio) && window.devicePixelRatio > 0) {
    return Math.min(4, window.devicePixelRatio);
  }
  return 1;
}

function getCssDimension(value: number | undefined, fallback: number) {
  return Number.isFinite(value) && (value as number) > 0 ? (value as number) : fallback;
}

/** display/preview는 CSS size×DPR backing store를 사용하고 scene 좌표는 frame pixel로 유지한다. */
export function renderCardNewsCanvas(scene: CardNewsPreparedScene, options: CardNewsCanvasOptions = {}) {
  if (typeof document === "undefined") throw new CardNewsExportError("CANVAS_BROWSER_UNAVAILABLE");

  const canvas = options.canvas || document.createElement("canvas");
  const surface = options.surface || "display";
  const isExport = surface === "export";
  const cssWidth = getCssDimension(options.cssWidth, scene.frameSize.w);
  const cssHeight = getCssDimension(options.cssHeight, cssWidth * scene.frameSize.h / scene.frameSize.w);
  const pixelRatio = isExport ? 1 : getPixelRatio(options);
  const width = Math.max(1, Math.round((isExport ? scene.frameSize.w : cssWidth) * pixelRatio));
  const height = Math.max(1, Math.round((isExport ? scene.frameSize.h : cssHeight) * pixelRatio));
  if (width * height > 24_000_000) throw new CardNewsExportError("CANVAS_MEMORY_LIMIT");
  if (!isExport && canvas.style) {
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
  }
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) throw new CardNewsExportError("CANVAS_CONTEXT_UNAVAILABLE");
  try {
    context.setTransform(width / scene.frameSize.w, 0, 0, height / scene.frameSize.h, 0, 0);
    renderCardScene(context, scene);
  } catch (error) {
    if (error instanceof DOMException && error.name === "SecurityError") {
      throw new CardNewsExportError("CANVAS_SECURITY_ERROR", { cause: error });
    }
    throw error;
  }
  return canvas;
}

function canvasToPngBlob(canvas: HTMLCanvasElement) {
  return canvasToBlob(canvas, "image/png").then((blob) => {
    if (!blob) throw new CardNewsExportError("PNG_BLOB_FAILED");
    return blob;
  }).catch((error) => {
    if (error instanceof DOMException && error.name === "SecurityError") {
      throw new CardNewsExportError("CANVAS_SECURITY_ERROR", { cause: error });
    }
    if (error instanceof CardNewsExportError) throw error;
    throw new CardNewsExportError("PNG_BLOB_FAILED", { cause: error });
  });
}

export function sanitizeCardNewsFilename(value: string) {
  const normalized = String(value || "card-news")
    .trim()
    .replace(/\.png$/i, "")
    .replace(/[^a-zA-Z0-9가-힣._-]+/g, "-")
    .replace(/\.\.+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${normalized || "card-news"}.png`;
}

export function downloadCardNewsBlob(blob: Blob, filename: string) {
  if (typeof document === "undefined") throw new CardNewsExportError("CANVAS_BROWSER_UNAVAILABLE");
  try {
    downloadBlob(blob, filename);
  } catch (error) {
    throw new CardNewsExportError("DOWNLOAD_FAILED", { cause: error });
  }
}

/** export는 CSS size나 devicePixelRatio와 무관하게 CardDeck frameSize를 그대로 사용한다. */
export async function exportCardNewsPng(
  scene: CardNewsPreparedScene,
  options: { filename?: string; download?: boolean } = {},
): Promise<CardNewsPngResult> {
  const canvas = renderCardNewsCanvas(scene, { surface: "export", pixelRatio: 1 });
  const width = canvas.width;
  const height = canvas.height;
  try {
    assertCardNewsCanvasReadable(canvas);
    const blob = await canvasToPngBlob(canvas);
    const filename = sanitizeCardNewsFilename(options.filename || `card-${scene.cardId}`);
    if (options.download) downloadCardNewsBlob(blob, filename);

    return { blob, filename, width, height };
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

export async function exportCardNewsDeckPng(
  scenes: readonly CardNewsPreparedScene[],
  options: { deckName?: string; download?: boolean; retainBlobs?: boolean } = {},
): Promise<CardNewsDeckPngResult[]> {
  if (!scenes.length) throw new CardNewsExportError("DECK_EXPORT_EMPTY");
  const deckName = sanitizeCardNewsFilename(options.deckName || "card-news").replace(/\.png$/i, "");
  const results: CardNewsDeckPngResult[] = [];

  for (const [index, scene] of scenes.entries()) {
    const filename = sanitizeCardNewsFilename(`${deckName}-${String(index + 1).padStart(2, "0")}-${scene.cardId}`);
    const result = await exportCardNewsPng(scene, {
      filename,
      download: false,
    });
    if (options.download) downloadCardNewsBlob(result.blob, filename);
    results.push(options.retainBlobs ? result : {
      filename: result.filename,
      width: result.width,
      height: result.height,
    });
  }

  return results;
}
