"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { NormalizedFrameGuide } from "../../CanvasDrawingTypes";
import {
  analyzeSpriteFramePixels,
  normalizeSpriteFramePixels,
  retargetSpriteFrameAnalysis,
  type SpriteFrameAnalysis,
  type SpritePixelSource,
} from "./spriteFrameProcessing";
import type { SpriteNormalizationSummary } from "./SpritePostProductionTypes";

const MAX_SPRITE_PROCESS_PIXELS = 4096 * 4096;

async function loadSpritePixelSource(src: string): Promise<SpritePixelSource> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const next = new Image();
    next.crossOrigin = "anonymous";
    next.onload = () => resolve(next);
    next.onerror = () => reject(new Error("sprite_image_load_failed"));
    next.src = src;
  });
  const width = Math.max(1, image.naturalWidth || image.width || 1);
  const height = Math.max(1, image.naturalHeight || image.height || 1);
  if (width * height > MAX_SPRITE_PROCESS_PIXELS) throw new Error("sprite_image_too_large");

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("sprite_canvas_unavailable");
  context.drawImage(image, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height);
  return { data: pixels.data, width, height };
}

function pixelsToDataUrl(source: SpritePixelSource) {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("sprite_canvas_unavailable");
  const imageData = context.createImageData(source.width, source.height);
  imageData.data.set(source.data);
  context.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

function nextPaint() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

export function useSpritePostProduction({
  imageSrc,
  guide,
  onCommit,
}: {
  imageSrc: string;
  guide: NormalizedFrameGuide;
  onCommit: (nextSource: string) => void;
}) {
  const [activeRowState, setActiveRow] = useState(0);
  const [activeFrameState, setActiveFrame] = useState(0);
  const [onionVisible, setOnionVisible] = useState(false);
  const [bibleVisible, setBibleVisible] = useState(false);
  const [alignmentVisible, setAlignmentVisible] = useState(false);
  const [analysisRecord, setAnalysisRecord] = useState<{ key: string; value: SpriteFrameAnalysis } | null>(null);
  const [targetRecord, setTargetRecord] = useState<{
    guideKey: string;
    anchor: { x: number; y: number };
    referenceFrameIndex: number;
  } | null>(null);
  const [processing, setProcessing] = useState<"analyze" | "normalize" | null>(null);
  const [errorRecord, setErrorRecord] = useState<{ key: string; value: string } | null>(null);
  const [normalizationRecord, setNormalizationRecord] = useState<{
    key: string;
    value: SpriteNormalizationSummary;
  } | null>(null);
  const pixelCacheRef = useRef<{ key: string; source: SpritePixelSource } | null>(null);
  const guideKey = `${guide.columns}:${guide.rows}:${guide.anchorX ?? 0.5}:${guide.anchorY ?? 0.88}`;
  const sourceKey = `${imageSrc}:${guideKey}`;
  const activeRow = Math.min(Math.max(0, Number(guide.rows) - 1), activeRowState);
  const activeFrame = Math.min(Math.max(0, Number(guide.columns) - 1), activeFrameState);
  const analysis = analysisRecord?.key === sourceKey ? analysisRecord.value : null;
  const targetAnchor = targetRecord?.guideKey === guideKey ? targetRecord.anchor : null;
  const referenceFrameIndex = targetRecord?.guideKey === guideKey ? targetRecord.referenceFrameIndex : null;
  const lastNormalization = normalizationRecord?.key === sourceKey ? normalizationRecord.value : null;
  const error = errorRecord?.key === sourceKey ? errorRecord.value : "";
  const effectiveAlignmentVisible = Boolean(analysis && alignmentVisible);

  const getPixels = useCallback(async () => {
    if (pixelCacheRef.current?.key === sourceKey) return pixelCacheRef.current.source;
    const source = await loadSpritePixelSource(imageSrc);
    pixelCacheRef.current = { key: sourceKey, source };
    return source;
  }, [imageSrc, sourceKey]);

  const runAnalysis = useCallback(async () => {
    if (analysis) {
      setAlignmentVisible(true);
      return analysis;
    }
    setProcessing("analyze");
    setErrorRecord(null);
    await nextPaint();
    try {
      const source = await getPixels();
      const next = analyzeSpriteFramePixels(source, guide, targetAnchor ? { targetAnchor } : undefined);
      setAnalysisRecord({ key: sourceKey, value: next });
      setAlignmentVisible(true);
      return next;
    } catch (caught) {
      setErrorRecord({
        key: sourceKey,
        value: caught instanceof Error ? caught.message : "sprite_analysis_failed",
      });
      return null;
    } finally {
      setProcessing(null);
    }
  }, [analysis, getPixels, guide, sourceKey, targetAnchor]);

  const selectReferenceFrame = useCallback(() => {
    const metric = analysis?.frames[activeRow * Math.max(1, analysis.columns) + activeFrame];
    if (!analysis || !metric || metric.empty) return;
    const target = {
      x: metric.pivotX / analysis.cellWidth,
      y: metric.pivotY / analysis.cellHeight,
    };
    setTargetRecord({ guideKey, anchor: target, referenceFrameIndex: metric.index });
    setAnalysisRecord({ key: sourceKey, value: retargetSpriteFrameAnalysis(analysis, target) });
  }, [activeFrame, activeRow, analysis, guideKey, sourceKey]);

  const resetReferenceFrame = useCallback(() => {
    const target = { x: Number(guide.anchorX ?? 0.5), y: Number(guide.anchorY ?? 0.88) };
    setTargetRecord(null);
    if (analysis) {
      setAnalysisRecord({ key: sourceKey, value: retargetSpriteFrameAnalysis(analysis, target) });
    }
  }, [analysis, guide.anchorX, guide.anchorY, sourceKey]);

  const normalizeFrames = useCallback(async () => {
    setProcessing("normalize");
    setErrorRecord(null);
    await nextPaint();
    try {
      const source = await getPixels();
      const result = normalizeSpriteFramePixels(source, guide, targetAnchor ? { targetAnchor } : undefined);
      const nextSource = pixelsToDataUrl(result);
      const summary: SpriteNormalizationSummary = {
        normalizedFrames: result.changedFrames,
        beforeMeanDriftPx: result.before.meanDriftPx,
        beforeMaxDriftPx: result.before.maxDriftPx,
        afterMeanDriftPx: result.after.meanDriftPx,
        afterMaxDriftPx: result.after.maxDriftPx,
        targetAnchorX: result.after.targetAnchorX,
        targetAnchorY: result.after.targetAnchorY,
      };
      pixelCacheRef.current = {
        key: `${nextSource}:${guideKey}`,
        source: { data: result.data, width: result.width, height: result.height },
      };
      const nextSourceKey = `${nextSource}:${guideKey}`;
      setAnalysisRecord({ key: nextSourceKey, value: result.after });
      setAlignmentVisible(true);
      setNormalizationRecord({ key: nextSourceKey, value: summary });
      onCommit(nextSource);
      return summary;
    } catch (caught) {
      setErrorRecord({
        key: sourceKey,
        value: caught instanceof Error ? caught.message : "sprite_normalize_failed",
      });
      return null;
    } finally {
      setProcessing(null);
    }
  }, [getPixels, guide, guideKey, onCommit, sourceKey, targetAnchor]);

  const selectedMetric = useMemo(
    () => analysis?.frames[activeRow * Math.max(1, analysis.columns) + activeFrame] || null,
    [activeFrame, activeRow, analysis],
  );

  return {
    activeRow,
    activeFrame,
    onionVisible,
    bibleVisible,
    alignmentVisible: effectiveAlignmentVisible,
    analysis,
    selectedMetric,
    referenceFrameIndex,
    processing,
    error,
    lastNormalization,
    setActiveRow,
    setActiveFrame,
    setOnionVisible,
    setBibleVisible,
    setAlignmentVisible,
    runAnalysis,
    selectReferenceFrame,
    resetReferenceFrame,
    normalizeFrames,
  };
}

export type SpritePostProductionController = ReturnType<typeof useSpritePostProduction>;
