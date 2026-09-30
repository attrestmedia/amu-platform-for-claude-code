"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Clipboard, Copy, Grid, Redo2, Scissors, Undo2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Lang, lang } from "components/module/i18n";
import { Button, Checkbox, Dialog, DialogContent, DialogHeader, DialogTitle, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@amu-labs/ui";
import { CanvasDrawingApp, type CanvasDrawingAppHandle } from "components/template/canvas-drawing/CanvasDrawingApp";
import type { NormalizedFrameGuide } from "components/template/canvas-drawing/CanvasDrawingTypes";
import type { ExportedPngResult } from "components/template/canvas-drawing/hooks/useExportPng";
import { SpritePostProductionOverlays } from "components/template/canvas-drawing/modules/sprite/SpritePostProductionOverlays";
import { SpritePostProductionPanel } from "components/template/canvas-drawing/modules/sprite/SpritePostProductionPanel";
import type {
  SpriteNormalizationSummary,
  SpritePostProductionConfig,
} from "components/template/canvas-drawing/modules/sprite/SpritePostProductionTypes";
import { useSpritePostProduction } from "components/template/canvas-drawing/modules/sprite/useSpritePostProduction";
import {
  clearImageRegion,
  pasteImageRegion,
  removeBorderConnectedBackground,
  type BackgroundKeyMode,
} from "./imagePostProcess";

type ImageOverlayDrawingDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageSrc: string;
  imageName?: string;
  allowArtifactSave?: boolean;
  defaultArtifactName?: string;
  cropOnly?: boolean;
  startWithCrop?: boolean;
  cropAspectRatio?: number;
  titleText?: { ko: string; en: string };
  regionCaptureLabel?: { ko: string; en: string };
  cropRegionLabel?: { ko: string; en: string };
  applyLabel?: ReactNode;
  applyingLabel?: ReactNode;
  disabled?: boolean;
  postProductionMode?: boolean;
  frameGuide?: NormalizedFrameGuide | null;
  spritePostProduction?: SpritePostProductionConfig | null;
  onApply: (
    file: File,
    options: {
      saveArtifact: boolean;
      artifactName: string;
      spriteNormalization: SpriteNormalizationSummary | null;
    },
  ) => Promise<void> | void;
};

type ImageTransformType = "flipX" | "flipY" | "rotateCcw" | "rotateCw";

async function loadEditableImage(src: string) {
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("image_transform_load_failed"));
    image.src = src;
  });
}

async function transformImageSrc(src: string, transform: ImageTransformType) {
  const image = await loadEditableImage(src);
  const sourceWidth = Math.max(1, image.naturalWidth || image.width || 1);
  const sourceHeight = Math.max(1, image.naturalHeight || image.height || 1);
  const rotated = transform === "rotateCcw" || transform === "rotateCw";
  const canvas = document.createElement("canvas");
  canvas.width = rotated ? sourceHeight : sourceWidth;
  canvas.height = rotated ? sourceWidth : sourceHeight;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("image_transform_canvas_unavailable");

  if (transform === "flipX") {
    context.translate(canvas.width, 0);
    context.scale(-1, 1);
    context.drawImage(image, 0, 0, sourceWidth, sourceHeight);
  } else if (transform === "flipY") {
    context.translate(0, canvas.height);
    context.scale(1, -1);
    context.drawImage(image, 0, 0, sourceWidth, sourceHeight);
  } else if (transform === "rotateCw") {
    context.translate(canvas.width, 0);
    context.rotate(Math.PI / 2);
    context.drawImage(image, 0, 0, sourceWidth, sourceHeight);
  } else {
    context.translate(0, canvas.height);
    context.rotate(-Math.PI / 2);
    context.drawImage(image, 0, 0, sourceWidth, sourceHeight);
  }

  return {
    dataUrl: canvas.toDataURL("image/png"),
    width: canvas.width,
    height: canvas.height,
  };
}

