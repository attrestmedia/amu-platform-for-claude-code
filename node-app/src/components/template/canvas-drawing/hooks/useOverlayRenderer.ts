"use client";

import type { DrawingDoc, Point, Tool } from "../CanvasDrawingTypes";
import { getCanvasStageMetrics, getItemBoundsPx, getShapeBoundsPx, normToPx } from "../utils";

export function useOverlayRenderer(args: {
  tool: Tool;
  selectedItemId: string | null;
  polyPointsPx: Point[];
  penSize: number;
  penColor: string;
  guideEnabled: boolean;

  docRef: { current: DrawingDoc };
  stageRef: React.RefObject<HTMLDivElement | null>;
  overlayCtxRef: { current: CanvasRenderingContext2D | null };

  guidesRef: { current: { v: number[]; h: number[] } };
  polyEdgeHoverRef: { current: { id: string; edgeIndex: number; point: Point } | null };

  shapeStartRef: { current: Point | null };
  shapeNowRef: { current: Point | null };
  shapeKeepCircleRef: { current: boolean };
  polyHoverRef: { current: Point | null };

  // 마퀴 선택 박스
  selectBoxStartRef: { current: Point | null };
  selectBoxNowRef: { current: Point | null };
}) {
  const clearOverlay = () => {
    const ctx = args.overlayCtxRef.current;
    const stage = args.stageRef.current;
    if (!ctx || !stage) return;
    const metrics = getCanvasStageMetrics(stage);
    ctx.clearRect(0, 0, metrics.width, metrics.height);
  };

  const renderOverlayPreview = () => {
    const ctx = args.overlayCtxRef.current;
    const stage = args.stageRef.current;
    if (!ctx || !stage) return;

    const metrics = getCanvasStageMetrics(stage);
    const w = metrics.width;
    const h = metrics.height;

    ctx.clearRect(0, 0, w, h);

    // guides
    if (args.guideEnabled) {
      const { v, h: hh } = args.guidesRef.current;
      if (v.length || hh.length) {
        ctx.save();
        ctx.strokeStyle = "rgba(91,58,237,.45)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        for (const x of v) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, h);
          ctx.stroke();
        }
        for (const y of hh) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
          ctx.stroke();
        }
        ctx.setLineDash([]);
        ctx.restore();
      }
    }

    // marquee select box
    if (args.tool === "select" && args.selectBoxStartRef.current && args.selectBoxNowRef.current) {
      const s = args.selectBoxStartRef.current;
      const n = args.selectBoxNowRef.current;
      const left = Math.min(s.x, n.x);
      const top = Math.min(s.y, n.y);
      const ww = Math.abs(n.x - s.x);
      const hh = Math.abs(n.y - s.y);

      ctx.save();
      ctx.fillStyle = "rgba(91,58,237,.08)";
      ctx.strokeStyle = "rgba(91,58,237,.75)";
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 4]);
      ctx.fillRect(left, top, ww, hh);
      ctx.strokeRect(left, top, ww, hh);
      ctx.setLineDash([]);
      ctx.restore();
    }

    // select handles
    if (args.tool === "select" && args.selectedItemId) {
      const it = args.docRef.current.items.find((x) => x.id === args.selectedItemId);

      if (it?.type === "shape") {
        const b = getShapeBoundsPx(it, w, h);
        ctx.save();
        ctx.strokeStyle = "rgba(91,58,237,.9)";
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(b.left, b.top, b.width, b.height);
        ctx.setLineDash([]);

        const handles = [
          { x: b.left, y: b.top },
          { x: b.right, y: b.top },
          { x: b.left, y: b.bottom },
          { x: b.right, y: b.bottom },
        ];

        for (const hp of handles) {
          ctx.beginPath();
          ctx.arc(hp.x, hp.y, 6, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255,255,255,.95)";
          ctx.fill();
          ctx.strokeStyle = "rgba(91,58,237,.9)";
          ctx.stroke();
        }
        ctx.restore();
      }

      if (it?.type === "polygon") {
        const pts = it.points.map((np) => normToPx(np, w, h));
        ctx.save();
        ctx.strokeStyle = "rgba(91,58,237,.9)";
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(pts[0]?.x || 0, pts[0]?.y || 0);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.closePath();
        ctx.stroke();
        ctx.setLineDash([]);

        for (const p of pts) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255,255,255,.95)";
          ctx.fill();
          ctx.strokeStyle = "rgba(91,58,237,.9)";
          ctx.stroke();
        }
        ctx.restore();
      }

      // stroke도 선택 박스 표시
      if (it?.type === "stroke") {
        const b = getItemBoundsPx(it, w, h);
        if (b) {
          ctx.save();
          ctx.strokeStyle = "rgba(91,58,237,.9)";
          ctx.lineWidth = 1;
          ctx.setLineDash([6, 4]);
          ctx.strokeRect(b.left, b.top, b.width, b.height);
          ctx.setLineDash([]);
          ctx.restore();
        }
      }
    }

    // polygon drawing preview
    if (args.tool === "polygon" && args.polyPointsPx.length > 0) {
      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = args.penColor;
      ctx.lineWidth = Math.max(1, args.penSize);

      ctx.beginPath();
      ctx.moveTo(args.polyPointsPx[0].x, args.polyPointsPx[0].y);
      for (let i = 1; i < args.polyPointsPx.length; i++) ctx.lineTo(args.polyPointsPx[i].x, args.polyPointsPx[i].y);

      const hover = args.polyHoverRef.current;
      if (hover) ctx.lineTo(hover.x, hover.y);

      ctx.stroke();
      ctx.restore();
      return;
    }

    // shape preview
    const s = args.shapeStartRef.current;
    const n = args.shapeNowRef.current;
    if ((args.tool === "rect" || args.tool === "triangle" || args.tool === "ellipse") && s && n) {
      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = args.penColor;
      ctx.lineWidth = Math.max(1, args.penSize);

      const left = Math.min(s.x, n.x);
      const top = Math.min(s.y, n.y);
      const right = Math.max(s.x, n.x);
      const bottom = Math.max(s.y, n.y);
      const width = right - left;
      const height = bottom - top;

      ctx.beginPath();
      if (args.tool === "rect") ctx.rect(left, top, width, height);
      else if (args.tool === "triangle") {
        const cx = left + width / 2;
        ctx.moveTo(cx, top);
        ctx.lineTo(left, bottom);
        ctx.lineTo(right, bottom);
        ctx.closePath();
      } else {
        const ww = args.shapeKeepCircleRef.current ? Math.min(width, height) : width;
        const hh = args.shapeKeepCircleRef.current ? Math.min(width, height) : height;
        const cx = left + ww / 2;
        const cy = top + hh / 2;
        ctx.ellipse(cx, cy, Math.abs(ww / 2), Math.abs(hh / 2), 0, 0, Math.PI * 2);
      }
      ctx.stroke();
      ctx.restore();
    }
  };

  return { clearOverlay, renderOverlayPreview };
}
