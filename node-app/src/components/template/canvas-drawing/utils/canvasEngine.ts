import type { CanvasItem, DrawingDoc, Point, PolygonItem, ShapeItem, StrokeItem } from "../CanvasDrawingTypes";
import { canvasDrawingClamp, canvasDrawingDist } from "libs/canvas/geometry";

export { canvasDrawingClamp, canvasDrawingDist } from "libs/canvas/geometry";

export type CaptureBounds = { width: number; height: number };

export type CaptureRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

export function normalizeCaptureRect(start: Point, now: Point): CaptureRect {
  const left = Math.min(start.x, now.x);
  const top = Math.min(start.y, now.y);
  const right = Math.max(start.x, now.x);
  const bottom = Math.max(start.y, now.y);

  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  };
}

export function isPointInCaptureRect(point: Point, rect: CaptureRect) {
  return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
}

export function moveCaptureRectWithinBounds(rect: CaptureRect, nextLeft: number, nextTop: number, bounds: CaptureBounds) {
  const width = Math.min(rect.width, bounds.width);
  const height = Math.min(rect.height, bounds.height);
  const left = canvasDrawingClamp(nextLeft, 0, Math.max(0, bounds.width - width));
  const top = canvasDrawingClamp(nextTop, 0, Math.max(0, bounds.height - height));

  return {
    start: { x: left, y: top },
    now: { x: left + width, y: top + height },
  };
}

export function createCenteredAspectCapturePoints(args: {
  bounds: CaptureBounds;
  aspectRatio: number;
  coverRatio?: number;
}) {
  const aspectRatio = Math.max(0.0001, args.aspectRatio);
  const coverRatio = canvasDrawingClamp(args.coverRatio ?? 0.82, 0.1, 1);
  const maxWidth = args.bounds.width * coverRatio;
  const maxHeight = args.bounds.height * coverRatio;
  let width = maxWidth;
  let height = width / aspectRatio;

  if (height > maxHeight) {
    height = maxHeight;
    width = height * aspectRatio;
  }

  const left = (args.bounds.width - width) / 2;
  const top = (args.bounds.height - height) / 2;

  return {
    start: { x: left, y: top },
    now: { x: left + width, y: top + height },
  };
}

export function createAspectCaptureNowFromPoints(args: {
  start: Point;
  current: Point;
  bounds: CaptureBounds;
  aspectRatio: number;
}) {
  const aspectRatio = Math.max(0.0001, args.aspectRatio);
  const signX = args.current.x >= args.start.x ? 1 : -1;
  const signY = args.current.y >= args.start.y ? 1 : -1;
  const maxWidth = signX > 0 ? args.bounds.width - args.start.x : args.start.x;
  const maxHeight = signY > 0 ? args.bounds.height - args.start.y : args.start.y;
  let width = Math.abs(args.current.x - args.start.x);
  let height = Math.abs(args.current.y - args.start.y);

  if (!width && !height) {
    width = Math.min(maxWidth, Math.max(1, maxHeight * aspectRatio));
    height = width / aspectRatio;
  } else if (!height || width / Math.max(height, 1) > aspectRatio) {
    height = width / aspectRatio;
  } else {
    width = height * aspectRatio;
  }

  if (width > maxWidth) {
    width = maxWidth;
    height = width / aspectRatio;
  }
  if (height > maxHeight) {
    height = maxHeight;
    width = height * aspectRatio;
  }

  return {
    x: args.start.x + signX * Math.max(1, width),
    y: args.start.y + signY * Math.max(1, height),
  };
}

export function getCanvasStageMetrics(stage: HTMLElement) {
  const rect = stage.getBoundingClientRect();
  const width = Math.max(1, stage.offsetWidth || rect.width);
  const height = Math.max(1, stage.offsetHeight || rect.height);

  return {
    rect,
    width,
    height,
    scaleX: rect.width > 0 ? rect.width / width : 1,
    scaleY: rect.height > 0 ? rect.height / height : 1,
  };
}

export function pxToNorm(p: Point, w: number, h: number): Point {
  return { x: w > 0 ? canvasDrawingClamp(p.x / w, 0, 1) : 0, y: h > 0 ? canvasDrawingClamp(p.y / h, 0, 1) : 0 };
}

export function normToPx(p: Point, w: number, h: number): Point {
  return { x: p.x * w, y: p.y * h };
}

export function lineWidthPx(sizeNorm: number, w: number, h: number) {
  return Math.max(1, Math.round(sizeNorm * Math.min(w, h)));
}

function pointInEllipse(p: Point, cx: number, cy: number, rx: number, ry: number) {
  if (rx <= 0 || ry <= 0) return false;
  const nx = (p.x - cx) / rx;
  const ny = (p.y - cy) / ry;
  return nx * nx + ny * ny <= 1;
}

