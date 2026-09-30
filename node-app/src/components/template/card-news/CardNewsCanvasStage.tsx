"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { lang } from "components/module/i18n";
import type { CardNewsBox, CardNewsCard, CardNewsDeckPayload, CardNewsLayer } from "types/card-news";
import type { CardNewsPreparedScene } from "types/card-news/scene";
import { renderCardNewsCanvas } from "libs/card-news/export";
import { getCardNewsTextOverlayRect } from "libs/card-news/typography";
import { resizeCardNewsBoxByHandle, setCardNewsLayerBox, type CardNewsResizeHandle } from "libs/card-news/editor";

type TransformState = {
  pointerId: number;
  layerId: string;
  mode: "move" | "resize";
  resizeHandle?: CardNewsResizeHandle;
  startX: number;
  startY: number;
  startBox: CardNewsBox;
};

type CardNewsCanvasStageProps = {
  document: CardNewsDeckPayload;
  card: CardNewsCard;
  scene: CardNewsPreparedScene | null;
  sceneStatus: "idle" | "preparing" | "ready" | "error";
  selectedLayerId: string | null;
  textInputLayerId: string | null;
  textDraft: string;
  onSelectLayer: (layerId: string | null) => void;
  onBeginTransform: () => void;
  onUpdateTransform: (document: CardNewsDeckPayload) => void;
  onEndTransform: () => void;
  onBeginTextInput: (layerId: string) => void;
  onTextInputChange: (value: string, isComposing?: boolean) => void;
  onTextInputEnd: (cancel?: boolean) => void;
};

function percent(value: number) {
  return `${Math.max(0, Math.min(100, value * 100))}%`;
}

function getStagePoint(event: PointerEvent | React.PointerEvent, element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0,
    y: rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0,
  };
}

function getTextAreaStyle(layer: Extract<CardNewsLayer, { type: "text" }>, frameSize: CardNewsDeckPayload["frameSize"], width: number) {
  const scale = width / frameSize.w;
  const rect = getCardNewsTextOverlayRect({
    box: {
      x: layer.box.x * frameSize.w,
      y: layer.box.y * frameSize.h,
      w: layer.box.w * frameSize.w,
      h: layer.box.h * frameSize.h,
    },
    viewport: { left: 0, top: 0, scaleX: scale, scaleY: scale },
  });
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    fontFamily: `'${layer.fontFamily}', sans-serif`,
    fontSize: Math.max(12, layer.fontSize * scale),
    lineHeight: `${Math.max(1, layer.lineHeight * scale)}px`,
    letterSpacing: `${layer.letterSpacing * scale}px`,
    color: layer.color,
    textAlign: layer.align,
    wordBreak: layer.wordBreak === "keep-all" ? "keep-all" : "break-word",
  } as const;
}

function clearCardNewsCanvas(canvas: HTMLCanvasElement, cssWidth: number, cssHeight: number) {
  canvas.width = Math.max(1, Math.round(cssWidth));
  canvas.height = Math.max(1, Math.round(cssHeight));
  canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
}

const RESIZE_HANDLES: Array<{
  id: CardNewsResizeHandle;
  cursor: string;
  label: { ko: string; en: string };
}> = [
  { id: "nw", cursor: "nwse-resize", label: { ko: "왼쪽 위 모서리 크기 조절", en: "Resize from top-left corner" } },
  { id: "n", cursor: "ns-resize", label: { ko: "위쪽 변 크기 조절", en: "Resize from top edge" } },
  { id: "ne", cursor: "nesw-resize", label: { ko: "오른쪽 위 모서리 크기 조절", en: "Resize from top-right corner" } },
  { id: "e", cursor: "ew-resize", label: { ko: "오른쪽 변 크기 조절", en: "Resize from right edge" } },
  { id: "se", cursor: "nwse-resize", label: { ko: "오른쪽 아래 모서리 크기 조절", en: "Resize from bottom-right corner" } },
  { id: "s", cursor: "ns-resize", label: { ko: "아래쪽 변 크기 조절", en: "Resize from bottom edge" } },
  { id: "sw", cursor: "nesw-resize", label: { ko: "왼쪽 아래 모서리 크기 조절", en: "Resize from bottom-left corner" } },
  { id: "w", cursor: "ew-resize", label: { ko: "왼쪽 변 크기 조절", en: "Resize from left edge" } },
];

function getHandlePoint(box: CardNewsBox, handle: CardNewsResizeHandle) {
  return {
    x: handle.includes("w") ? box.x : handle.includes("e") ? box.x + box.w : box.x + box.w / 2,
    y: handle.includes("n") ? box.y : handle.includes("s") ? box.y + box.h : box.y + box.h / 2,
  };
}

