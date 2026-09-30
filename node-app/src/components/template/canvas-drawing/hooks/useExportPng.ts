"use client";

import html2canvas from "html2canvas-pro";
import type { DrawingDoc } from "../CanvasDrawingTypes";
import { canvasToBlob, downloadBlob, getCanvasStageMetrics, renderDocToBase } from "../utils";
import { logger } from "utils/log";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

async function nextFrame() {
  await new Promise((r) => requestAnimationFrame(() => r(null)));
}

function patchStyle(el: HTMLElement, patch: Record<string, string | null | undefined>) {
  const style = el.style as unknown as Record<string, string>;
  const prev: Record<string, string> = {};
  for (const k of Object.keys(patch)) {
    prev[k] = style[k] ?? "";
    const v = patch[k];
    style[k] = v == null ? "" : v;
  }
  return () => {
    for (const k of Object.keys(prev)) style[k] = prev[k];
  };
}

type ExportRegion = { x: number; y: number; w: number; h: number };
type ExportOptions = {
  download?: boolean;
  filename?: string;
};

export type ExportedPngResult = {
  blob: Blob;
  filename: string;
  dataUrl: string;
  region?: ExportRegion;
  width: number;
  height: number;
  coordinateScaleX: number;
  coordinateScaleY: number;
};

