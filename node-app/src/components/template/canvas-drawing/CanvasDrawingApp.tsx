"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DrawingToolbar } from "./modules/DrawingToolbar";
import { CommentLayer } from "./modules/CommentLayer";
import { CursorOverlay, getStageCursorStyle } from "./modules/CursorOverlay";
import { NormalizedFrameGuideOverlay } from "./modules/NormalizedFrameGuideOverlay";
import { CanvasZoomControls, CaptureActionBar, CaptureRegionOverlay } from "./modules/CanvasFloatingControls";
import { DrawingDraftDialogs } from "./modules/DrawingDraftDialogs";

import type { CursorIcon, CursorMode, Point, Tool } from "./CanvasDrawingTypes";
import {
  CAPTURE_HANDLE_HIT_PX,
  getCaptureResizeHandle,
  getCheckerboardStyle,
} from "./utils";

import { useDrawingDoc } from "./hooks/useDrawingDoc";
import { useStageCanvas } from "./hooks/useStageCanvas";
import { useSnapGuides } from "./hooks/useSnapGuides";
import { useCanvasDrawingRefs } from "./hooks/useCanvasDrawingRefs";
import { useOverlayRenderer } from "./hooks/useOverlayRenderer";
import { useCommentDrag } from "./hooks/useCommentDrag";
import { useCanvasPointerHandlers } from "./hooks/useCanvasPointerHandlers";
import { useDrawingShortcuts } from "./hooks/useDrawingShortcuts";
import { useExportPng } from "./hooks/useExportPng";
import { useCanvasStageViewport } from "./hooks/useCanvasStageViewport";
import { useCanvasDrafts } from "./hooks/useCanvasDrafts";
import { useCanvasCapture } from "./hooks/useCanvasCapture";
import { useCanvasPanMode } from "./hooks/useCanvasPanMode";
import { useCanvasSelectionActions } from "./hooks/useCanvasSelectionActions";
import { useCanvasStageSettings } from "./hooks/useCanvasStageSettings";
import type { CanvasDrawingAppProps } from "./CanvasDrawingApp.types";

export type { CanvasDrawingAppHandle } from "./CanvasDrawingApp.types";

type DrawTool = Extract<Tool, "pen" | "rect" | "triangle" | "ellipse" | "polygon">;

