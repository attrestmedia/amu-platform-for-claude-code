"use client";

import { useMemo, useRef } from "react";
import type { Point } from "../CanvasDrawingTypes";
import type { CaptureRect } from "../utils";
import type { HitResultType } from "../utils";

export function useCanvasDrawingRefs() {
  const isPointerDownRef = useRef(false);
  const activePointerIdRef = useRef<number | null>(null);

  const strokeStartedRef = useRef(false);
  const lastPointRef = useRef<Point | null>(null);
  const strokePointsRef = useRef<Point[]>([]);

  const shapeStartRef = useRef<Point | null>(null);
  const shapeNowRef = useRef<Point | null>(null);
  const shapeKeepCircleRef = useRef(false);

  const editDragRef = useRef<{
    mode: "none" | "move" | "resize" | "poly-vertex";
    start: Point | null;
    startClient?: Point | null;
    hit: HitResultType | null;
    base?: {
      shapeBounds?: { left: number; top: number; right: number; bottom: number; width: number; height: number };
      polyPtsPx?: Point[];
    } | null;
  }>({ mode: "none", start: null, hit: null });

  const polyHoverRef = useRef<Point | null>(null);
  const polyEdgeHoverRef = useRef<{ id: string; edgeIndex: number; point: Point } | null>(null);
  const polyVertexHoverRef = useRef<{ id: string; index: number } | null>(null);

  const captureStartRef = useRef<Point | null>(null);
  const captureNowRef = useRef<Point | null>(null);
  const captureResizeRef = useRef<{
    mode: "move" | "resize";
    offset: Point;
    originRect?: CaptureRect;
  } | null>(null);

  // 마퀴 선택 박스
  const selectBoxStartRef = useRef<Point | null>(null);
  const selectBoxNowRef = useRef<Point | null>(null);

  // ref 갱신용 mutator — 소비자가 직접 .current = ...로 갱신하면 react-hooks/immutability에 걸리므로 함수로 노출
  const clearPolyHover = () => {
    polyHoverRef.current = null;
    polyEdgeHoverRef.current = null;
    polyVertexHoverRef.current = null;
  };
  const clearShape = () => {
    shapeStartRef.current = null;
    shapeNowRef.current = null;
  };
  const clearCapture = () => {
    captureStartRef.current = null;
    captureNowRef.current = null;
    captureResizeRef.current = null;
  };
  const resetEditDrag = () => {
    editDragRef.current = { mode: "none", start: null, hit: null };
  };

  return useMemo(
    () => ({
      isPointerDownRef,
      activePointerIdRef,
      strokeStartedRef,
      lastPointRef,
      strokePointsRef,
      shapeStartRef,
      shapeNowRef,
      shapeKeepCircleRef,
      editDragRef,
      polyHoverRef,
      polyEdgeHoverRef,
      polyVertexHoverRef,
      captureStartRef,
      captureNowRef,
      captureResizeRef,
      selectBoxStartRef,
      selectBoxNowRef,
      clearPolyHover,
      clearShape,
      clearCapture,
      resetEditDrag,
    }),
    [],
  );
}
