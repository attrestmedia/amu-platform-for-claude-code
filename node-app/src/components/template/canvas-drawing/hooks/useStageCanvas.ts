"use client";

import { useEffect, useMemo, useRef } from "react";
import type { DrawingDoc } from "../CanvasDrawingTypes";
import { getCanvasStageMetrics, renderDocToBase } from "../utils";

export function useStageCanvas(args: {
  sizeMode: "fixed" | "parent" | "window";
  fixedW: number;
  fixedH: number;
  docRef: { current: DrawingDoc };
  // 외부에서 만든 ref 객체를 받아 hook에서 반환하는 ref가 render에 노출되지 않게 함
  stageRef: React.RefObject<HTMLDivElement | null>;
  baseCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  overlayCanvasRef: React.RefObject<HTMLCanvasElement | null>;
}) {
  const { stageRef, baseCanvasRef, overlayCanvasRef } = args;

  const baseCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const overlayCtxRef = useRef<CanvasRenderingContext2D | null>(null);

  const getStageRect = () => {
    const stage = stageRef.current;
    if (!stage) return null;
    return getCanvasStageMetrics(stage);
  };

  const clearOverlay = () => {
    const ctx = overlayCtxRef.current;
    const r = getStageRect();
    if (!ctx || !r) return;
    ctx.clearRect(0, 0, r.width, r.height);
  };

  const resizeCanvases = (cssW: number, cssH: number) => {
    const base = baseCanvasRef.current;
    const overlay = overlayCanvasRef.current;
    const baseCtx = baseCtxRef.current;
    const overlayCtx = overlayCtxRef.current;
    if (!base || !overlay || !baseCtx || !overlayCtx) return;

    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

    base.style.width = `${cssW}px`;
    base.style.height = `${cssH}px`;
    base.width = Math.max(1, Math.floor(cssW * dpr));
    base.height = Math.max(1, Math.floor(cssH * dpr));

    overlay.style.width = `${cssW}px`;
    overlay.style.height = `${cssH}px`;
    overlay.width = Math.max(1, Math.floor(cssW * dpr));
    overlay.height = Math.max(1, Math.floor(cssH * dpr));

    baseCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    overlayCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    overlayCtx.clearRect(0, 0, cssW, cssH);
    baseCtx.clearRect(0, 0, cssW, cssH);
    renderDocToBase(baseCtx, args.docRef.current, cssW, cssH);
  };

  const renderBase = (docToRender: DrawingDoc) => {
    const baseCtx = baseCtxRef.current;
    const r = getStageRect();
    if (!baseCtx || !r) return;
    renderDocToBase(baseCtx, docToRender, r.width, r.height);
  };

  // ctx init
  useEffect(() => {
    const base = baseCanvasRef.current;
    const overlay = overlayCanvasRef.current;
    if (!base || !overlay) return;

    const baseCtx = base.getContext("2d");
    const overlayCtx = overlay.getContext("2d");
    if (!baseCtx || !overlayCtx) return;

    baseCtx.lineCap = "round";
    baseCtx.lineJoin = "round";
    overlayCtx.lineCap = "round";
    overlayCtx.lineJoin = "round";

    baseCtxRef.current = baseCtx;
    overlayCtxRef.current = overlayCtx;
  }, [baseCanvasRef, overlayCanvasRef]);

  // ResizeObserver / fixed
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const apply = () => {
      const metrics = getCanvasStageMetrics(stage);
      resizeCanvases(Math.max(1, Math.floor(metrics.width)), Math.max(1, Math.floor(metrics.height)));
    };

    if (args.sizeMode === "fixed") {
      requestAnimationFrame(apply);
      return;
    }

    const ro = new ResizeObserver(() => apply());
    ro.observe(stage);
    requestAnimationFrame(apply);

    return () => ro.disconnect();
    // resizeCanvases / stageRef는 hook 내부 stable 참조
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [args.sizeMode]);

  useEffect(() => {
    if (args.sizeMode !== "fixed") return;
    const stage = stageRef.current;
    if (!stage) return;
    requestAnimationFrame(() => {
      const metrics = getCanvasStageMetrics(stage);
      resizeCanvases(Math.floor(metrics.width), Math.floor(metrics.height));
    });
    // resizeCanvases / stageRef는 hook 내부 stable 참조
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [args.sizeMode, args.fixedW, args.fixedH]);

  return useMemo(
    () => ({
      baseCtxRef,
      overlayCtxRef,
      getStageRect,
      resizeCanvases,
      clearOverlay,
      renderBase,
    }),
    // 내부 함수들은 hook 인스턴스 수명 동안 stable이므로 deps 누락은 의도된 것
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
}
