"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { canvasDrawingClamp } from "../utils";

const MIN_STAGE_ZOOM = 0.5;
const MAX_STAGE_ZOOM = 4;
const STAGE_ZOOM_STEP = 0.25;

type PointerPoint = { x: number; y: number };

function getPointerDistance(a: PointerPoint, b: PointerPoint) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function getPointerMidpoint(a: PointerPoint, b: PointerPoint) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function useCanvasStageViewport(args: {
  enabled: boolean;
  aspectRatio: number;
  stageRef: React.RefObject<HTMLDivElement | null>;
  onPinchStart: () => void;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const interactionBlockedRef = useRef(false);
  const pointersRef = useRef(new Map<number, PointerPoint>());
  const pinchRef = useRef({
    initialDistance: 0,
    initialZoom: 1,
    anchorX: 0.5,
    anchorY: 0.5,
  });
  const zoomRef = useRef(1);
  const panOffsetRef = useRef({ x: 0, y: 0 });
  const panRef = useRef({ active: false, pointerId: -1, startX: 0, startY: 0, panX: 0, panY: 0 });

  const [zoom, setZoomState] = useState(1);
  const [stageSize, setStageSize] = useState({ width: 1, height: 1 });

  const setZoomStateAndRef = useCallback((nextZoom: number) => {
    const clamped = canvasDrawingClamp(nextZoom, MIN_STAGE_ZOOM, MAX_STAGE_ZOOM);
    zoomRef.current = clamped;
    setZoomState(clamped);
    return clamped;
  }, []);

  useEffect(() => {
    if (!args.enabled) return;
    const viewport = viewportRef.current;
    if (!viewport) return;

    const applyFit = () => {
      // clientWidth/clientHeight는 스크롤바 출현 시 값이 바뀌어
      // ResizeObserver → fit 재계산 → 스크롤바 토글 루프를 만들 수 있다.
      const viewportRect = viewport.getBoundingClientRect();
      const width = Math.max(1, viewportRect.width);
      const height = Math.max(1, viewportRect.height);
      const ratio = Math.max(0.0001, args.aspectRatio);
      const fittedWidth = Math.min(width, height * ratio);
      const fittedHeight = fittedWidth / ratio;
      const nextStageSize = {
        width: Math.max(1, Math.floor(fittedWidth)),
        height: Math.max(1, Math.floor(fittedHeight)),
      };

      setStageSize((current) =>
        current.width === nextStageSize.width && current.height === nextStageSize.height ? current : nextStageSize,
      );
    };

    const observer = new ResizeObserver(applyFit);
    observer.observe(viewport);
    applyFit();
    return () => observer.disconnect();
  }, [args.aspectRatio, args.enabled]);

  const applyPanOffset = useCallback((x: number, y: number) => {
    panOffsetRef.current = { x, y };
    const stage = args.stageRef.current;
    if (!stage) return;
    stage.style.setProperty("--canvas-pan-x", `${x}px`);
    stage.style.setProperty("--canvas-pan-y", `${y}px`);
  }, [args.stageRef]);

  const restoreZoomAnchor = useCallback((anchor: { clientX: number; clientY: number; x: number; y: number }) => {
    requestAnimationFrame(() => {
      const stage = args.stageRef.current;
      if (!stage) return;

      const nextRect = stage.getBoundingClientRect();
      applyPanOffset(
        panOffsetRef.current.x + anchor.clientX - (nextRect.left + nextRect.width * anchor.x),
        panOffsetRef.current.y + anchor.clientY - (nextRect.top + nextRect.height * anchor.y),
      );
    });
  }, [applyPanOffset, args.stageRef]);

  const setZoomAt = useCallback(
    (nextZoom: number, clientX?: number, clientY?: number) => {
      const viewport = viewportRef.current;
      const stage = args.stageRef.current;
      const next = canvasDrawingClamp(nextZoom, MIN_STAGE_ZOOM, MAX_STAGE_ZOOM);
      if (!viewport || !stage || Math.abs(next - zoomRef.current) < 0.001) return;

      const stageRect = stage.getBoundingClientRect();
      const viewportRect = viewport.getBoundingClientRect();
      const anchorClientX = clientX ?? viewportRect.left + viewportRect.width / 2;
      const anchorClientY = clientY ?? viewportRect.top + viewportRect.height / 2;
      const anchor = {
        clientX: anchorClientX,
        clientY: anchorClientY,
        x: canvasDrawingClamp((anchorClientX - stageRect.left) / Math.max(stageRect.width, 1), 0, 1),
        y: canvasDrawingClamp((anchorClientY - stageRect.top) / Math.max(stageRect.height, 1), 0, 1),
      };

      setZoomStateAndRef(next);
      restoreZoomAnchor(anchor);
    },
    [args.stageRef, restoreZoomAnchor, setZoomStateAndRef],
  );

  const resetZoom = useCallback(() => setZoomAt(1), [setZoomAt]);
  const zoomIn = useCallback(() => setZoomAt(zoomRef.current + STAGE_ZOOM_STEP), [setZoomAt]);
  const zoomOut = useCallback(() => setZoomAt(zoomRef.current - STAGE_ZOOM_STEP), [setZoomAt]);

  const handleWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      if (!args.enabled) return;
      event.preventDefault();
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      const factor = Math.exp(-delta * 0.0015);
      setZoomAt(zoomRef.current * factor, event.clientX, event.clientY);
    },
    [args.enabled, setZoomAt],
  );

  const handlePointerDownCapture = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!args.enabled || event.pointerType !== "touch") return;

      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointersRef.current.size !== 2) return;

      const [first, second] = Array.from(pointersRef.current.values());
      const stageRect = args.stageRef.current?.getBoundingClientRect();
      const midpoint = getPointerMidpoint(first, second);

      interactionBlockedRef.current = true;
      args.onPinchStart();
      pinchRef.current = {
        initialDistance: Math.max(1, getPointerDistance(first, second)),
        initialZoom: zoomRef.current,
        anchorX: stageRect
          ? canvasDrawingClamp((midpoint.x - stageRect.left) / Math.max(stageRect.width, 1), 0, 1)
          : 0.5,
        anchorY: stageRect
          ? canvasDrawingClamp((midpoint.y - stageRect.top) / Math.max(stageRect.height, 1), 0, 1)
          : 0.5,
      };
    },
    [args],
  );

  const handlePointerMoveCapture = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!pointersRef.current.has(event.pointerId)) return;
      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointersRef.current.size !== 2 || !interactionBlockedRef.current) return;

      event.preventDefault();
      event.stopPropagation();

      const [first, second] = Array.from(pointersRef.current.values());
      const midpoint = getPointerMidpoint(first, second);
      const pinch = pinchRef.current;
      const nextZoom = pinch.initialZoom * (getPointerDistance(first, second) / Math.max(1, pinch.initialDistance));

      setZoomStateAndRef(nextZoom);
      restoreZoomAnchor({
        clientX: midpoint.x,
        clientY: midpoint.y,
        x: pinch.anchorX,
        y: pinch.anchorY,
      });
    },
    [restoreZoomAnchor, setZoomStateAndRef],
  );

  const handlePointerEndCapture = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.delete(event.pointerId);

    if (pointersRef.current.size === 0) {
      interactionBlockedRef.current = false;
      pinchRef.current.initialDistance = 0;
    }
  }, []);

  const beginPan = useCallback((event: React.PointerEvent) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    panRef.current = {
      active: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      panX: panOffsetRef.current.x,
      panY: panOffsetRef.current.y,
    };
    try {
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    } catch {}
  }, []);

  const movePan = useCallback((event: React.PointerEvent) => {
    if (!panRef.current.active || panRef.current.pointerId !== event.pointerId) return;
    applyPanOffset(
      panRef.current.panX + event.clientX - panRef.current.startX,
      panRef.current.panY + event.clientY - panRef.current.startY,
    );
  }, [applyPanOffset]);

  const endPan = useCallback((event: React.PointerEvent) => {
    if (panRef.current.pointerId === event.pointerId) {
      panRef.current.active = false;
      panRef.current.pointerId = -1;
    }
    try {
      (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    } catch {}
  }, []);

  const layout = useMemo(() => {
    const scaledWidth = stageSize.width * zoom;
    const scaledHeight = stageSize.height * zoom;

    return {
      sizerStyle: {
        width: `max(100%, ${scaledWidth}px)`,
        height: `max(100%, ${scaledHeight}px)`,
      } as React.CSSProperties,
      stageStyle: {
        position: "absolute",
        width: stageSize.width,
        height: stageSize.height,
        left: `calc(max(0px, calc((100% - ${scaledWidth}px) / 2)) + var(--canvas-pan-x, 0px))`,
        top: `calc(max(0px, calc((100% - ${scaledHeight}px) / 2)) + var(--canvas-pan-y, 0px))`,
        transform: `scale(${zoom})`,
        transformOrigin: "top left",
      } as React.CSSProperties,
    };
  }, [stageSize.height, stageSize.width, zoom]);

  return {
    viewportRef,
    interactionBlockedRef,
    zoom,
    canZoomIn: zoom < MAX_STAGE_ZOOM - 0.001,
    canZoomOut: zoom > MIN_STAGE_ZOOM + 0.001,
    zoomIn,
    zoomOut,
    resetZoom,
    beginPan,
    movePan,
    endPan,
    handleWheel,
    handlePointerDownCapture,
    handlePointerMoveCapture,
    handlePointerEndCapture,
    ...layout,
  };
}