function pointInPolygon(p: Point, poly: Point[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x,
      yi = poly[i].y;
    const xj = poly[j].x,
      yj = poly[j].y;

    const intersect = yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi + 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function renderDocToBase(ctx: CanvasRenderingContext2D, doc: DrawingDoc, w: number, h: number) {
  ctx.clearRect(0, 0, w, h);

  for (const it of doc.items) {
    if (it.type === "stroke") drawStroke(ctx, it, w, h);
    else if (it.type === "shape") drawShape(ctx, it, w, h);
    else drawPolygon(ctx, it, w, h);
  }
}

function drawStroke(ctx: CanvasRenderingContext2D, it: StrokeItem, w: number, h: number) {
  const pts = it.points.map((p) => normToPx(p, w, h));
  const lw = lineWidthPx(it.sizeNorm, w, h);

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = lw;

  if (it.mode === "erase") {
    ctx.globalCompositeOperation = "destination-out";
    ctx.strokeStyle = "rgba(0,0,0,1)";
  } else {
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = it.color;
  }

  if (pts.length === 1) {
    ctx.beginPath();
    ctx.arc(pts[0].x, pts[0].y, lw / 2, 0, Math.PI * 2);
    ctx.fillStyle = it.mode === "erase" ? "rgba(0,0,0,1)" : it.color;
    if (it.mode === "erase") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.fill();
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.fill();
    }
    ctx.restore();
    return;
  }

  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const cur = pts[i];
    const mx = (prev.x + cur.x) / 2;
    const my = (prev.y + cur.y) / 2;
    ctx.quadraticCurveTo(prev.x, prev.y, mx, my);
  }
  ctx.stroke();
  ctx.restore();
}

function drawShape(ctx: CanvasRenderingContext2D, it: ShapeItem, w: number, h: number) {
  const x1 = it.x1 * w;
  const y1 = it.y1 * h;
  const x2 = it.x2 * w;
  const y2 = it.y2 * h;

  const left = Math.min(x1, x2);
  const top = Math.min(y1, y2);
  const right = Math.max(x1, x2);
  const bottom = Math.max(y1, y2);

  const width = right - left;
  const height = bottom - top;
  const lw = lineWidthPx(it.sizeNorm, w, h);

  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.strokeStyle = it.color;
  ctx.lineWidth = lw;

  ctx.beginPath();
  if (it.shape === "rect") {
    ctx.rect(left, top, width, height);
  } else if (it.shape === "triangle") {
    const cx = left + width / 2;
    ctx.moveTo(cx, top);
    ctx.lineTo(left, bottom);
    ctx.lineTo(right, bottom);
    ctx.closePath();
  } else {
    const cx = left + width / 2;
    const cy = top + height / 2;
    ctx.ellipse(cx, cy, Math.abs(width / 2), Math.abs(height / 2), 0, 0, Math.PI * 2);
  }
  ctx.stroke();
  ctx.restore();
}

function drawPolygon(ctx: CanvasRenderingContext2D, it: PolygonItem, w: number, h: number) {
  const pts = it.points.map((p) => normToPx(p, w, h));
  if (pts.length < 3) return;
  const lw = lineWidthPx(it.sizeNorm, w, h);

  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.strokeStyle = it.color;
  ctx.lineWidth = lw;

  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

type HandleType = "nw" | "ne" | "sw" | "se";

export type HitResultType =
  | { kind: "none" }
  | { kind: "shape"; id: string; handle?: HandleType }
  | { kind: "polygon"; id: string; vertexIndex?: number }
  | { kind: "stroke"; id: string };

export function getShapeBoundsPx(it: ShapeItem, w: number, h: number) {
  const x1 = it.x1 * w;
  const y1 = it.y1 * h;
  const x2 = it.x2 * w;
  const y2 = it.y2 * h;

  const left = Math.min(x1, x2);
  const top = Math.min(y1, y2);
  const right = Math.max(x1, x2);
  const bottom = Math.max(y1, y2);
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

// 폴리곤 bbox(px)
export function getPolygonBoundsPx(pointsPx: Point[]) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of pointsPx) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  if (!Number.isFinite(minX)) return null;
  return { left: minX, top: minY, right: maxX, bottom: maxY, width: maxX - minX, height: maxY - minY };
}

/** item bbox(px) - 스냅 후보 생성에 사용 */
export function getItemBoundsPx(it: CanvasItem, w: number, h: number) {
  if (it.type === "shape") return getShapeBoundsPx(it, w, h);

  if (it.type === "polygon") {
    const pts = it.points.map((np) => normToPx(np, w, h));
    return getPolygonBoundsPx(pts);
  }

  // stroke
  const pts = it.points.map((np) => normToPx(np, w, h));
  if (pts.length <= 0) return null;

  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const pad = lineWidthPx(it.sizeNorm, w, h);
  return {
    left: minX - pad,
    top: minY - pad,
    right: maxX + pad,
    bottom: maxY + pad,
    width: maxX - minX + pad * 2,
    height: maxY - minY + pad * 2,
  };
}

