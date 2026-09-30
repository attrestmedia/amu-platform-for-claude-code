"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { CanvasDrawingAppHandle, CanvasDrawingCaptureRegion } from "../CanvasDrawingApp.types";
import type { Point } from "../CanvasDrawingTypes";
import { createCenteredAspectCapturePoints, getCanvasStageMetrics, normalizeCaptureRect } from "../utils";
import type { useCanvasDrawingRefs } from "./useCanvasDrawingRefs";
import type { ExportedPngResult } from "./useExportPng";

function readCaptureRegion(start: Point | null, now: Point | null): CanvasDrawingCaptureRegion | null {
  if (!start || !now) return null;
  const rect = normalizeCaptureRect(start, now);
  if (rect.width < 2 || rect.height < 2) return null;
  return { x: rect.left, y: rect.top, w: rect.width, h: rect.height };
}

export function useCanvasCapture({
  refs,
  stageRef,
  handleExport,
  exportFileName,
  onCropRegion,
  apiRef,
  onCaptureModeChange,
  autoStartCapture,
  captureAspectRatio,
}: {
  refs: ReturnType<typeof useCanvasDrawingRefs>;
  stageRef: RefObject<HTMLDivElement | null>;
  handleExport: (region?: CanvasDrawingCaptureRegion, options?: { download?: boolean; filename?: string }) => Promise<ExportedPngResult | null>;
  exportFileName?: string;
  onCropRegion?: (result: ExportedPngResult) => void | Promise<void>;
  apiRef?: RefObject<CanvasDrawingAppHandle | null>;
  onCaptureModeChange?: (mode: "none" | "selecting" | "ready") => void;
  autoStartCapture: boolean;
  captureAspectRatio?: number;
}) {
  const [captureMode, setCaptureMode] = useState<"none" | "selecting" | "ready">("none");

  const clearCaptureMode = useCallback(() => {
    setCaptureMode("none");
    refs.clearCapture();
  }, [refs]);

  const exportCaptureRegion = async () => {
    const region = readCaptureRegion(refs.captureStartRef.current, refs.captureNowRef.current);
    if (!region) return;
    clearCaptureMode();
    await handleExport(region);
  };

  const exportCaptureRegionFile = async (options?: { filename?: string }) => {
    const region = readCaptureRegion(refs.captureStartRef.current, refs.captureNowRef.current);
    if (!region) return null;
    return await handleExport(region, { download: false, filename: options?.filename || exportFileName });
  };

  const cropCaptureRegion = async () => {
    const region = readCaptureRegion(refs.captureStartRef.current, refs.captureNowRef.current);
    if (!region) return;
    const result = await handleExport(region, { download: false, filename: exportFileName });
    if (!result) return;
    clearCaptureMode();
    await onCropRegion?.(result);
  };

  const actionsRef = useRef({ cropCaptureRegion, exportCaptureRegionFile, clearCaptureMode });
  useEffect(function syncCaptureActions() {
    actionsRef.current = { cropCaptureRegion, exportCaptureRegionFile, clearCaptureMode };
  });

  useEffect(() => {
    if (!apiRef) return;
    apiRef.current = {
      exportPng: handleExport,
      exportCaptureRegion: (options) => actionsRef.current.exportCaptureRegionFile(options),
      cropCaptureRegion: () => actionsRef.current.cropCaptureRegion(),
      clearCaptureMode: () => actionsRef.current.clearCaptureMode(),
      getCaptureRegion: () => readCaptureRegion(refs.captureStartRef.current, refs.captureNowRef.current),
    };
    return () => {
      apiRef.current = null;
    };
  }, [apiRef, handleExport, refs.captureNowRef, refs.captureStartRef]);

  useEffect(() => {
    onCaptureModeChange?.(captureMode);
  }, [captureMode, onCaptureModeChange]);

  useEffect(() => {
    if (!autoStartCapture || captureMode !== "none") return;
    const frame = requestAnimationFrame(() => {
      const stage = stageRef.current;
      if (!stage) return;
      const metrics = getCanvasStageMetrics(stage);
      const region = captureAspectRatio
        ? createCenteredAspectCapturePoints({ bounds: metrics, aspectRatio: captureAspectRatio })
        : {
            start: { x: metrics.width * 0.09, y: metrics.height * 0.09 },
            now: { x: metrics.width * 0.91, y: metrics.height * 0.91 },
          };
      refs.captureStartRef.current = region.start;
      refs.captureNowRef.current = region.now;
      refs.captureResizeRef.current = null;
      setCaptureMode("ready");
    });
    return () => cancelAnimationFrame(frame);
  }, [autoStartCapture, captureAspectRatio, captureMode, refs, stageRef]);

  return {
    captureMode,
    clearCaptureMode,
    cropCaptureRegion,
    exportCaptureRegion,
    setCaptureMode,
  };
}