export function CardNewsCanvasStage({
  document,
  card,
  scene,
  sceneStatus,
  selectedLayerId,
  textInputLayerId,
  textDraft,
  onSelectLayer,
  onBeginTransform,
  onUpdateTransform,
  onEndTransform,
  onBeginTextInput,
  onTextInputChange,
  onTextInputEnd,
}: CardNewsCanvasStageProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const stageSurfaceRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const transformRef = useRef<TransformState | null>(null);
  const moveTransformRef = useRef<(event: PointerEvent) => void>(() => undefined);
  const endTransformRef = useRef<() => void>(() => undefined);
  const [stageWidth, setStageWidth] = useState(0);

  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const updateSize = () => setStageWidth(Math.max(0, element.clientWidth));
    updateSize();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateSize);
    observer?.observe(element);
    return () => observer?.disconnect();
  }, []);

  useEffect(() => {
    if (!canvasRef.current || !stageWidth) return;
    const canvas = canvasRef.current;
    const cssHeight = stageWidth * document.frameSize.h / document.frameSize.w;
    clearCardNewsCanvas(canvas, stageWidth, cssHeight);
    if (!scene) return;
    try {
      renderCardNewsCanvas(scene, {
        canvas,
        surface: "display",
        cssWidth: stageWidth,
        cssHeight: stageWidth * scene.frameSize.h / scene.frameSize.w,
      });
    } catch {
      // 렌더링 실패 시 이전 프레임을 남기지 않고 상위 aria-live 상태로 안내한다.
      clearCardNewsCanvas(canvas, stageWidth, cssHeight);
    }
  }, [document.frameSize.h, document.frameSize.w, scene, stageWidth]);

  const endTransform = useCallback(() => {
    if (!transformRef.current) return;
    transformRef.current = null;
    onEndTransform();
  }, [onEndTransform]);

  const moveTransform = useCallback((event: PointerEvent) => {
    const transform = transformRef.current;
    const element = stageSurfaceRef.current;
    if (!transform || !element || event.pointerId !== transform.pointerId) return;
    const point = getStagePoint(event, element);
    const deltaX = point.x - transform.startX;
    const deltaY = point.y - transform.startY;
    const nextBox = transform.mode === "move"
      ? {
          ...transform.startBox,
          x: transform.startBox.x + deltaX,
          y: transform.startBox.y + deltaY,
        }
      : resizeCardNewsBoxByHandle(transform.startBox, { x: deltaX, y: deltaY }, transform.resizeHandle || "se");
    onUpdateTransform(setCardNewsLayerBox(document, card.cardId, transform.layerId, nextBox));
  }, [card.cardId, document, onUpdateTransform]);

  useEffect(() => {
    moveTransformRef.current = moveTransform;
    endTransformRef.current = endTransform;
  }, [endTransform, moveTransform]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => moveTransformRef.current(event);
    const handlePointerUp = (event: PointerEvent) => {
      if (transformRef.current?.pointerId !== event.pointerId) return;
      endTransformRef.current();
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, []);

  const startTransform = useCallback((event: React.PointerEvent, layer: CardNewsLayer, mode: "move" | "resize", resizeHandle?: CardNewsResizeHandle) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const element = stageSurfaceRef.current;
    if (!element) return;
    const point = getStagePoint(event, element);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    transformRef.current = {
      pointerId: event.pointerId,
      layerId: layer.id,
      mode,
      resizeHandle,
      startX: point.x,
      startY: point.y,
      startBox: { ...layer.box },
    };
    onSelectLayer(layer.id);
    onBeginTransform();
  }, [onBeginTransform, onSelectLayer]);

  const frameStyle = useMemo(() => ({ aspectRatio: `${document.frameSize.w} / ${document.frameSize.h}` }), [document.frameSize.h, document.frameSize.w]);
  const selectedLayer = selectedLayerId
    ? card.layers.find((layer) => layer.id === selectedLayerId) || null
    : null;

  return (
    <div
      ref={stageRef}
      className="relative w-full rounded-2xl border border-border/80 bg-surface-2 shadow-sm touch-manipulation"
      style={frameStyle}
      aria-busy={sceneStatus === "preparing"}
    >
      <div
        ref={stageSurfaceRef}
        className="absolute inset-0 overflow-hidden rounded-2xl"
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) onSelectLayer(null);
        }}
      >
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={card.altText || lang({ ko: `카드 ${card.order + 1} 미리보기`, en: `Preview of card ${card.order + 1}` })}
          className="absolute inset-0 block h-full w-full"
        />
        <div className="absolute inset-0" aria-label={lang({ ko: "카드 레이어 선택 영역", en: "Card layer selection area" })}>
          {card.layers.map((layer, index) => {
            const isSelected = selectedLayerId === layer.id;
            const isEditing = textInputLayerId === layer.id && layer.type === "text";
            const layerStyle = {
              left: percent(layer.box.x),
              top: percent(layer.box.y),
              width: percent(layer.box.w),
              height: percent(layer.box.h),
              zIndex: index + 1,
            };

            if (isEditing && layer.type === "text") {
              return (
                <textarea
                  key={layer.id}
                  autoFocus
                  value={textDraft}
                  aria-label={lang({ ko: "텍스트 레이어 편집", en: "Edit text layer" })}
                  className="absolute m-0 resize-none overflow-hidden rounded-md border-2 border-primary bg-background/90 p-2 shadow-lg outline-none ring-2 ring-primary/20"
                  style={stageWidth ? getTextAreaStyle(layer, document.frameSize, stageWidth) : layerStyle}
                  onChange={(event) => onTextInputChange(event.target.value, (event.nativeEvent as InputEvent).isComposing)}
                  onCompositionStart={() => undefined}
                  onCompositionEnd={(event) => onTextInputChange(event.currentTarget.value, false)}
                  onBlur={() => onTextInputEnd(false)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      onTextInputEnd(true);
                    }
                    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                      event.preventDefault();
                      onTextInputEnd(false);
                    }
                  }}
                />
              );
            }

            return (
              <button
                key={layer.id}
                type="button"
                aria-label={lang({
                  ko: `${layer.type === "text" ? "텍스트" : layer.type === "image" ? "이미지" : layer.type === "solid" ? "솔리드" : "도형"} 레이어 선택`,
                  en: `Select ${layer.type} layer`,
                })}
                title={lang({ ko: "드래그하여 레이어 이동", en: "Drag to move layer" })}
                aria-pressed={isSelected}
                className={`absolute cursor-move touch-none rounded-md border-2 bg-transparent transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  isSelected ? "border-primary bg-primary/10" : "border-transparent hover:border-primary/70"
                }`}
                style={layerStyle}
                onPointerDown={(event) => startTransform(event, layer, "move")}
                onDoubleClick={() => layer.type === "text" && onBeginTextInput(layer.id)}
                onClick={(event) => event.stopPropagation()}
              />
            );
          })}
        </div>
        {!scene && (sceneStatus === "preparing" || sceneStatus === "error") ? (
          <div className={`absolute inset-0 flex items-center justify-center bg-background/25 text-xs ${sceneStatus === "error" ? "text-danger" : "text-secondary-text"}`} role={sceneStatus === "error" ? "alert" : "status"}>
            {sceneStatus === "error"
              ? lang({ ko: "미리보기를 준비하지 못했어요", en: "Preview could not be prepared" })
              : lang({ ko: "준비 중", en: "Preparing" })}
          </div>
        ) : null}
      </div>
      {selectedLayer ? (
        <div className="pointer-events-none absolute inset-0" aria-label={lang({ ko: "선택한 레이어 이동 및 크기 조절 핸들", en: "Selected layer move and resize handles" })}>
          <button
            type="button"
            aria-label={lang({ ko: "선택한 레이어 이동 핸들", en: "Move selected layer" })}
            title={lang({ ko: "드래그하여 이동", en: "Drag to move" })}
            className="pointer-events-auto absolute z-50 flex h-11 w-14 -translate-x-1/2 -translate-y-1/2 cursor-move items-center justify-center bg-transparent text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring touch-none"
            style={{
              left: percent(selectedLayer.box.x + selectedLayer.box.w / 2),
              top: percent(selectedLayer.box.y + selectedLayer.box.h / 2),
            }}
            onPointerDown={(event) => startTransform(event, selectedLayer, "move")}
          >
            <span aria-hidden className="flex gap-1 rounded-full bg-background/95 px-2 py-1 shadow-sm ring-1 ring-primary/30">
              <span className="size-1 rounded-full bg-current" />
              <span className="size-1 rounded-full bg-current" />
              <span className="size-1 rounded-full bg-current" />
            </span>
          </button>
          {RESIZE_HANDLES.map((handle) => {
            const point = getHandlePoint(selectedLayer.box, handle.id);
            return (
              <button
                key={handle.id}
                type="button"
                aria-label={lang(handle.label)}
                title={lang(handle.label)}
                className="pointer-events-auto absolute z-50 flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring touch-none"
                style={{
                  left: percent(point.x),
                  top: percent(point.y),
                  cursor: handle.cursor,
                }}
                onPointerDown={(event) => startTransform(event, selectedLayer, "resize", handle.id)}
              >
                <span aria-hidden className="size-3 rounded-full border-2 border-primary bg-background shadow-sm" />
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