function uniqSorted(arr: number[]) {
  const s = Array.from(new Set(arr.map((n) => Math.round(n * 1000) / 1000)));
  s.sort((a, b) => a - b);
  return s;
}

// 스냅 후보 라인(px): 캔버스(0/중앙/끝) + 다른 item들의 left/center/right, top/center/bottom
export function collectSnapLines(items: CanvasItem[], w: number, h: number, excludeId?: string) {
  const xs: number[] = [0, w / 2, w];
  const ys: number[] = [0, h / 2, h];

  for (const it of items) {
    if (excludeId && it.id === excludeId) continue;
    const b = getItemBoundsPx(it, w, h);
    if (!b) continue;
    xs.push(b.left, (b.left + b.right) / 2, b.right);
    ys.push(b.top, (b.top + b.bottom) / 2, b.bottom);
  }

  return { xs: uniqSorted(xs), ys: uniqSorted(ys) };
}

export function hitTest(items: CanvasItem[], p: Point, w: number, h: number): HitResultType {
  const HANDLE_R = 10;

  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];

    if (it.type === "shape") {
      const b = getShapeBoundsPx(it, w, h);

      const corners: Array<[HandleType, Point]> = [
        ["nw", { x: b.left, y: b.top }],
        ["ne", { x: b.right, y: b.top }],
        ["sw", { x: b.left, y: b.bottom }],
        ["se", { x: b.right, y: b.bottom }],
      ];

      for (const [handle, hp] of corners) {
        if (canvasDrawingDist(p, hp) <= HANDLE_R) return { kind: "shape", id: it.id, handle };
      }

      if (it.shape === "ellipse") {
        const cx = b.left + b.width / 2;
        const cy = b.top + b.height / 2;
        if (pointInEllipse(p, cx, cy, Math.abs(b.width / 2), Math.abs(b.height / 2)))
          return { kind: "shape", id: it.id };
      } else {
        if (p.x >= b.left && p.x <= b.right && p.y >= b.top && p.y <= b.bottom) return { kind: "shape", id: it.id };
      }
    }

    if (it.type === "polygon") {
      const pts = it.points.map((np) => normToPx(np, w, h));
      for (let vi = 0; vi < pts.length; vi++) {
        if (canvasDrawingDist(p, pts[vi]) <= HANDLE_R) return { kind: "polygon", id: it.id, vertexIndex: vi };
      }
      if (pts.length >= 3 && pointInPolygon(p, pts)) return { kind: "polygon", id: it.id };
    }

    if (it.type === "stroke") {
      const b = getItemBoundsPx(it, w, h);
      if (b && p.x >= b.left && p.x <= b.right && p.y >= b.top && p.y <= b.bottom) return { kind: "stroke", id: it.id };
    }
  }

  return { kind: "none" };
}

// 체크보드(투명 배경 표시) 스타일
export function getCheckerboardStyle(enabled: boolean): React.CSSProperties | undefined {
  if (!enabled) return undefined;
  return {
    backgroundImage:
      "linear-gradient(45deg, rgba(255,255,255,.06) 25%, transparent 25%)," +
      "linear-gradient(-45deg, rgba(255,255,255,.06) 25%, transparent 25%)," +
      "linear-gradient(45deg, transparent 75%, rgba(255,255,255,.06) 75%)," +
      "linear-gradient(-45deg, transparent 75%, rgba(255,255,255,.06) 75%)",
    backgroundSize: "20px 20px",
    backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px",
  };
}

export function getPointFromPointerEvent(
  e: PointerEvent | React.PointerEvent,
  metrics: ReturnType<typeof getCanvasStageMetrics>,
): Point {
  return {
    x: (e.clientX - metrics.rect.left) / Math.max(metrics.scaleX, 0.0001),
    y: (e.clientY - metrics.rect.top) / Math.max(metrics.scaleY, 0.0001),
  };
}

// 점-선분 최근접(projection)
export function closestPointOnSegment(p: Point, a: Point, b: Point): { point: Point; t: number } {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const denom = abx * abx + aby * aby;
  const t = denom <= 1e-9 ? 0 : canvasDrawingClamp((apx * abx + apy * aby) / denom, 0, 1);
  return { point: { x: a.x + abx * t, y: a.y + aby * t }, t };
}

// 폴리곤 edge 중 가장 가까운 edge + 삽입 위치(=edgeIndex 다음)에 넣을 점
export function nearestPolygonEdgePx(p: Point, pts: Point[], thresholdPx: number) {
  if (pts.length < 2) return null;

  let best: { edgeIndex: number; point: Point; canvasDrawingDist: number } | null = null;

  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const { point } = closestPointOnSegment(p, a, b);
    const d = canvasDrawingDist(p, point);
    if (!best || d < best.canvasDrawingDist) best = { edgeIndex: i, point, canvasDrawingDist: d };
  }

  if (!best || best.canvasDrawingDist > thresholdPx) return null;
  return best;
}
