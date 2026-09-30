"use client";

import { useEffect, useRef } from "react";
import type { DrawingDoc, Point } from "../CanvasDrawingTypes";
import { canvasDrawingClamp, clampCommentBubbleOffset, estimateCommentBoxSize, getCanvasStageMetrics } from "../utils";

type DragState = null | {
  id: string;
  kind: "pin" | "bubble";
  pointerId: number;
  startClient: Point;
  startPinPx?: Point;
  startBubbleDx?: number;
  startBubbleDy?: number;
};

export function useCommentDrag(args: {
  stageRef: React.RefObject<HTMLDivElement | null>;
  docRef: { current: DrawingDoc };
  applyReplace: (next: DrawingDoc) => DrawingDoc;
  applyPush: (next: DrawingDoc) => DrawingDoc;
}) {
  const dragRef = useRef<DragState>(null);

  const onPointerDownPin = (id: string, e: React.PointerEvent) => {
    const stage = args.stageRef.current;
    if (!stage) return;
    const metrics = getCanvasStageMetrics(stage);

    const c = args.docRef.current.comments.find((x) => x.id === id);
    if (!c) return;

    dragRef.current = {
      id,
      kind: "pin",
      pointerId: e.pointerId,
      startClient: { x: e.clientX, y: e.clientY },
      startPinPx: { x: c.xNorm * metrics.width, y: c.yNorm * metrics.height },
    };
  };

  const onPointerDownBubble = (id: string, e: React.PointerEvent) => {
    const c = args.docRef.current.comments.find((x) => x.id === id);
    if (!c) return;

    dragRef.current = {
      id,
      kind: "bubble",
      pointerId: e.pointerId,
      startClient: { x: e.clientX, y: e.clientY },
      startBubbleDx: c.bubbleDx ?? (c.kind === "label" ? 0 : 18),
      startBubbleDy: c.bubbleDy ?? (c.kind === "label" ? 0 : -18),
    };
  };

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const st = dragRef.current;
      if (!st) return;
      if (e.pointerId !== st.pointerId) return;

      const stage = args.stageRef.current;
      if (!stage) return;
      const metrics = getCanvasStageMetrics(stage);

      const dxClient = (e.clientX - st.startClient.x) / Math.max(metrics.scaleX, 0.0001);
      const dyClient = (e.clientY - st.startClient.y) / Math.max(metrics.scaleY, 0.0001);

      const cur = args.docRef.current;
      const idx = cur.comments.findIndex((x) => x.id === st.id);
      if (idx < 0) return;

      const nextComments = cur.comments.slice();
      const c = nextComments[idx];
      const boxSize = estimateCommentBoxSize(c);

      if (st.kind === "pin" && st.startPinPx) {
        const px = st.startPinPx.x + dxClient;
        const py = st.startPinPx.y + dyClient;

        const xNorm = metrics.width > 0 ? canvasDrawingClamp(px / metrics.width, 0, 1) : 0;
        const yNorm = metrics.height > 0 ? canvasDrawingClamp(py / metrics.height, 0, 1) : 0;

        const pinPx = { x: xNorm * metrics.width, y: yNorm * metrics.height };
        const adj = clampCommentBubbleOffset({
          pinPx,
          stageW: metrics.width,
          stageH: metrics.height,
          bubbleW: boxSize.w,
          bubbleH: boxSize.h,
          dx: c.bubbleDx ?? (c.kind === "label" ? 0 : 18),
          dy: c.bubbleDy ?? (c.kind === "label" ? 0 : -18),
          autoFlip: true,
        });

        nextComments[idx] = { ...c, xNorm, yNorm, bubbleDx: adj.dx, bubbleDy: adj.dy };
      } else if (st.kind === "bubble") {
        const nextDx = (st.startBubbleDx ?? (c.kind === "label" ? 0 : 18)) + dxClient;
        const nextDy = (st.startBubbleDy ?? (c.kind === "label" ? 0 : -18)) + dyClient;

        const pinPx = { x: (c.xNorm ?? 0) * metrics.width, y: (c.yNorm ?? 0) * metrics.height };
        const adj = clampCommentBubbleOffset({
          pinPx,
          stageW: metrics.width,
          stageH: metrics.height,
          bubbleW: boxSize.w,
          bubbleH: boxSize.h,
          dx: nextDx,
          dy: nextDy,
          autoFlip: false,
        });

        nextComments[idx] = { ...c, bubbleDx: adj.dx, bubbleDy: adj.dy };
      }

      args.applyReplace({ ...cur, comments: nextComments });
    };

    const onUp = (e: PointerEvent) => {
      const st = dragRef.current;
      if (!st) return;
      if (e.pointerId !== st.pointerId) return;

      dragRef.current = null;
      args.applyPush({ ...args.docRef.current, comments: args.docRef.current.comments.slice() });
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [args]);

  return { onPointerDownPin, onPointerDownBubble };
}