export function CanvasDrawingApp({
  embedded = false,
  backgroundImageSrc,
  fixedStageSize,
  forceTransparentBackground = false,
  titleText,
  exportLabel,
  exportFileName,
  hideSizeControls = false,
  hideBackgroundControls = false,
  hideCursorControls = false,
  hideRegionCapture = false,
  hideRegionSaveAction = false,
  showTransparentCheckerboard = true,
  toolbarCollapsible = false,
  onClose,
  zoomableViewport = false,
  regionCaptureLabel,
  cropRegionLabel,
  apiRef,
  onExportResult,
  onCropRegion,
  externalCaptureControls = false,
  onCaptureModeChange,
  captureAspectRatio,
  autoStartCapture = false,
  imageTransformActions,
  frameGuide,
  stageOverlay,
  exportPixelRatio,
  preserveBackgroundResolution,
}: CanvasDrawingAppProps = {}) {
  const stageSettings = useCanvasStageSettings({ fixedStageSize, embedded, forceTransparentBackground, backgroundImageSrc });
  const { bgColor, bgMode, fixedH, fixedW, setBgColor, setBgMode, setFixedH, setFixedW, setSizeMode, sizeMode } = stageSettings;

  const [tool, setTool] = useState<Tool>("pen");
  const [drawTool, setDrawTool] = useState<DrawTool>("pen");
  const [penSize, setPenSize] = useState(3);
  const [penColor, setPenColor] = useState("#ef4444");

  const [cursorMode, setCursorMode] = useState<CursorMode>("icon");
  const [cursorIcon, setCursorIcon] = useState<CursorIcon>("brush");
  const [cursorPos, setCursorPos] = useState<Point | null>(null);

  const docApi = useDrawingDoc({ items: [], comments: [] });
  // stage ref들은 컴포넌트에서 생성해 JSX에 직접 전달 — useStageCanvas는 이를 받아 imperative 로직만 담당
  const [rootElement, setRootElement] = useState<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageApi = useStageCanvas({
    sizeMode: zoomableViewport ? "parent" : sizeMode,
    fixedW,
    fixedH,
    docRef: docApi.docRef,
    stageRef,
    baseCanvasRef,
    overlayCanvasRef,
  });
  const snapApi = useSnapGuides();
  const refs = useCanvasDrawingRefs();
  const cancelCanvasInteractionRef = useRef<() => void>(() => undefined);
  const stageViewport = useCanvasStageViewport({
    enabled: zoomableViewport,
    aspectRatio: fixedW / Math.max(1, fixedH),
    stageRef,
    onPinchStart: () => cancelCanvasInteractionRef.current(),
  });

  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedCommentId, setSelectedCommentId] = useState<string | null>(null);

  const [polyPoints, setPolyPoints] = useState<Point[]>([]);
  const [snapEnabled, setSnapEnabled] = useState(false);
  const [guideEnabled, setGuideEnabled] = useState(true);

  const overlayApi = useOverlayRenderer({
    tool,
    selectedItemId,
    polyPointsPx: polyPoints,
    penSize,
    penColor,
    guideEnabled,
    docRef: docApi.docRef,
    stageRef: stageRef,
    overlayCtxRef: stageApi.overlayCtxRef,
    guidesRef: snapApi.guidesRef,
    polyEdgeHoverRef: refs.polyEdgeHoverRef,
    shapeStartRef: refs.shapeStartRef,
    shapeNowRef: refs.shapeNowRef,
    shapeKeepCircleRef: refs.shapeKeepCircleRef,
    polyHoverRef: refs.polyHoverRef,
    selectBoxStartRef: refs.selectBoxStartRef,
    selectBoxNowRef: refs.selectBoxNowRef,
  });

  const commentDrag = useCommentDrag({
    stageRef: stageRef,
    docRef: docApi.docRef,
    applyReplace: docApi.applyReplace,
    applyPush: docApi.applyPush,
  });

  const { exportPng } = useExportPng({
    stageRef: stageRef,
    baseCanvasRef: baseCanvasRef,
    docRef: docApi.docRef,
    bgMode,
    bgColor,
    backgroundImageSrc,
    pixelRatio: exportPixelRatio,
    preserveBackgroundResolution,
  });

  const labelFontSize = useMemo(() => Math.max(14, Math.round(penSize * 2)), [penSize]);
  const drafts = useCanvasDrafts({ stageRef, docApi, penColor, labelFontSize });

  const handleExport = useCallback(
    async (
      region?: { x: number; y: number; w: number; h: number },
      options?: { download?: boolean; filename?: string },
    ) => {
      const result = await exportPng(region, {
        filename: options?.filename || exportFileName,
        download: options?.download,
      });
      if (result) {
        await onExportResult?.(result);
      }
      return result;
    },
    [exportPng, exportFileName, onExportResult],
  );

  const capture = useCanvasCapture({
    refs,
    stageRef,
    handleExport,
    exportFileName,
    onCropRegion,
    apiRef,
    onCaptureModeChange,
    autoStartCapture,
    captureAspectRatio,
  });
  const { captureMode, setCaptureMode, clearCaptureMode } = capture;

  const pan = useCanvasPanMode({
    enabled: zoomableViewport,
    captureMode,
    tool,
    draftOpen: drafts.commentDraftOpen || drafts.textDraftOpen,
    cancelInteractionRef: cancelCanvasInteractionRef,
  });
  const { panActive, isPanning, setIsPanning } = pan;
  const captureHandleScale = zoomableViewport ? stageViewport.zoom : 1;
  const captureHandleSize = 10 / captureHandleScale;
  const captureHandleBorderWidth = 2 / captureHandleScale;
  const captureHandle =
    captureMode === "ready" && cursorPos && refs.captureStartRef.current && refs.captureNowRef.current
      ? getCaptureResizeHandle(
          cursorPos,
          refs.captureStartRef.current,
          refs.captureNowRef.current,
          CAPTURE_HANDLE_HIT_PX / captureHandleScale,
        )
      : null;
  const stageCursor = refs.captureResizeRef.current
    ? "grabbing"
    : captureHandle
      ? "grab"
      : getStageCursorStyle({ cursorMode, cursorIcon, tool, capturing: captureMode !== "none" });

  const selectionActions = useCanvasSelectionActions({
    selectedItemId,
    selectedCommentId,
    setSelectedItemId,
    setSelectedCommentId,
    setPolyPoints,
    docApi,
    stageApi,
    overlayApi,
    snapApi,
    refs,
  });
  const { clearAll, deleteSelected } = selectionActions;

  const pointer = useCanvasPointerHandlers({
    tool,
    penSize,
    penColor,
    snapEnabled,
    captureAspectRatio,
    interactionBlockedRef: stageViewport.interactionBlockedRef,
    polyPoints,
    setPolyPoints,
    setCursorPos,
    selectedItemId,
    setSelectedItemId,
    setSelectedCommentId,
    captureMode,
    setCaptureMode,
    commentDraftPointRef: drafts.commentDraftPointRef,
    commentDraftTargetIdRef: drafts.commentDraftTargetIdRef,
    setCommentDraftOpen: drafts.setCommentDraftOpen,
    setCommentDraftText: drafts.setCommentDraftText,
    textDraftPointRef: drafts.textDraftPointRef,
    setTextDraftOpen: drafts.setTextDraftOpen,
    setTextDraftText: drafts.setTextDraftText,
    stageRef: stageRef,
    baseCtxRef: stageApi.baseCtxRef,
    docRef: docApi.docRef,
    applyReplace: docApi.applyReplace,
    applyPush: docApi.applyPush,
    renderBase: stageApi.renderBase,
    clearGuides: snapApi.clearGuides,
    snapRectMove: snapApi.snapRectMove,
    snapPointMove: snapApi.snapPointMove,
    renderOverlayPreview: overlayApi.renderOverlayPreview,
    clearOverlay: overlayApi.clearOverlay,
    refs: {
      isPointerDownRef: refs.isPointerDownRef,
      activePointerIdRef: refs.activePointerIdRef,
      strokeStartedRef: refs.strokeStartedRef,
      lastPointRef: refs.lastPointRef,
      strokePointsRef: refs.strokePointsRef,
      shapeStartRef: refs.shapeStartRef,
      shapeNowRef: refs.shapeNowRef,
      shapeKeepCircleRef: refs.shapeKeepCircleRef,
      editDragRef: refs.editDragRef,
      polyHoverRef: refs.polyHoverRef,
      polyEdgeHoverRef: refs.polyEdgeHoverRef,
      polyVertexHoverRef: refs.polyVertexHoverRef,
      captureStartRef: refs.captureStartRef,
      captureNowRef: refs.captureNowRef,
      captureResizeRef: refs.captureResizeRef,
      selectBoxStartRef: refs.selectBoxStartRef,
      selectBoxNowRef: refs.selectBoxNowRef,
    },
  });

  useEffect(() => {
    cancelCanvasInteractionRef.current = pointer.cancelActiveInteraction;
  }, [pointer.cancelActiveInteraction]);

  useDrawingShortcuts({
    tool,
    selectedItemId,
    selectedCommentId,
    polyVertexHoverRef: refs.polyVertexHoverRef,
    stageRef: stageRef,
    docRef: docApi.docRef,
    applyPush: docApi.applyPush,
    undo: () => {
      const next = docApi.undo();
      if (next) stageApi.renderBase(next);
      overlayApi.clearOverlay();
      return next;
    },
    redo: () => {
      const next = docApi.redo();
      if (next) stageApi.renderBase(next);
      overlayApi.clearOverlay();
      return next;
    },
    deleteSelected,
  });

  const bgStyle = useMemo(() => {
    if (backgroundImageSrc) return { backgroundColor: "transparent" } as React.CSSProperties;
    if (bgMode === "transparent") {
      return showTransparentCheckerboard
        ? getCheckerboardStyle(true)
        : ({ backgroundColor: "transparent" } as React.CSSProperties);
    }
    if (bgMode === "white") return { backgroundColor: "#ffffff" } as React.CSSProperties;
    return { backgroundColor: bgColor } as React.CSSProperties;
  }, [backgroundImageSrc, bgMode, bgColor, showTransparentCheckerboard]);

  const rootClass = embedded ? "h-full w-full" : sizeMode === "window" ? "fixed inset-0 z-50" : "w-full";
  const stageStyle: React.CSSProperties = zoomableViewport
    ? stageViewport.stageStyle
    : sizeMode === "fixed"
      ? { width: `${fixedW}px`, height: `${fixedH}px` }
      : { width: "100%", height: "100%" };

  return (
    <div ref={setRootElement} data-canvas-drawing-root className={`${rootClass} relative flex flex-col`}>
      <DrawingToolbar
        floatingUiPortalContainer={rootElement}
        sizeMode={sizeMode}
        setSizeMode={(v) => {
          setSizeMode(v);
          overlayApi.clearOverlay();
        }}
        fixedW={fixedW}
        fixedH={fixedH}
        setFixedW={setFixedW}
        setFixedH={setFixedH}
        bgMode={bgMode}
        setBgMode={setBgMode}
        bgColor={bgColor}
        setBgColor={setBgColor}
        tool={tool}
        drawToolValue={drawTool}
        setTool={(next) => {
          setTool(next);

          if (next === "pen" || next === "rect" || next === "triangle" || next === "ellipse" || next === "polygon") {
            setDrawTool(next);
          }

          overlayApi.clearOverlay();
          setPolyPoints([]);
          refs.clearPolyHover();
          refs.clearShape();
          refs.resetEditDrag();
          setSelectedCommentId(null);
          if (next !== "select") setSelectedItemId(null);
        }}
        penSize={penSize}
        setPenSize={setPenSize}
        penColor={penColor}
        setPenColor={setPenColor}
        cursorMode={cursorMode}
        setCursorMode={setCursorMode}
        cursorIcon={cursorIcon}
        setCursorIcon={setCursorIcon}
        canUndo={docApi.canUndo}
        canRedo={docApi.canRedo}
        polygonUi={{
          active: tool === "polygon",
          points: polyPoints.length,
          onCancel: () => {
            setPolyPoints([]);
            refs.clearPolyHover();
            overlayApi.clearOverlay();
          },
          onDone: pointer.commitPolygon,
        }}
        snapEnabled={snapEnabled}
        setSnapEnabled={(v) => {
          setSnapEnabled(v);
          if (!v) snapApi.clearGuides();
          overlayApi.renderOverlayPreview();
        }}
        guideEnabled={guideEnabled}
        setGuideEnabled={(v) => {
          setGuideEnabled(v);
          if (!v) snapApi.clearGuides();
          overlayApi.renderOverlayPreview();
        }}
        onUndo={() => {
          const next = docApi.undo();
          if (next) stageApi.renderBase(next);
          overlayApi.clearOverlay();
        }}
        onRedo={() => {
          const next = docApi.redo();
          if (next) stageApi.renderBase(next);
          overlayApi.clearOverlay();
        }}
        onClearAll={clearAll}
        onDeleteSelected={deleteSelected}
        onExportPng={() => {
          void handleExport();
        }}
        onStartRegionCapture={() => {
          if (captureMode === "none") {
            setCaptureMode("selecting");
            refs.clearCapture();
            return;
          }

          clearCaptureMode();
        }}
        regionCaptureActive={captureMode !== "none"}
        titleText={titleText}
        exportLabel={exportLabel}
        regionCaptureLabel={regionCaptureLabel}
        hideSizeControls={hideSizeControls}
        hideBackgroundControls={hideBackgroundControls || forceTransparentBackground || Boolean(backgroundImageSrc)}
        hideCursorControls={hideCursorControls}
        hideRegionCapture={hideRegionCapture}
        collapsible={toolbarCollapsible}
        enableHandTool={zoomableViewport}
        onClose={onClose}
        imageTransformActions={imageTransformActions}
      />

      <div
        className={`relative flex-1 ${
          embedded
            ? "min-h-0"
            : sizeMode === "window"
              ? "h-[calc(100dvh-170px)] md:h-[calc(100dvh-140px)]"
              : "min-h-[420px]"
        }`}
      >
        <div
          ref={zoomableViewport ? stageViewport.viewportRef : undefined}
          className={
            zoomableViewport
              ? "absolute inset-0 overflow-hidden overscroll-contain bg-muted/20 touch-none"
              : "h-full w-full"
          }
          onWheel={zoomableViewport ? stageViewport.handleWheel : undefined}
          onPointerDownCapture={zoomableViewport ? stageViewport.handlePointerDownCapture : undefined}
          onPointerMoveCapture={zoomableViewport ? stageViewport.handlePointerMoveCapture : undefined}
          onPointerUpCapture={zoomableViewport ? stageViewport.handlePointerEndCapture : undefined}
          onPointerCancelCapture={zoomableViewport ? stageViewport.handlePointerEndCapture : undefined}
        >
          <div
            className={zoomableViewport ? "relative" : "h-full w-full"}
            style={zoomableViewport ? stageViewport.sizerStyle : undefined}
          >
            <div
              ref={stageRef}
              style={{ ...stageStyle, ...bgStyle }}
              className={`relative overflow-hidden border shadow-sm ${
                zoomableViewport ? "will-change-transform" : "mx-auto h-full w-full"
              }`}
            >
              {backgroundImageSrc ? (
                // 편집기 배경은 업로드 직후 data/blob URL도 즉시 표시해야 하므로 Next Image 최적화 경로를 우회한다.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={backgroundImageSrc}
                  alt="drawing-base"
                  data-export-ignore="true"
                  className="pointer-events-none absolute inset-0 h-full w-full object-fill select-none"
                  draggable={false}
                />
              ) : null}

              <canvas
                ref={baseCanvasRef}
                className="absolute inset-0 touch-none"
                style={{ cursor: stageCursor }}
                onPointerDown={pointer.onPointerDown}
                onPointerMove={pointer.onPointerMove}
                onPointerUp={pointer.onPointerUpOrCancel}
                onPointerCancel={pointer.onPointerUpOrCancel}
                onDoubleClick={pointer.onDoubleClick}
              />

              <canvas ref={overlayCanvasRef} className="pointer-events-none absolute inset-0" />

              {stageOverlay}

              {frameGuide ? <NormalizedFrameGuideOverlay guide={frameGuide} /> : null}

              {captureMode === "none" && !panActive && (
                <CursorOverlay mode={cursorMode} tool={tool} penSize={penSize} pos={cursorPos} />
              )}

              <CommentLayer
                stageRef={stageRef}
                comments={docApi.present.comments}
                selectedCommentId={selectedCommentId}
                onSelect={(id) => {
                  setSelectedCommentId(id);
                  setSelectedItemId(null);
                  overlayApi.clearOverlay();
                }}
                onDelete={(id) => {
                  docApi.applyPush({
                    ...docApi.docRef.current,
                    comments: docApi.docRef.current.comments.filter((c) => c.id !== id),
                  });
                  setSelectedCommentId(null);
                }}
                onPointerDownPin={commentDrag.onPointerDownPin}
                onPointerDownBubble={commentDrag.onPointerDownBubble}
              />

              {panActive && (
                <div
                  data-export-ignore="true"
                  className="absolute inset-0 z-[45] touch-none"
                  style={{ cursor: isPanning ? "grabbing" : "grab" }}
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    setIsPanning(true);
                    stageViewport.beginPan(e);
                  }}
                  onPointerMove={stageViewport.movePan}
                  onPointerUp={(e) => {
                    setIsPanning(false);
                    stageViewport.endPan(e);
                  }}
                  onPointerCancel={(e) => {
                    setIsPanning(false);
                    stageViewport.endPan(e);
                  }}
                />
              )}

              {captureMode !== "none" ? (
                <CaptureRegionOverlay
                  start={refs.captureStartRef.current}
                  now={refs.captureNowRef.current}
                  handleSize={captureHandleSize}
                  borderWidth={captureHandleBorderWidth}
                />
              ) : null}
            </div>
          </div>
        </div>

        {captureMode !== "none" ? (
          <CaptureActionBar
            captureMode={captureMode}
            canCrop={Boolean(onCropRegion)}
            externalControls={externalCaptureControls}
            hideSave={hideRegionSaveAction}
            cropLabel={cropRegionLabel}
            onCrop={() => void capture.cropCaptureRegion()}
            onSave={() => void capture.exportCaptureRegion()}
            onClear={clearCaptureMode}
          />
        ) : null}

        {zoomableViewport ? (
          <CanvasZoomControls
            zoom={stageViewport.zoom}
            canZoomOut={stageViewport.canZoomOut}
            canZoomIn={stageViewport.canZoomIn}
            onZoomOut={stageViewport.zoomOut}
            onReset={stageViewport.resetZoom}
            onZoomIn={stageViewport.zoomIn}
          />
        ) : null}
      </div>

      <DrawingDraftDialogs
        commentOpen={drafts.commentDraftOpen}
        commentValue={drafts.commentDraftText}
        commentTextareaRef={drafts.commentTextareaRef}
        onCommentChange={drafts.setCommentDraftText}
        onCommentClose={drafts.closeCommentDraft}
        onCommentSubmit={drafts.addCommentAtDraftPoint}
        textOpen={drafts.textDraftOpen}
        textValue={drafts.textDraftText}
        textTextareaRef={drafts.textTextareaRef}
        onTextChange={drafts.setTextDraftText}
        onTextClose={drafts.closeTextDraft}
        onTextSubmit={drafts.addTextAtDraftPoint}
        labelFontSize={labelFontSize}
        penColor={penColor}
      />
    </div>
  );
}