async function loadImage(src: string) {
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

export function useExportPng(args: {
  stageRef: React.RefObject<HTMLDivElement | null>;
  baseCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  docRef: { current: DrawingDoc };
  bgMode: "white" | "color" | "transparent";
  bgColor: string;
  backgroundImageSrc?: string | null;
  pixelRatio?: number;
  preserveBackgroundResolution?: boolean;
}) {
  const exportPng = async (region?: ExportRegion, options?: ExportOptions): Promise<ExportedPngResult | null> => {
    const stage = args.stageRef.current;
    const base = args.baseCanvasRef.current;
    if (!stage || !base) return null;

    await nextFrame();

    // 폰트 로딩 대기(코멘트 텍스트 등 안정화)
    try {
      const fontsReady = (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts?.ready;
      if (fontsReady) await fontsReady;
    } catch {}

    const stageMetrics = getCanvasStageMetrics(stage);
    const stageRect = stageMetrics.rect;
    const stageWidth = stageMetrics.width;
    const stageHeight = stageMetrics.height;
    const configuredPixelRatio = Number(args.pixelRatio);
    const configuredOutputScale = Number.isFinite(configuredPixelRatio) && configuredPixelRatio > 0
      ? configuredPixelRatio
      : window.devicePixelRatio || 1;
    const baseScaleX = base.width / Math.max(1, stageWidth);
    const baseScaleY = base.height / Math.max(1, stageHeight);

    let backgroundImage: HTMLImageElement | null = null;
    if (args.backgroundImageSrc) {
      try {
        backgroundImage = await loadImage(args.backgroundImageSrc);
      } catch (err) {
        logger.warn("[exportPng] background image load failed:", err);
      }
    }

    const preserveBackgroundResolution = Boolean(args.preserveBackgroundResolution && backgroundImage);
    const naturalWidth = Math.max(1, backgroundImage?.naturalWidth || backgroundImage?.width || stageWidth);
    const naturalHeight = Math.max(1, backgroundImage?.naturalHeight || backgroundImage?.height || stageHeight);
    const coordinateScaleX = preserveBackgroundResolution ? naturalWidth / Math.max(1, stageWidth) : configuredOutputScale;
    const coordinateScaleY = preserveBackgroundResolution ? naturalHeight / Math.max(1, stageHeight) : configuredOutputScale;

    // region을 stage 안으로 클램프 (CSS px 기준)
    const rx = clamp(region?.x ?? 0, 0, stageWidth);
    const ry = clamp(region?.y ?? 0, 0, stageHeight);
    const rw = clamp(region?.w ?? stageWidth, 1, stageWidth - rx);
    const rh = clamp(region?.h ?? stageHeight, 1, stageHeight - ry);

    // 최종 출력 캔버스(픽셀 기준)
    const out = document.createElement("canvas");
    out.width = Math.max(1, Math.round(rw * coordinateScaleX));
    out.height = Math.max(1, Math.round(rh * coordinateScaleY));
    const outCtx = out.getContext("2d");
    if (!outCtx) return null;

    // =========================================================
    // 1) 배경 처리
    // =========================================================
    if (args.bgMode === "white") {
      outCtx.fillStyle = "#ffffff";
      outCtx.fillRect(0, 0, out.width, out.height);
    } else if (args.bgMode === "color") {
      outCtx.fillStyle = args.bgColor;
      outCtx.fillRect(0, 0, out.width, out.height);
    }

    if (backgroundImage) {
      try {
        const logicalStageWidth = Math.max(1, stageWidth);
        const logicalStageHeight = Math.max(1, stageHeight);
        const bgSx = (rx / logicalStageWidth) * naturalWidth;
        const bgSy = (ry / logicalStageHeight) * naturalHeight;
        const bgSw = (rw / logicalStageWidth) * naturalWidth;
        const bgSh = (rh / logicalStageHeight) * naturalHeight;

        outCtx.drawImage(backgroundImage, bgSx, bgSy, bgSw, bgSh, 0, 0, out.width, out.height);
      } catch (err) {
        logger.warn("[exportPng] background image draw failed:", err);
      }
    } else if (args.bgMode === "transparent") {
      // transparent: "뒤 DOM(UI)"를 캡쳐해서 out에 깔아야 함
      // 핵심: stage만 숨기면 뒤 UI가 아니라 '캔버스 앱 전체 오버레이'가 남아있을 수 있음.
      // 그래서 stage가 속한 "fixed 전체 덮는 루트"를 찾아 잠깐 숨김.
      const overlayRoot =
        (stage.closest("[data-canvas-drawing-root]") as HTMLElement | null) ||
        (stage.closest(".fixed") as HTMLElement | null); // fallback (가능하면 data-* 붙이는 걸 추천)

      const restoreOverlay = overlayRoot
        ? patchStyle(overlayRoot, { visibility: "hidden", pointerEvents: "none" })
        : null;

      try {
        await nextFrame();

        const scrollX = window.scrollX || window.pageXOffset || 0;
        const scrollY = window.scrollY || window.pageYOffset || 0;

        // "뷰포트 좌표"로 캡쳐되도록 scrollX/scrollY를 음수로 고정
        const captureX = stageRect.left + rx * stageMetrics.scaleX;
        const captureY = stageRect.top + ry * stageMetrics.scaleY;

        const bgCanvas = await html2canvas(document.body, {
          backgroundColor: null,
          scale: configuredOutputScale,
          useCORS: true,
          logging: false,
          removeContainer: true,

          // crop
          x: captureX,
          y: captureY,
          width: rw,
          height: rh,

          // 중요: viewport 기준 캡쳐로 고정
          scrollX: -scrollX,
          scrollY: -scrollY,
          windowWidth: document.documentElement.clientWidth,
          windowHeight: document.documentElement.clientHeight,
        });

        // 배경을 out에 깔기
        outCtx.drawImage(bgCanvas, 0, 0, out.width, out.height);
      } catch (err) {
        logger.warn("[exportPng] background(dom) capture failed:", err);
        // 실패하면 그냥 "진짜 투명"으로 진행
      } finally {
        restoreOverlay?.();
        await nextFrame();
      }
    }

    // =========================================================
    // 2) 드로잉(base canvas) 합성
    // =========================================================
    if (preserveBackgroundResolution) {
      const drawingCanvas = document.createElement("canvas");
      drawingCanvas.width = naturalWidth;
      drawingCanvas.height = naturalHeight;
      const drawingContext = drawingCanvas.getContext("2d");
      if (drawingContext) {
        renderDocToBase(drawingContext, args.docRef.current, naturalWidth, naturalHeight);
        outCtx.drawImage(
          drawingCanvas,
          rx * coordinateScaleX,
          ry * coordinateScaleY,
          rw * coordinateScaleX,
          rh * coordinateScaleY,
          0,
          0,
          out.width,
          out.height,
        );
      }
    } else {
      const sx = Math.floor(rx * baseScaleX);
      const sy = Math.floor(ry * baseScaleY);
      const sw = Math.max(1, Math.floor(rw * baseScaleX));
      const sh = Math.max(1, Math.floor(rh * baseScaleY));
      outCtx.drawImage(base, sx, sy, sw, sh, 0, 0, out.width, out.height);
    }

    // =========================================================
    // 3) DOM 오버레이(코멘트 등) 합성
    //    - 캔버스는 이미 base로 합성했으니 제외
    //    - 중요한 포인트: stage 배경(체커보드 등)이 overlay 캡쳐에 섞이면
    //      뒤 UI를 덮어버릴 수 있으므로, overlay 캡쳐 순간에 stage 배경을 제거
    // =========================================================
    const restoreStageBg = patchStyle(stage, {
      background: "transparent",
      backgroundColor: "transparent",
      backgroundImage: "none",
    });
    const restoreStageTransform = patchStyle(stage, { transform: "none" });

    try {
      await nextFrame();

      const overlayDom = await html2canvas(stage, {
        backgroundColor: null,
        scale: preserveBackgroundResolution
          ? Math.max(coordinateScaleX, coordinateScaleY)
          : configuredOutputScale,
        useCORS: true,
        logging: false,
        removeContainer: true,

        // stage 내부 crop (CSS px)
        x: rx,
        y: ry,
        width: rw,
        height: rh,

        // 캔버스는 제외 (중복/검은 배경/편집 오버레이 방지)
        ignoreElements: (el) => {
          const tag = (el as HTMLElement)?.tagName;
          if (tag === "CANVAS") return true;
          const he = el as HTMLElement;
          // 필요 시, export 제외하고 싶은 DOM에 data-export-ignore="true" 부여
          if (he?.dataset?.exportIgnore === "true") return true;
          return false;
        },
      });

      outCtx.drawImage(overlayDom, 0, 0, out.width, out.height);
    } catch (err) {
      logger.warn("[exportPng] overlay(dom) capture failed:", err);
    } finally {
      restoreStageTransform();
      restoreStageBg();
    }

    // =========================================================
    // 4) 저장
    // =========================================================
    const blob = await canvasToBlob(out, "image/png");
    if (!blob) return null;

    const filename = String(options?.filename || `drawing-${Date.now()}.png`).trim() || `drawing-${Date.now()}.png`;
    if (options?.download !== false) {
      downloadBlob(blob, filename);
    }

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    return {
      blob,
      filename,
      dataUrl,
      region,
      width: out.width,
      height: out.height,
      coordinateScaleX,
      coordinateScaleY,
    };
  };

  return { exportPng };
}
