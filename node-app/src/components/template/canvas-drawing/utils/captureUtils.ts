import type { Point } from "../CanvasDrawingTypes";

export { canvasToBlob, downloadBlob } from "libs/canvas/blob";

export const CAPTURE_HANDLE_HIT_PX = 14;

export function getCaptureResizeHandle(point: Point, start: Point, end: Point, hitRadius: number) {
  const left = Math.min(start.x, end.x);
  const right = Math.max(start.x, end.x);
  const top = Math.min(start.y, end.y);
  const bottom = Math.max(start.y, end.y);
  const handles = [
    { point: { x: left, y: top }, opposite: { x: right, y: bottom } },
    { point: { x: right, y: top }, opposite: { x: left, y: bottom } },
    { point: { x: left, y: bottom }, opposite: { x: right, y: top } },
    { point: { x: right, y: bottom }, opposite: { x: left, y: top } },
  ];

  return handles.find((handle) => Math.hypot(point.x - handle.point.x, point.y - handle.point.y) <= hitRadius) ?? null;
}

type Html2CanvasOptions = Record<string, unknown>;
type Html2CanvasFn = (el: HTMLElement, opts?: Html2CanvasOptions) => Promise<HTMLCanvasElement>;

// html2canvas가 설치되어 있으면(프로젝트에 존재하면) DOM 포함 캡쳐 시도
export async function tryHtml2Canvas(el: HTMLElement, opts: Html2CanvasOptions): Promise<HTMLCanvasElement | null> {
  if (typeof window === "undefined") return null;

  try {
    const mod: { default?: Html2CanvasFn } | Html2CanvasFn = await import("html2canvas-pro");
    const fn = typeof mod === "function" ? mod : mod?.default;

    if (typeof fn !== "function") {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[tryHtml2Canvas] html2canvas loaded but not a function:", mod);
      }
      return null;
    }

    return await fn(el, opts);
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[tryHtml2Canvas] html2canvas failed:", err);
    }
    return null;
  }
}

export function cropCanvas(src: HTMLCanvasElement, x: number, y: number, w: number, h: number) {
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.floor(w));
  out.height = Math.max(1, Math.floor(h));
  const ctx = out.getContext("2d");
  if (!ctx) return out;
  ctx.drawImage(src, x, y, w, h, 0, 0, w, h);
  return out;
}
