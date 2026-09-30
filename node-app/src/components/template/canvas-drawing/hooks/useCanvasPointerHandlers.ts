"use client";

import type { DrawingDoc, Point, Tool } from "../CanvasDrawingTypes";
import {
  canvasDrawingClamp,
  CAPTURE_HANDLE_HIT_PX,
  collectSnapLines,
  createAspectCaptureNowFromPoints,
  getCaptureResizeHandle,
  getCanvasStageMetrics,
  getItemBoundsPx,
  getPointFromPointerEvent,
  getPolygonBoundsPx,
  getShapeBoundsPx,
  hitTest,
  isPointInCaptureRect,
  moveCaptureRectWithinBounds,
  normToPx,
  normalizeCaptureRect,
  pxToNorm,
  nearestPolygonEdgePx,
} from "../utils";
import type { HitResultType } from "../utils";

const SNAP_PX = 10;

function genId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function useCanvasPointerHandlers(args: {
  tool: Tool;
  penSize: number;
  penColor: string;

  snapEnabled: boolean;
  interactionBlockedRef?: { current: boolean };

  polyPoints: Point[];
  setPolyPoints: React.Dispatch<React.SetStateAction<Point[]>>;

  setCursorPos: (p: Point | null) => void;

  selectedItemId: string | null;
  setSelectedItemId: (id: string | null) => void;
  setSelectedCommentId: (id: string | null) => void;

  captureMode: "none" | "selecting" | "ready";
  setCaptureMode: (v: "none" | "selecting" | "ready") => void;
  captureAspectRatio?: number;

  commentDraftPointRef: { current: Point | null };
  commentDraftTargetIdRef: { current: string | null };
  setCommentDraftOpen: (v: boolean) => void;
  setCommentDraftText: (v: string) => void;
  textDraftPointRef: { current: Point | null };
  setTextDraftOpen: (v: boolean) => void;
  setTextDraftText: (v: string) => void;

  stageRef: React.RefObject<HTMLDivElement | null>;
  baseCtxRef: { current: CanvasRenderingContext2D | null };
  docRef: { current: DrawingDoc };

  applyReplace: (next: DrawingDoc) => DrawingDoc;
  applyPush: (next: DrawingDoc) => DrawingDoc;

  renderBase: (doc: DrawingDoc) => void;

  clearGuides: () => void;
  snapRectMove: (
    b: { left: number; right: number; top: number; bottom: number },
    xs: number[],
    ys: number[],
    threshold: number
  ) => { dx: number; dy: number };
  snapPointMove: (
    p: { x: number; y: number },
    xs: number[],
    ys: number[],
    threshold: number
  ) => { dx: number; dy: number };

  renderOverlayPreview: () => void;
  clearOverlay: () => void;

  refs: {
    isPointerDownRef: { current: boolean };
    activePointerIdRef: { current: number | null };

    strokeStartedRef: { current: boolean };
    lastPointRef: { current: Point | null };
    strokePointsRef: { current: Point[] };

    shapeStartRef: { current: Point | null };
    shapeNowRef: { current: Point | null };
    shapeKeepCircleRef: { current: boolean };

    editDragRef: {
      current: {
        mode: "none" | "move" | "resize" | "poly-vertex";
        start: Point | null;
        startClient?: Point | null;
        hit: HitResultType | null;
        base?: {
          shapeBounds?: { left: number; top: number; right: number; bottom: number; width: number; height: number };
          polyPtsPx?: Point[];
        } | null;
      };
    };

    polyHoverRef: { current: Point | null };
    polyEdgeHoverRef: { current: { id: string; edgeIndex: number; point: Point } | null };
    polyVertexHoverRef: { current: { id: string; index: number } | null };

    captureStartRef: { current: Point | null };
    captureNowRef: { current: Point | null };
    captureResizeRef: {
      current: {
        mode: "move" | "resize";
        offset: Point;
        originRect?: ReturnType<typeof normalizeCaptureRect>;
      } | null;
    };

    selectBoxStartRef: { current: Point | null };
    selectBoxNowRef: { current: Point | null };
  };
}) {
  const beginStroke = (p: Point) => {
    const ctx = args.baseCtxRef.current;
    if (!ctx) return;

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(1, args.penSize);

    if (args.tool === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "rgba(0,0,0,1)";
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = args.penColor;
    }

    ctx.beginPath();
    ctx.moveTo(p.x, p.y);

    args.refs.strokeStartedRef.current = true;
    args.refs.lastPointRef.current = p;
    args.refs.strokePointsRef.current = [p];
  };

  const extendStrokeSmooth = (p: Point) => {
    const ctx = args.baseCtxRef.current;
    if (!ctx) return;

    const lp = args.refs.lastPointRef.current;
    if (!lp) {
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      args.refs.lastPointRef.current = p;
      return;
    }

    const mx = (lp.x + p.x) / 2;
    const my = (lp.y + p.y) / 2;
    ctx.quadraticCurveTo(lp.x, lp.y, mx, my);
    ctx.stroke();

    args.refs.lastPointRef.current = p;
    args.refs.strokePointsRef.current.push(p);
  };

  const endStroke = () => {
    const ctx = args.baseCtxRef.current;
    const stage = args.stageRef.current;
    if (!ctx || !stage) return;

    if (args.refs.strokeStartedRef.current) {
      ctx.closePath();
      ctx.restore();
    }

    args.refs.strokeStartedRef.current = false;
    args.refs.lastPointRef.current = null;

    const rect = getCanvasStageMetrics(stage);
    const w = rect.width;
    const h = rect.height;

    const pts = args.refs.strokePointsRef.current;
    args.refs.strokePointsRef.current = [];
    if (pts.length <= 0) return;

    const sizeNorm = args.penSize / Math.max(1, Math.min(w, h));
    const next: DrawingDoc = {
      ...args.docRef.current,
      items: [
        ...args.docRef.current.items,
        {
          id: genId(),
          type: "stroke",
          mode: args.tool === "eraser" ? "erase" : "draw",
          points: pts.map((pp) => pxToNorm(pp, w, h)),
          sizeNorm,
          color: args.penColor,
          createdAt: Date.now(),
        },
      ],
    };

    args.applyPush(next);
    args.renderBase(next);
    args.setSelectedItemId(next.items[next.items.length - 1].id);
    args.setSelectedCommentId(null);
  };

  const commitShape = () => {
    const stage = args.stageRef.current;
    if (!stage) return;

    const s = args.refs.shapeStartRef.current;
    const n = args.refs.shapeNowRef.current;
    if (!s || !n) return;

    const rect = getCanvasStageMetrics(stage);
    const w = rect.width;
    const h = rect.height;

    const left = Math.min(s.x, n.x);
    const top = Math.min(s.y, n.y);
    const right = Math.max(s.x, n.x);
    const bottom = Math.max(s.y, n.y);

    args.refs.shapeStartRef.current = null;
    args.refs.shapeNowRef.current = null;
    args.clearOverlay();
    args.clearGuides();

    const sizeNorm = args.penSize / Math.max(1, Math.min(w, h));
    const x1 = w > 0 ? canvasDrawingClamp(left / w, 0, 1) : 0;
    const y1 = h > 0 ? canvasDrawingClamp(top / h, 0, 1) : 0;
    const x2 = w > 0 ? canvasDrawingClamp(right / w, 0, 1) : 0;
    const y2 = h > 0 ? canvasDrawingClamp(bottom / h, 0, 1) : 0;

    const shapeType = args.tool === "rect" ? "rect" : args.tool === "triangle" ? "triangle" : "ellipse";

    const id = genId();
    const next: DrawingDoc = {
      ...args.docRef.current,
      items: [
        ...args.docRef.current.items,
        {
          id,
          type: "shape",
          shape: shapeType,
          x1,
          y1,
          x2,
          y2,
          sizeNorm,
          color: args.penColor,
          createdAt: Date.now(),
        },
      ],
    };

    args.applyPush(next);
    args.renderBase(next);
    args.setSelectedItemId(id);
    args.setSelectedCommentId(null);
  };

  const commitPolygon = () => {
    const stage = args.stageRef.current;
    if (!stage) return;
    if (args.polyPoints.length < 3) return;

    const rect = getCanvasStageMetrics(stage);
    const w = rect.width;
    const h = rect.height;

    const id = genId();
    const sizeNorm = args.penSize / Math.max(1, Math.min(w, h));
    const pointsNorm = args.polyPoints.map((p) => pxToNorm(p, w, h));

    const next: DrawingDoc = {
      ...args.docRef.current,
      items: [
        ...args.docRef.current.items,
        { id, type: "polygon", points: pointsNorm, sizeNorm, color: args.penColor, createdAt: Date.now() },
      ],
    };

    args.applyPush(next);
    args.renderBase(next);
    args.setSelectedItemId(id);
    args.setSelectedCommentId(null);

    args.setPolyPoints([]);
    args.refs.polyHoverRef.current = null;
    args.clearOverlay();
    args.clearGuides();
  };

  const startMarquee = (p: Point) => {
    args.refs.selectBoxStartRef.current = p;
    args.refs.selectBoxNowRef.current = p;
    args.renderOverlayPreview();
  };

  const endMarquee = (rect: { width: number; height: number }) => {
    const s = args.refs.selectBoxStartRef.current;
    const n = args.refs.selectBoxNowRef.current;
    args.refs.selectBoxStartRef.current = null;
    args.refs.selectBoxNowRef.current = null;

    if (!s || !n) return;

    const left = Math.min(s.x, n.x);
    const top = Math.min(s.y, n.y);
    const right = Math.max(s.x, n.x);
    const bottom = Math.max(s.y, n.y);

    // 너무 작으면 클릭으로 취급
    if (Math.abs(right - left) < 4 && Math.abs(bottom - top) < 4) {
      args.renderOverlayPreview();
      return;
    }

    const w = rect.width;
    const h = rect.height;

    // 최상단부터 hit(포토샵 느낌)
    const items = args.docRef.current.items;
    let found: string | null = null;

    for (let i = items.length - 1; i >= 0; i--) {
      const b = getItemBoundsPx(items[i], w, h);
      if (!b) continue;

      const intersects = !(b.right < left || b.left > right || b.bottom < top || b.top > bottom);
      if (intersects) {
        found = items[i].id;
        break;
      }
    }

    args.setSelectedItemId(found);
    args.setSelectedCommentId(null);
    args.clearGuides();
    args.renderOverlayPreview();
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const stage = args.stageRef.current;
    if (!stage) return;
    if (e.button !== 0) return;
    if (args.interactionBlockedRef?.current) return;

    const rect = getCanvasStageMetrics(stage);
    let p = getPointFromPointerEvent(e, rect);
    args.setCursorPos(p);

    args.refs.isPointerDownRef.current = true;
    args.refs.activePointerIdRef.current = e.pointerId;

    // capture는 항상 pointer capture
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    // 영역 캡쳐 모드: ready 상태의 모서리는 기존 영역 크기 조절을 우선한다.
    if (args.captureMode !== "none") {
      const captureStart = args.refs.captureStartRef.current;
      const captureNow = args.refs.captureNowRef.current;

      if (args.captureMode === "ready" && captureStart && captureNow) {
        const hitRadius = CAPTURE_HANDLE_HIT_PX / Math.max(Math.min(rect.scaleX, rect.scaleY), 0.0001);
        const handle = getCaptureResizeHandle(p, captureStart, captureNow, hitRadius);
        const captureRect = normalizeCaptureRect(captureStart, captureNow);

        if (handle) {
          args.setCaptureMode("selecting");
          args.refs.captureStartRef.current = handle.opposite;
          args.refs.captureNowRef.current = handle.point;
          args.refs.captureResizeRef.current = {
            mode: "resize",
            offset: { x: p.x - handle.point.x, y: p.y - handle.point.y },
          };
          return;
        }

        if (isPointInCaptureRect(p, captureRect)) {
          args.setCaptureMode("selecting");
          args.refs.captureStartRef.current = { x: captureRect.left, y: captureRect.top };
          args.refs.captureNowRef.current = { x: captureRect.right, y: captureRect.bottom };
          args.refs.captureResizeRef.current = {
            mode: "move",
            offset: { x: p.x - captureRect.left, y: p.y - captureRect.top },
            originRect: captureRect,
          };
          return;
        }
      }

      // 핸들 외부를 누르면 기존 동작대로 새 영역 선택을 시작한다.
      // 시작점도 이미지(캔버스) 영역 안으로 클램핑해 핸들이 영역 밖으로 벗어나지 않게 한다.
      const captureStartPoint = {
        x: canvasDrawingClamp(p.x, 0, rect.width),
        y: canvasDrawingClamp(p.y, 0, rect.height),
      };
      args.setCaptureMode("selecting");
      args.refs.captureStartRef.current = captureStartPoint;
      args.refs.captureNowRef.current = captureStartPoint;
      args.refs.captureResizeRef.current = null;
      return;
    }

    if (args.tool === "select") {
      const hit = hitTest(args.docRef.current.items, p, rect.width, rect.height);

      // 빈 공간 → 마퀴 시작
      if (hit.kind === "none") {
        args.setSelectedItemId(null);
        args.setSelectedCommentId(null);
        args.clearGuides();
        startMarquee(p);
        return;
      }

      // Alt+Click: polygon vertex delete
      if (hit.kind === "polygon" && typeof hit.vertexIndex === "number" && e.altKey) {
        const cur = args.docRef.current;
        const idx = cur.items.findIndex((x) => x.id === hit.id);
        if (idx >= 0) {
          const it = cur.items[idx];
          if (it.type === "polygon" && it.points.length > 3) {
            const nextPts = it.points.slice();
            nextPts.splice(hit.vertexIndex, 1);
            const nextItems = cur.items.slice();
            nextItems[idx] = { ...it, points: nextPts };
            const nextDoc = { ...cur, items: nextItems };
            args.applyPush(nextDoc);
            args.renderBase(nextDoc);
            args.setSelectedItemId(hit.id);
            args.setSelectedCommentId(null);
            args.renderOverlayPreview();
          }
        }
        return;
      }

      args.clearGuides();

      if (hit.kind === "shape") {
        args.setSelectedItemId(hit.id);
        args.setSelectedCommentId(null);

        const cur = args.docRef.current;
        const it = cur.items.find((x) => x.id === hit.id);
        const b0 = it?.type === "shape" ? getShapeBoundsPx(it, rect.width, rect.height) : null;

        args.refs.editDragRef.current = {
          mode: hit.handle ? "resize" : "move",
          start: p,
          startClient: { x: e.clientX, y: e.clientY },
          hit,
          base: b0 ? { shapeBounds: b0 } : null,
        };

        args.renderOverlayPreview();
        return;
      }

      if (hit.kind === "polygon") {
        args.setSelectedItemId(hit.id);
        args.setSelectedCommentId(null);

        const cur = args.docRef.current;
        const it = cur.items.find((x) => x.id === hit.id);
        const pts0 = it?.type === "polygon" ? it.points.map((np) => normToPx(np, rect.width, rect.height)) : null;

        args.refs.editDragRef.current = {
          mode: typeof hit.vertexIndex === "number" ? "poly-vertex" : "move",
          start: p,
          startClient: { x: e.clientX, y: e.clientY },
          hit,
          base: pts0 ? { polyPtsPx: pts0 } : null,
        };

        args.renderOverlayPreview();
        return;
      }

      if (hit.kind === "stroke") {
        args.setSelectedItemId(hit.id);
        args.setSelectedCommentId(null);
        args.renderOverlayPreview();
        return;
      }
    }

    if (args.tool === "comment") {
      args.commentDraftPointRef.current = p;
      args.commentDraftTargetIdRef.current = args.selectedItemId || null;
      args.setCommentDraftText("");
      args.setCommentDraftOpen(true);
      return;
    }

    if (args.tool === "text") {
      args.textDraftPointRef.current = p;
      args.setTextDraftText("");
      args.setTextDraftOpen(true);
      return;
    }

    if (args.tool === "polygon") {
      // 폴리곤 점 추가도 스냅
      if (args.snapEnabled && !e.altKey) {
        const { xs, ys } = collectSnapLines(args.docRef.current.items, rect.width, rect.height);
        const adj = args.snapPointMove({ x: p.x, y: p.y }, xs, ys, SNAP_PX);
        p = { x: canvasDrawingClamp(p.x + adj.dx, 0, rect.width), y: canvasDrawingClamp(p.y + adj.dy, 0, rect.height) };
      } else {
        args.clearGuides();
      }

      if (args.polyPoints.length >= 3) {
        const p0 = args.polyPoints[0];
        const dist = Math.hypot(p.x - p0.x, p.y - p0.y);
        if (dist <= 14) {
          commitPolygon();
          return;
        }
      }
      args.setPolyPoints((prev) => [...prev, p]);
      return;
    }

    if (args.tool === "rect" || args.tool === "triangle" || args.tool === "ellipse") {
      args.refs.shapeStartRef.current = p;
      args.refs.shapeNowRef.current = p;
      args.refs.shapeKeepCircleRef.current = !!(e.shiftKey && args.tool === "ellipse");
      args.renderOverlayPreview();
      return;
    }

    if (args.tool === "pen" || args.tool === "eraser") {
      beginStroke(p);
      return;
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const stage = args.stageRef.current;
    if (!stage) return;
    if (args.interactionBlockedRef?.current) return;

    const rect = getCanvasStageMetrics(stage);
    let pNow = getPointFromPointerEvent(e, rect);
    args.setCursorPos(pNow);

    // capture selecting
    if (args.captureMode === "selecting" && args.refs.isPointerDownRef.current && args.refs.captureStartRef.current) {
      const drag = args.refs.captureResizeRef.current;
      // 새 영역 드래그/크기 조절 모두 이미지(캔버스) 영역을 넘지 않도록 클램핑한다.
      if (drag?.mode === "move" && drag.originRect) {
        const moved = moveCaptureRectWithinBounds(
          drag.originRect,
          pNow.x - drag.offset.x,
          pNow.y - drag.offset.y,
          rect,
        );
        args.refs.captureStartRef.current = moved.start;
        args.refs.captureNowRef.current = moved.now;
        return;
      }

      const nextPoint = drag
        ? {
            x: canvasDrawingClamp(pNow.x - drag.offset.x, 0, rect.width),
            y: canvasDrawingClamp(pNow.y - drag.offset.y, 0, rect.height),
          }
        : {
            x: canvasDrawingClamp(pNow.x, 0, rect.width),
            y: canvasDrawingClamp(pNow.y, 0, rect.height),
          };

      args.refs.captureNowRef.current = args.captureAspectRatio
        ? createAspectCaptureNowFromPoints({
            start: args.refs.captureStartRef.current,
            current: nextPoint,
            bounds: rect,
            aspectRatio: args.captureAspectRatio,
          })
        : nextPoint;
      return;
    }

    // 폴리곤 hover 프리뷰도 스냅
    if (args.tool === "polygon" && args.polyPoints.length > 0) {
      if (args.snapEnabled && !e.altKey) {
        const { xs, ys } = collectSnapLines(args.docRef.current.items, rect.width, rect.height);
        const adj = args.snapPointMove({ x: pNow.x, y: pNow.y }, xs, ys, SNAP_PX);
        pNow = {
          x: canvasDrawingClamp(pNow.x + adj.dx, 0, rect.width),
          y: canvasDrawingClamp(pNow.y + adj.dy, 0, rect.height),
        };
      } else {
        args.clearGuides();
      }
      args.refs.polyHoverRef.current = pNow;
      args.renderOverlayPreview();
    }

    // hover updates (select)
    if (!args.refs.isPointerDownRef.current && args.tool === "select") {
      const hit = hitTest(args.docRef.current.items, pNow, rect.width, rect.height);
      if (hit.kind === "polygon" && typeof hit.vertexIndex === "number")
        args.refs.polyVertexHoverRef.current = { id: hit.id, index: hit.vertexIndex };
      else args.refs.polyVertexHoverRef.current = null;

      if (args.selectedItemId) {
        const it = args.docRef.current.items.find((x) => x.id === args.selectedItemId);
        if (it?.type === "polygon") {
          const ptsPx = it.points.map((np) => normToPx(np, rect.width, rect.height));
          const edge = nearestPolygonEdgePx(pNow, ptsPx, 12);
          args.refs.polyEdgeHoverRef.current = edge
            ? { id: it.id, edgeIndex: edge.edgeIndex, point: edge.point }
            : null;
          args.renderOverlayPreview();
        } else {
          args.refs.polyEdgeHoverRef.current = null;
        }
      } else {
        args.refs.polyEdgeHoverRef.current = null;
      }
    }

    if (!args.refs.isPointerDownRef.current) return;
    if (args.refs.activePointerIdRef.current !== e.pointerId) return;

    // 마퀴 드래그 중
    if (
      args.tool === "select" &&
      args.refs.selectBoxStartRef.current &&
      args.refs.editDragRef.current.mode === "none"
    ) {
      args.refs.selectBoxNowRef.current = pNow;
      args.renderOverlayPreview();
      return;
    }

    // select drag (move/resize)
    const ed = args.refs.editDragRef.current;
    if (args.tool === "select" && ed.mode !== "none" && ed.hit) {
      const hit = ed.hit;
      const cur = args.docRef.current;
      const w = rect.width;
      const h = rect.height;

      // 항상 client 기준 델타 사용
      const sc = ed.startClient;
      const dx = sc ? (e.clientX - sc.x) / Math.max(rect.scaleX, 0.0001) : 0;
      const dy = sc ? (e.clientY - sc.y) / Math.max(rect.scaleY, 0.0001) : 0;

      if (hit.kind === "shape") {
        const idx = cur.items.findIndex((x) => x.id === hit.id);
        if (idx >= 0) {
          const it = cur.items[idx];
          if (it.type === "shape") {
            const b0 = ed.base?.shapeBounds ?? getShapeBoundsPx(it, w, h);
            const nextBounds =
              ed.mode === "move"
                ? { left: b0.left + dx, top: b0.top + dy, right: b0.right + dx, bottom: b0.bottom + dy }
                : (() => {
                    const left = b0.left;
                    const top = b0.top;
                    const right = b0.right;
                    const bottom = b0.bottom;
                    if (hit.handle === "nw") return { left: left + dx, top: top + dy, right, bottom };
                    if (hit.handle === "ne") return { left, top: top + dy, right: right + dx, bottom };
                    if (hit.handle === "sw") return { left: left + dx, top, right, bottom: bottom + dy };
                    return { left, top, right: right + dx, bottom: bottom + dy }; // se
                  })();

            let nl = canvasDrawingClamp(nextBounds.left, 0, w);
            let nt = canvasDrawingClamp(nextBounds.top, 0, h);
            let nr = canvasDrawingClamp(nextBounds.right, 0, w);
            let nb = canvasDrawingClamp(nextBounds.bottom, 0, h);

            if (Math.abs(nr - nl) < 10 || Math.abs(nb - nt) < 10) return;

            if (args.snapEnabled && !e.altKey) {
              const { xs, ys } = collectSnapLines(cur.items, w, h, hit.id);
              const adj = args.snapRectMove({ left: nl, top: nt, right: nr, bottom: nb }, xs, ys, SNAP_PX);

              if (ed.mode === "move") {
                nl = canvasDrawingClamp(nl + adj.dx, 0, w);
                nr = canvasDrawingClamp(nr + adj.dx, 0, w);
                nt = canvasDrawingClamp(nt + adj.dy, 0, h);
                nb = canvasDrawingClamp(nb + adj.dy, 0, h);
              } else {
                if (hit.handle === "nw" || hit.handle === "sw") nl = canvasDrawingClamp(nl + adj.dx, 0, w);
                if (hit.handle === "ne" || hit.handle === "se") nr = canvasDrawingClamp(nr + adj.dx, 0, w);
                if (hit.handle === "nw" || hit.handle === "ne") nt = canvasDrawingClamp(nt + adj.dy, 0, h);
                if (hit.handle === "sw" || hit.handle === "se") nb = canvasDrawingClamp(nb + adj.dy, 0, h);
              }

              if (Math.abs(nr - nl) < 10 || Math.abs(nb - nt) < 10) return;
            } else {
              args.clearGuides();
            }

            const nextItems = cur.items.slice();
            nextItems[idx] = { ...it, x1: nl / w, y1: nt / h, x2: nr / w, y2: nb / h };
            const nextDoc = { ...cur, items: nextItems };
            args.applyReplace(nextDoc);
            args.renderBase(nextDoc);
            args.renderOverlayPreview();
          }
        }
        return;
      }

      if (hit.kind === "polygon") {
        const idx = cur.items.findIndex((x) => x.id === hit.id);
        if (idx >= 0) {
          const it = cur.items[idx];
          if (it.type === "polygon") {
            const pts0 = ed.base?.polyPtsPx ?? it.points.map((np) => normToPx(np, w, h));

            let nextPtsPx: Point[];

            if (ed.mode === "poly-vertex" && typeof hit.vertexIndex === "number") {
              nextPtsPx = pts0.map((q, qi) => (qi === hit.vertexIndex ? { x: q.x + dx, y: q.y + dy } : q));
            } else {
              nextPtsPx = pts0.map((q) => ({ x: q.x + dx, y: q.y + dy }));
            }

            if (args.snapEnabled && !e.altKey) {
              const { xs, ys } = collectSnapLines(cur.items, w, h, hit.id);

              if (ed.mode === "move") {
                const b = getPolygonBoundsPx(nextPtsPx);
                if (b) {
                  const adj = args.snapRectMove(
                    { left: b.left, top: b.top, right: b.right, bottom: b.bottom },
                    xs,
                    ys,
                    SNAP_PX
                  );
                  nextPtsPx = nextPtsPx.map((pp) => ({ x: pp.x + adj.dx, y: pp.y + adj.dy }));
                }
              } else if (ed.mode === "poly-vertex" && typeof hit.vertexIndex === "number") {
                const pv = nextPtsPx[hit.vertexIndex];
                const adj = args.snapPointMove({ x: pv.x, y: pv.y }, xs, ys, SNAP_PX);
                nextPtsPx = nextPtsPx.map((pp, i) =>
                  i === hit.vertexIndex ? { x: pp.x + adj.dx, y: pp.y + adj.dy } : pp
                );
              }
            } else {
              args.clearGuides();
            }

            nextPtsPx = nextPtsPx.map((pp) => ({
              x: canvasDrawingClamp(pp.x, 0, w),
              y: canvasDrawingClamp(pp.y, 0, h),
            }));

            const nextItems = cur.items.slice();
            nextItems[idx] = { ...it, points: nextPtsPx.map((pp) => pxToNorm(pp, w, h)) };
            const nextDoc = { ...cur, items: nextItems };
            args.applyReplace(nextDoc);
            args.renderBase(nextDoc);
            args.renderOverlayPreview();
          }
        }
        return;
      }

      return;
    }

    // 도형 생성 중에도 스냅 적용
    if (args.tool === "rect" || args.tool === "triangle" || args.tool === "ellipse") {
      if (args.snapEnabled && !e.altKey) {
        const { xs, ys } = collectSnapLines(args.docRef.current.items, rect.width, rect.height);
        const adj = args.snapPointMove({ x: pNow.x, y: pNow.y }, xs, ys, SNAP_PX);
        pNow = {
          x: canvasDrawingClamp(pNow.x + adj.dx, 0, rect.width),
          y: canvasDrawingClamp(pNow.y + adj.dy, 0, rect.height),
        };
      } else {
        args.clearGuides();
      }

      args.refs.shapeNowRef.current = pNow;
      args.refs.shapeKeepCircleRef.current = !!(e.shiftKey && args.tool === "ellipse");
      args.renderOverlayPreview();
      return;
    }

    if (args.tool === "pen" || args.tool === "eraser") {
      const evs = (e.nativeEvent as PointerEvent).getCoalescedEvents?.() as PointerEvent[] | undefined;
      if (evs && evs.length > 0) {
        for (const ce of evs) extendStrokeSmooth(getPointFromPointerEvent(ce, rect));
      } else {
        extendStrokeSmooth(pNow);
      }
    }
  };

  const onPointerUpOrCancel = (e: React.PointerEvent) => {
    if (args.interactionBlockedRef?.current) return;
    if (args.refs.activePointerIdRef.current !== e.pointerId) return;

    args.refs.isPointerDownRef.current = false;
    args.refs.activePointerIdRef.current = null;

    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}

    // capture: 드래그 끝나면 ready로 유지(버튼 클릭 가능)
    if (args.captureMode === "selecting") {
      args.refs.captureResizeRef.current = null;
      args.setCaptureMode("ready");
      return;
    }

    // 마퀴 종료
    if (args.tool === "select" && args.refs.selectBoxStartRef.current) {
      const stage = args.stageRef.current;
      if (stage) endMarquee(getCanvasStageMetrics(stage));
      return;
    }

    if (args.tool === "select" && args.refs.editDragRef.current.mode !== "none") {
      args.refs.editDragRef.current = { mode: "none", start: null, startClient: null, hit: null, base: null };
      args.applyPush({
        ...args.docRef.current,
        items: args.docRef.current.items.slice(),
        comments: args.docRef.current.comments.slice(),
      });
      args.renderOverlayPreview();
      return;
    }

    if (args.tool === "rect" || args.tool === "triangle" || args.tool === "ellipse") {
      commitShape();
      return;
    }

    if (args.tool === "pen" || args.tool === "eraser") {
      endStroke();
      return;
    }
  };

  const onDoubleClick = () => {
    if (args.tool === "polygon" && args.polyPoints.length >= 3) {
      commitPolygon();
      return;
    }

    if (args.tool === "select" && args.selectedItemId) {
      const eh = args.refs.polyEdgeHoverRef.current;
      if (!eh || eh.id !== args.selectedItemId) return;

      const stage = args.stageRef.current;
      if (!stage) return;
      const r = getCanvasStageMetrics(stage);

      const cur = args.docRef.current;
      const idx = cur.items.findIndex((x) => x.id === eh.id);
      if (idx < 0) return;

      const it = cur.items[idx];
      if (it.type !== "polygon") return;

      const pts = it.points.slice();
      const insertAt = eh.edgeIndex + 1;
      const pn = pxToNorm(eh.point, r.width, r.height);
      pts.splice(insertAt, 0, pn);

      const nextItems = cur.items.slice();
      nextItems[idx] = { ...it, points: pts };

      const nextDoc = { ...cur, items: nextItems };
      args.applyPush(nextDoc);
      args.renderBase(nextDoc);
      args.renderOverlayPreview();
    }
  };

  const cancelActiveInteraction = () => {
    const ctx = args.baseCtxRef.current;
    if (ctx && args.refs.strokeStartedRef.current) {
      try {
        ctx.restore();
      } catch {}
    }

    args.refs.isPointerDownRef.current = false;
    args.refs.activePointerIdRef.current = null;
    args.refs.strokeStartedRef.current = false;
    args.refs.lastPointRef.current = null;
    args.refs.strokePointsRef.current = [];
    args.refs.shapeStartRef.current = null;
    args.refs.shapeNowRef.current = null;
    args.refs.selectBoxStartRef.current = null;
    args.refs.selectBoxNowRef.current = null;
    args.refs.captureResizeRef.current = null;
    args.refs.editDragRef.current = { mode: "none", start: null, startClient: null, hit: null, base: null };
    args.clearGuides();
    args.clearOverlay();
    args.renderBase(args.docRef.current);
  };

  return { onPointerDown, onPointerMove, onPointerUpOrCancel, onDoubleClick, commitPolygon, cancelActiveInteraction };
}