export function ImageOverlayDrawingDialog({
  open,
  onOpenChange,
  imageSrc,
  imageName,
  allowArtifactSave = false,
  defaultArtifactName = "",
  cropOnly = false,
  startWithCrop = false,
  cropAspectRatio,
  titleText,
  regionCaptureLabel,
  cropRegionLabel,
  applyLabel,
  applyingLabel,
  disabled = false,
  postProductionMode = false,
  frameGuide,
  spritePostProduction,
  onApply,
}: ImageOverlayDrawingDialogProps) {
  const canvasApiRef = useRef<CanvasDrawingAppHandle | null>(null);
  const [imageSize, setImageSize] = useState({ width: 1024, height: 1024 });
  const [isApplying, setIsApplying] = useState(false);
  const [editedImageSrc, setEditedImageSrc] = useState(imageSrc);
  const [editedImageName, setEditedImageName] = useState(imageName);
  const [editorVersion, setEditorVersion] = useState(0);
  const [saveArtifact, setSaveArtifact] = useState(false);
  const [captureMode, setCaptureMode] = useState<"none" | "selecting" | "ready">("none");
  const [initialCropPending, setInitialCropPending] = useState(startWithCrop);
  const [isCropping, setIsCropping] = useState(false);
  const [postProcessing, setPostProcessing] = useState(false);
  const [clipboardImage, setClipboardImage] = useState<string | null>(null);
  const [guideVisible, setGuideVisible] = useState(Boolean(frameGuide));
  const [backgroundKeyMode, setBackgroundKeyMode] = useState<BackgroundKeyMode>("auto");
  const [backgroundTolerance, setBackgroundTolerance] = useState(28);
  const [bitmapUndo, setBitmapUndo] = useState<string[]>([]);
  const [bitmapRedo, setBitmapRedo] = useState<string[]>([]);

  const cropActive = cropOnly || captureMode !== "none";
  const cropReady = captureMode === "ready";
  const interactionDisabled = disabled || isApplying || isCropping || postProcessing;

  const commitEditedImage = useCallback(
    (nextSource: string, nextName?: string) => {
      setBitmapUndo((current) => [...current.slice(-19), editedImageSrc]);
      setBitmapRedo([]);
      setEditedImageSrc(nextSource);
      if (nextName) setEditedImageName(nextName);
      setEditorVersion((prev) => prev + 1);
    },
    [editedImageSrc],
  );
  const spriteGuide = frameGuide || { columns: 1, rows: 1, anchorX: 0.5, anchorY: 0.88 };
  const spriteController = useSpritePostProduction({
    imageSrc: editedImageSrc,
    guide: spriteGuide,
    onCommit: commitEditedImage,
  });

  useEffect(() => {
    if (!open || !editedImageSrc) return;

    let active = true;
    const image = new Image();
    image.onload = () => {
      if (!active) return;
      setImageSize({
        width: Math.max(1, image.naturalWidth || image.width || 1),
        height: Math.max(1, image.naturalHeight || image.height || 1),
      });
    };
    image.src = editedImageSrc;

    return () => {
      active = false;
    };
  }, [editedImageSrc, open]);

  const exportFileName = useMemo(() => {
    const rawName = String(editedImageName || "overlay-reference").trim();
    const normalized = rawName.replace(/\.[a-z0-9]+$/i, "");
    return `${normalized || "overlay-reference"}-overlay.png`;
  }, [editedImageName]);

  const cropFileName = useMemo(() => {
    const rawName = String(editedImageName || "overlay-reference").trim();
    const normalized = rawName.replace(/\.[a-z0-9]+$/i, "");
    return `${normalized || "overlay-reference"}-crop.png`;
  }, [editedImageName]);

  const handleCropRegion = useCallback(
    async (result: ExportedPngResult) => {
      setInitialCropPending(false);
      commitEditedImage(result.dataUrl, cropFileName);
      setImageSize({ width: result.width, height: result.height });
    },
    [commitEditedImage, cropFileName],
  );

  const handleApply = async () => {
    if (!canvasApiRef.current || interactionDisabled) return;

    setIsApplying(true);
    try {
      const result = cropOnly
        ? await canvasApiRef.current.exportCaptureRegion({ filename: cropFileName })
        : await canvasApiRef.current.exportPng(undefined, {
            download: false,
            filename: exportFileName,
          });
      if (!result) return;

      const file = new File([result.blob], result.filename, {
        type: result.blob.type || "image/png",
      });

      await onApply(file, {
        saveArtifact: allowArtifactSave && saveArtifact,
        artifactName: defaultArtifactName.trim(),
        spriteNormalization: spriteController.lastNormalization,
      });
      onOpenChange(false);
    } finally {
      setIsApplying(false);
    }
  };

  const handleCropConfirm = async () => {
    if (!canvasApiRef.current || captureMode !== "ready") return;
    setInitialCropPending(false);
    setIsCropping(true);
    try {
      await canvasApiRef.current.cropCaptureRegion();
    } finally {
      setIsCropping(false);
    }
  };

  const handleCropCancel = () => {
    if (cropOnly) {
      onOpenChange(false);
      return;
    }
    setInitialCropPending(false);
    canvasApiRef.current?.clearCaptureMode();
  };

  const handleImageTransform = useCallback(
    async (transform: ImageTransformType) => {
      if (isApplying || disabled) return;
      const result = await transformImageSrc(editedImageSrc, transform);
      commitEditedImage(result.dataUrl);
      setImageSize({ width: result.width, height: result.height });
    },
    [commitEditedImage, disabled, editedImageSrc, isApplying],
  );

  const handleBitmapUndo = () => {
    const previous = bitmapUndo.at(-1);
    if (!previous) return;
    setBitmapUndo((current) => current.slice(0, -1));
    setBitmapRedo((current) => [...current.slice(-19), editedImageSrc]);
    setEditedImageSrc(previous);
    setEditorVersion((current) => current + 1);
  };

  const handleBitmapRedo = () => {
    const next = bitmapRedo.at(-1);
    if (!next) return;
    setBitmapRedo((current) => current.slice(0, -1));
    setBitmapUndo((current) => [...current.slice(-19), editedImageSrc]);
    setEditedImageSrc(next);
    setEditorVersion((current) => current + 1);
  };

  const handleCopyRegion = async () => {
    const result = await canvasApiRef.current?.exportCaptureRegion({ filename: "amu-asset-clipboard.png" });
    if (!result) return;
    setClipboardImage(result.dataUrl);
    toast.success(lang({ ko: "선택 영역을 스튜디오 클립보드에 복사했습니다.", en: "Copied the selection to the studio clipboard." }));
  };

  const handleCutRegion = async () => {
    const api = canvasApiRef.current;
    const region = api?.getCaptureRegion();
    if (!api || !region) return;
    setPostProcessing(true);
    try {
      const [selection, flattened] = await Promise.all([
        api.exportCaptureRegion({ filename: "amu-asset-clipboard.png" }),
        api.exportPng(undefined, { download: false, filename: exportFileName }),
      ]);
      if (!selection || !flattened) return;
      setClipboardImage(selection.dataUrl);
      commitEditedImage(
        await clearImageRegion(flattened.dataUrl, {
          x: region.x * flattened.coordinateScaleX,
          y: region.y * flattened.coordinateScaleY,
          w: region.w * flattened.coordinateScaleX,
          h: region.h * flattened.coordinateScaleY,
        }),
      );
      toast.success(lang({ ko: "선택 영역을 잘라냈습니다.", en: "Cut the selected region." }));
    } finally {
      setPostProcessing(false);
    }
  };

  const handlePasteRegion = async () => {
    const api = canvasApiRef.current;
    if (!api || !clipboardImage) return;
    setPostProcessing(true);
    try {
      const flattened = await api.exportPng(undefined, { download: false, filename: exportFileName });
      if (!flattened) return;
      const next = await pasteImageRegion({
        source: flattened.dataUrl,
        pastedSource: clipboardImage,
        region: (() => {
          const region = api.getCaptureRegion();
          return region
            ? {
                x: region.x * flattened.coordinateScaleX,
                y: region.y * flattened.coordinateScaleY,
                w: region.w * flattened.coordinateScaleX,
                h: region.h * flattened.coordinateScaleY,
              }
            : null;
        })(),
      });
      commitEditedImage(next);
      toast.success(lang({ ko: "클립보드 이미지를 붙였습니다.", en: "Pasted the clipboard image." }));
    } finally {
      setPostProcessing(false);
    }
  };

  const handleRemoveBackground = async () => {
    const api = canvasApiRef.current;
    if (!api) return;
    setPostProcessing(true);
    try {
      const flattened = await api.exportPng(undefined, { download: false, filename: exportFileName });
      if (!flattened) return;
      const result = await removeBorderConnectedBackground({
        source: flattened.dataUrl,
        mode: backgroundKeyMode,
        tolerance: backgroundTolerance,
      });
      commitEditedImage(result.dataUrl);
      toast.success(
        lang({
          ko: `배경과 연결된 ${result.removedPixels.toLocaleString()}px을 투명 처리했습니다.`,
          en: `Removed ${result.removedPixels.toLocaleString()} border-connected background pixels.`,
        }),
      );
    } catch (error) {
      toast.error(
        error instanceof Error && error.message === "image_post_process_too_large"
          ? lang({ ko: "후보정 가능한 최대 이미지 크기를 초과했습니다.", en: "The image exceeds the post-processing size limit." })
          : lang({ ko: "배경 제거에 실패했습니다.", en: "Background removal failed." }),
      );
    } finally {
      setPostProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (!interactionDisabled ? onOpenChange(next) : undefined)}>
      <DialogContent
        centered={false}
        hideClose
        disableOutsideClick
        className="z-[90]"
        overlayClassName="z-[80]"
        innerWrapClassName="h-full overflow-hidden p-0"
      >
        <div className="flex h-full flex-col bg-background">
          <DialogHeader className="border-b border-border/60 px-4 py-4 sm:px-5 sr-only">
            <DialogTitle className="text-base sm:text-lg">
              <Lang text={{ ko: "이미지 오버레이 편집", en: "Image overlay editing" }} />
            </DialogTitle>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-hidden">
            <CanvasDrawingApp
              key={editorVersion}
              embedded
              apiRef={canvasApiRef}
              backgroundImageSrc={editedImageSrc}
              fixedStageSize={imageSize}
              forceTransparentBackground
              zoomableViewport
              titleText={titleText || { ko: "이미지 편집", en: "Image editing" }}
              exportLabel={{ ko: "PNG 저장", en: "Save PNG" }}
              exportFileName={exportFileName}
              hideSizeControls
              hideBackgroundControls
              hideRegionSaveAction
              toolbarCollapsible
              onCropRegion={handleCropRegion}
              externalCaptureControls
              onCaptureModeChange={setCaptureMode}
              captureAspectRatio={cropAspectRatio}
              autoStartCapture={cropOnly || initialCropPending}
              regionCaptureLabel={regionCaptureLabel}
              cropRegionLabel={cropRegionLabel}
              imageTransformActions={{
                onFlipX: () => void handleImageTransform("flipX"),
                onFlipY: () => void handleImageTransform("flipY"),
                onRotateCcw: () => void handleImageTransform("rotateCcw"),
                onRotateCw: () => void handleImageTransform("rotateCw"),
              }}
              frameGuide={guideVisible ? frameGuide : null}
              stageOverlay={
                spritePostProduction && frameGuide ? (
                  <SpritePostProductionOverlays
                    imageSrc={editedImageSrc}
                    guide={frameGuide}
                    config={spritePostProduction}
                    controller={spriteController}
                  />
                ) : null
              }
              exportPixelRatio={1}
              preserveBackgroundResolution
            />
          </div>

          <div className="max-h-[52dvh] shrink-0 space-y-3 overflow-y-auto border-t border-border/60 px-4 py-3 sm:px-5">
            {spritePostProduction && frameGuide ? (
              <SpritePostProductionPanel
                imageSrc={editedImageSrc}
                guide={frameGuide}
                config={spritePostProduction}
                controller={spriteController}
                disabled={interactionDisabled}
              />
            ) : null}
            {postProductionMode ? (
              <div className="space-y-3 rounded-xl border border-border/60 bg-surface/60 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" className="min-h-11" disabled={interactionDisabled || !cropReady} onClick={() => void handleCopyRegion()}>
                    <Copy className="size-4" />
                    <Lang text={{ ko: "복사", en: "Copy" }} />
                  </Button>
                  <Button variant="outline" size="sm" className="min-h-11" disabled={interactionDisabled || !cropReady} onClick={() => void handleCutRegion()}>
                    <Scissors className="size-4" />
                    <Lang text={{ ko: "잘라내기", en: "Cut" }} />
                  </Button>
                  <Button variant="outline" size="sm" className="min-h-11" disabled={interactionDisabled || !clipboardImage} onClick={() => void handlePasteRegion()}>
                    <Clipboard className="size-4" />
                    <Lang text={{ ko: "붙여넣기", en: "Paste" }} />
                  </Button>
                  <Button variant="outline" size="icon-md" className="min-h-11 min-w-11" aria-label={lang({ ko: "비트맵 작업 실행 취소", en: "Undo bitmap operation" })} disabled={interactionDisabled || bitmapUndo.length === 0} onClick={handleBitmapUndo}>
                    <Undo2 className="size-4" />
                  </Button>
                  <Button variant="outline" size="icon-md" className="min-h-11 min-w-11" aria-label={lang({ ko: "비트맵 작업 다시 실행", en: "Redo bitmap operation" })} disabled={interactionDisabled || bitmapRedo.length === 0} onClick={handleBitmapRedo}>
                    <Redo2 className="size-4" />
                  </Button>
                  {frameGuide ? (
                    <Button variant={guideVisible ? "secondary" : "outline"} size="sm" className="min-h-11" disabled={interactionDisabled} onClick={() => setGuideVisible((current) => !current)}>
                      <Grid className="size-4" />
                      <Lang text={{ ko: "프레임 가이드", en: "Frame guide" }} />
                    </Button>
                  ) : null}
                </div>

                <div className="grid gap-2 sm:grid-cols-[10rem_minmax(10rem,1fr)_auto] sm:items-end">
                  <label className="space-y-1 text-xs font-medium">
                    <span><Lang text={{ ko: "배경 기준", en: "Background key" }} /></span>
                    <Select value={backgroundKeyMode} onValueChange={(value) => setBackgroundKeyMode(value as BackgroundKeyMode)}>
                      <SelectTrigger className="min-h-11"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto"><Lang text={{ ko: "모서리 자동", en: "Auto corners" }} /></SelectItem>
                        <SelectItem value="white"><Lang text={{ ko: "흰색", en: "White" }} /></SelectItem>
                        <SelectItem value="magenta"><Lang text={{ ko: "마젠타", en: "Magenta" }} /></SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                  <label className="space-y-1 text-xs font-medium">
                    <span><Lang text={{ ko: `허용 오차 ${backgroundTolerance}`, en: `Tolerance ${backgroundTolerance}` }} /></span>
                    <input className="h-11 w-full accent-primary" type="range" min={0} max={120} value={backgroundTolerance} onChange={(event) => setBackgroundTolerance(Number(event.target.value))} />
                  </label>
                  <Button variant="outline" className="min-h-11" disabled={interactionDisabled} onClick={() => void handleRemoveBackground()}>
                    <Wand2 className="size-4" />
                    <Lang text={{ ko: postProcessing ? "처리 중..." : "배경 제거", en: postProcessing ? "Processing..." : "Remove background" }} />
                  </Button>
                </div>
                <p className="text-xs leading-5 text-muted-foreground">
                  <Lang text={{ ko: "복사·잘라내기는 먼저 상단의 영역 선택 도구로 범위를 지정합니다. 배경 제거는 모서리와 연결된 유사 색상만 투명 처리해 내부 흰색/마젠타 디테일을 보존합니다.", en: "Choose a region with the selection tool before copy or cut. Background removal only clears similar colors connected to the image border, preserving interior detail." }} />
                </p>
              </div>
            ) : null}
            {allowArtifactSave && !cropActive ? (
              <div className="rounded-xl border border-border/60 bg-surface/60 p-3">
                <label className="flex cursor-pointer items-start gap-2 text-sm text-primary-text">
                  <Checkbox
                    checked={saveArtifact}
                    onCheckedChange={(checked) => setSaveArtifact(checked === true)}
                    disabled={isApplying}
                  />
                  <span>
                    <Lang
                      text={{
                        ko: "이 스케치를 캐릭터 프로필 artifact로 저장",
                        en: "Save this sketch as a character profile artifact",
                      }}
                    />
                    <span className="mt-1 block text-xs text-secondary-text">
                      <Lang
                        text={{
                          ko: "내 캐릭터 프로필에서만 표시됩니다.",
                          en: "It will only appear in your character profile.",
                        }}
                      />
                    </span>
                  </span>
                </label>
              </div>
            ) : null}

            <div className="flex items-center gap-2">
              {cropActive && !cropOnly ? (
                <>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={handleCropCancel}
                    disabled={isCropping || disabled}
                  >
                    <Lang text={{ ko: "취소", en: "Cancel" }} />
                  </Button>
                  <Button
                    variant="primary"
                    className="flex-1"
                    onClick={() => void handleCropConfirm()}
                    disabled={!cropReady || isCropping || disabled}
                  >
                    <Lang
                      text={{
                        ko: isCropping ? "자르는 중..." : "자르기 적용",
                        en: isCropping ? "Cropping..." : "Apply crop",
                      }}
                    />
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => onOpenChange(false)}
                    disabled={interactionDisabled}
                  >
                    <Lang text={{ ko: "닫기", en: "Close" }} />
                  </Button>
                  <Button
                    variant="primary"
                    className="flex-1"
                    onClick={() => void handleApply()}
                    disabled={interactionDisabled || (cropOnly && !cropReady)}
                  >
                    {isApplying
                      ? applyingLabel || <Lang text={{ ko: "적용 중...", en: "Applying..." }} />
                      : applyLabel || <Lang text={{ ko: "적용", en: "Apply" }} />}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
