import type React from "react";
import type { NormalizedFrameGuide } from "./CanvasDrawingTypes";
import type { ExportedPngResult } from "./hooks/useExportPng";

export type CanvasDrawingCaptureRegion = { x: number; y: number; w: number; h: number };

export type CanvasDrawingAppHandle = {
  exportPng: (
    region?: CanvasDrawingCaptureRegion,
    options?: { download?: boolean; filename?: string },
  ) => Promise<ExportedPngResult | null>;
  exportCaptureRegion: (options?: { filename?: string }) => Promise<ExportedPngResult | null>;
  cropCaptureRegion: () => Promise<void>;
  clearCaptureMode: () => void;
  getCaptureRegion: () => CanvasDrawingCaptureRegion | null;
};

export type CanvasDrawingAppProps = {
  embedded?: boolean;
  backgroundImageSrc?: string | null;
  fixedStageSize?: { width: number; height: number } | null;
  forceTransparentBackground?: boolean;
  titleText?: { ko: string; en: string };
  exportLabel?: { ko: string; en: string };
  exportFileName?: string;
  hideSizeControls?: boolean;
  hideBackgroundControls?: boolean;
  hideCursorControls?: boolean;
  hideRegionCapture?: boolean;
  hideRegionSaveAction?: boolean;
  showTransparentCheckerboard?: boolean;
  toolbarCollapsible?: boolean;
  onClose?: () => void;
  zoomableViewport?: boolean;
  regionCaptureLabel?: { ko: string; en: string };
  cropRegionLabel?: { ko: string; en: string };
  apiRef?: React.RefObject<CanvasDrawingAppHandle | null>;
  onExportResult?: (result: ExportedPngResult) => void | Promise<void>;
  onCropRegion?: (result: ExportedPngResult) => void | Promise<void>;
  externalCaptureControls?: boolean;
  onCaptureModeChange?: (mode: "none" | "selecting" | "ready") => void;
  captureAspectRatio?: number;
  autoStartCapture?: boolean;
  imageTransformActions?: {
    onFlipX: () => void;
    onFlipY: () => void;
    onRotateCcw: () => void;
    onRotateCw: () => void;
  };
  frameGuide?: NormalizedFrameGuide | null;
  stageOverlay?: React.ReactNode;
  exportPixelRatio?: number;
  preserveBackgroundResolution?: boolean;
};
