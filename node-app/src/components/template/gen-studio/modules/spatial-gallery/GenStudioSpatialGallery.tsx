"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Preloader } from "@amu-labs/ui";
import { ImageBox } from "components/module/image";
import { Lang, lang } from "components/module/i18n";
import { trackGaEvent } from "utils/analytics/ga4";
import { cn } from "utils/common";
import { resolveSpatialGalleryQuality } from "./spatialGalleryLayout";
import { SpatialGalleryScene } from "./SpatialGalleryScene";
import { useSpatialGalleryAtlas } from "./useSpatialGalleryAtlas";
import type { SpatialGalleryItem, SpatialGalleryQuality } from "./types";

const MIN_ZOOM = 0.72;
const MAX_ZOOM = 8;
const KEYBOARD_ZOOM_FACTOR = 1.25;
const DRAG_THRESHOLD = 8;

type Point = { x: number; y: number };

type GenStudioSpatialGalleryProps = {
  items: SpatialGalleryItem[];
  onOpen: (item: SpatialGalleryItem) => void;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getPointerDistance(points: Point[]) {
  if (points.length < 2) return 0;
  return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
}

function supportsWebGl2() {
  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("webgl2");
    const supported = Boolean(context);
    context?.getExtension("WEBGL_lose_context")?.loseContext();
    return supported;
  } catch {
    return false;
  }
}

function GalleryFallback({ items, onOpen }: GenStudioSpatialGalleryProps) {
  return (
    <div className="relative h-full min-h-[22rem] overflow-hidden sm:min-h-[26rem]">
      <div
        className="grid h-full grid-cols-3 grid-rows-3 gap-3 p-3"
        role="list"
        aria-label={lang({ ko: "공개 이미지", en: "Public images" })}
      >
        {items.slice(0, 9).map((item, index) => (
          <button
            key={`${item.templateKey}-${item.src}`}
            type="button"
            role="listitem"
            onClick={() => onOpen(item)}
            aria-label={lang({ ko: `${item.templateTitle} 크게 보기`, en: `Open ${item.templateTitle}` })}
            className={cn(
              "group relative overflow-hidden rounded-xl bg-transparent text-left",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
              index === 0 && "col-span-2 row-span-2 -rotate-2",
              index === 3 && "translate-y-4 rotate-3",
              index === 5 && "-translate-y-3 -rotate-2",
            )}
          >
            <ImageBox
              src={item.src}
              alt={item.templateTitle}
              width="100%"
              height="100%"
              objectFit="object-cover"
              allowUpscale
              className="h-full w-full rounded-xl transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none"
            />
          </button>
        ))}
      </div>
      <span className="sr-only">
        <Lang
          text={{
            ko: "이 환경에서는 가벼운 2D 갤러리로 표시됩니다.",
            en: "A lightweight 2D gallery is shown on this device.",
          }}
        />
      </span>
    </div>
  );
}

export default function GenStudioSpatialGallery({ items, onOpen }: GenStudioSpatialGalleryProps) {
  const [quality, setQuality] = useState<SpatialGalleryQuality>(() => resolveSpatialGalleryQuality());
  const [webGlAvailable] = useState(() => supportsWebGl2());
  const [contextLost, setContextLost] = useState(false);
  const [rotation, setRotation] = useState<[number, number]>([-0.08, -0.28]);
  const [zoom, setZoom] = useState(1);
  const [reducedMotion, setReducedMotion] = useState(false);
  const galleryRef = useRef<HTMLDivElement>(null);
  const pointerMapRef = useRef(new Map<number, Point>());
  const dragStartRef = useRef<Point | null>(null);
  const pinchDistanceRef = useRef(0);
  const pinchZoomRef = useRef(1);
  const velocityRef = useRef<Point>({ x: 0, y: 0 });
  const pressedImageIndexRef = useRef<number | null>(null);
  const lastActivationRef = useRef<{ index: number; timestamp: number } | null>(null);
  const suppressSelectRef = useRef(false);
  const interactionTrackedRef = useRef(false);
  const readyTrackedRef = useRef(false);
  const inertiaFrameRef = useRef<number | null>(null);
  const rotationRef = useRef(rotation);
  const zoomRef = useRef(zoom);
  const { texture, items: atlasItems, loading, error } = useSpatialGalleryAtlas(
    items,
    quality,
    webGlAvailable && !contextLost,
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    const update = () => setQuality(resolveSpatialGalleryQuality());
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    rotationRef.current = rotation;
  }, [rotation]);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    if (!texture || !atlasItems.length || readyTrackedRef.current) return;
    readyTrackedRef.current = true;
    trackGaEvent("gen_studio_spatial_gallery_ready", {
      image_count: atlasItems.length,
      quality_tier: quality,
    });
  }, [atlasItems.length, quality, texture]);

  useEffect(() => {
    if (!(error || contextLost || webGlAvailable === false)) return;
    trackGaEvent("gen_studio_spatial_gallery_fallback", {
      reason: contextLost ? "context_lost" : error ? "atlas_error" : "webgl_unavailable",
    });
  }, [contextLost, error, webGlAvailable]);

  useEffect(
    () => () => {
      if (inertiaFrameRef.current !== null) cancelAnimationFrame(inertiaFrameRef.current);
    },
    [],
  );

  const trackInteraction = useCallback((kind: string) => {
    if (interactionTrackedRef.current) return;
    interactionTrackedRef.current = true;
    trackGaEvent("gen_studio_spatial_gallery_interact", { interaction_type: kind });
  }, []);

  const applyZoom = useCallback((next: number) => {
    const clamped = clamp(next, MIN_ZOOM, MAX_ZOOM);
    zoomRef.current = clamped;
    setZoom(clamped);
  }, []);

  const handleWheel = useCallback(
    (event: WheelEvent) => {
      event.preventDefault();
      applyZoom(zoomRef.current * Math.exp(-event.deltaY * 0.0015));
      trackInteraction("wheel_zoom");
    },
    [applyZoom, trackInteraction],
  );

  useEffect(() => {
    const gallery = galleryRef.current;
    if (!gallery || !texture || contextLost || error || webGlAvailable === false) return;

    gallery.addEventListener("wheel", handleWheel, { passive: false });
    return () => gallery.removeEventListener("wheel", handleWheel);
  }, [contextLost, error, handleWheel, texture, webGlAvailable]);

  const applyRotation = useCallback((next: [number, number]) => {
    const clamped: [number, number] = [clamp(next[0], -0.92, 0.92), next[1]];
    rotationRef.current = clamped;
    setRotation(clamped);
  }, []);

  const stopInertia = useCallback(() => {
    if (inertiaFrameRef.current !== null) {
      cancelAnimationFrame(inertiaFrameRef.current);
      inertiaFrameRef.current = null;
    }
  }, []);

  const startInertia = useCallback(() => {
    stopInertia();
    if (reducedMotion) return;
    const tick = () => {
      velocityRef.current.x *= 0.92;
      velocityRef.current.y *= 0.92;
      if (Math.abs(velocityRef.current.x) + Math.abs(velocityRef.current.y) < 0.0003) {
        inertiaFrameRef.current = null;
        return;
      }
      applyRotation([
        rotationRef.current[0] + velocityRef.current.y,
        rotationRef.current[1] + velocityRef.current.x,
      ]);
      inertiaFrameRef.current = requestAnimationFrame(tick);
    };
    inertiaFrameRef.current = requestAnimationFrame(tick);
  }, [applyRotation, reducedMotion, stopInertia]);

  const handleSelect = useCallback(
    (index: number) => {
      if (suppressSelectRef.current) return;
      const timestamp = performance.now();
      const lastActivation = lastActivationRef.current;
      if (lastActivation?.index === index && timestamp - lastActivation.timestamp < 350) return;
      const item = atlasItems[index];
      if (!item) return;
      lastActivationRef.current = { index, timestamp };
      trackGaEvent("gen_studio_spatial_gallery_focus", { template_key: item.templateKey });
      trackGaEvent("gen_studio_spatial_gallery_lightbox", { template_key: item.templateKey });
      onOpen(item);
    },
    [atlasItems, onOpen],
  );

  if (webGlAvailable === false || contextLost || error) {
    return <GalleryFallback items={items} onOpen={onOpen} />;
  }

  if (loading || !texture) {
    return (
      <div
        className="relative flex h-full min-h-[22rem] items-center justify-center overflow-hidden sm:min-h-[26rem]"
        role="status"
        aria-live="polite"
      >
        <Preloader variant="spin" size="lg" />
        <span className="sr-only">
          <Lang text={{ ko: "3D 이미지 갤러리 준비 중", en: "Preparing the 3D image gallery" }} />
        </span>
      </div>
    );
  }

  return (
    <div
      ref={galleryRef}
      className="relative h-full min-h-[22rem] cursor-grab overflow-hidden bg-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent active:cursor-grabbing sm:min-h-[26rem]"
      tabIndex={0}
      aria-label={lang({
        ko: "드래그와 확대·축소로 탐색하는 공개 AI 이미지 3D 갤러리",
        en: "Interactive 3D gallery of public AI images. Drag or zoom to explore.",
      })}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          applyRotation([rotationRef.current[0], rotationRef.current[1] + (event.key === "ArrowLeft" ? -0.18 : 0.18)]);
          trackInteraction("keyboard_rotate");
        } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          event.preventDefault();
          applyRotation([rotationRef.current[0] + (event.key === "ArrowUp" ? -0.14 : 0.14), rotationRef.current[1]]);
          trackInteraction("keyboard_rotate");
        } else if (event.key === "+" || event.key === "=") {
          event.preventDefault();
          applyZoom(zoomRef.current * KEYBOARD_ZOOM_FACTOR);
          trackInteraction("keyboard_zoom");
        } else if (event.key === "-") {
          event.preventDefault();
          applyZoom(zoomRef.current / KEYBOARD_ZOOM_FACTOR);
          trackInteraction("keyboard_zoom");
        }
      }}
      onPointerDown={(event) => {
        if ((event.target as HTMLElement).closest("button")) return;
        stopInertia();
        pointerMapRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        dragStartRef.current = { x: event.clientX, y: event.clientY };
        suppressSelectRef.current = false;
        if (pointerMapRef.current.size === 2) {
          pinchDistanceRef.current = getPointerDistance(Array.from(pointerMapRef.current.values()));
          pinchZoomRef.current = zoomRef.current;
        }
      }}
      onPointerMove={(event) => {
        const previous = pointerMapRef.current.get(event.pointerId);
        if (!previous) return;
        pointerMapRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        const points = Array.from(pointerMapRef.current.values());
        if (points.length > 1) {
          const distance = getPointerDistance(points);
          if (pinchDistanceRef.current > 0) applyZoom(pinchZoomRef.current * (distance / pinchDistanceRef.current));
          suppressSelectRef.current = true;
          trackInteraction("pinch_zoom");
          return;
        }

        const dx = event.clientX - previous.x;
        const dy = event.clientY - previous.y;
        const start = dragStartRef.current;
        if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > DRAG_THRESHOLD) {
          suppressSelectRef.current = true;
        }
        if (!suppressSelectRef.current) return;
        velocityRef.current = { x: dx * 0.0038, y: dy * 0.0038 };
        applyRotation([rotationRef.current[0] + velocityRef.current.y, rotationRef.current[1] + velocityRef.current.x]);
        trackInteraction("drag_rotate");
      }}
      onPointerUp={(event) => {
        pointerMapRef.current.delete(event.pointerId);
        if (pointerMapRef.current.size === 0) {
          const pressedImageIndex = pressedImageIndexRef.current;
          if (!suppressSelectRef.current && pressedImageIndex !== null) handleSelect(pressedImageIndex);
          const wasDragging = suppressSelectRef.current;
          if (wasDragging) startInertia();
          pressedImageIndexRef.current = null;
          window.setTimeout(() => {
            suppressSelectRef.current = false;
          }, wasDragging ? 350 : 0);
          dragStartRef.current = null;
        }
      }}
      onPointerCancel={(event) => {
        pointerMapRef.current.delete(event.pointerId);
        pressedImageIndexRef.current = null;
        suppressSelectRef.current = false;
      }}
      style={{ touchAction: "none" }}
    >
      <SpatialGalleryScene
        items={atlasItems}
        texture={texture}
        rotation={rotation}
        zoom={zoom}
        quality={quality}
        reducedMotion={reducedMotion}
        onActivate={handleSelect}
        onPressStart={(index) => {
          pressedImageIndexRef.current = index;
        }}
        onContextLost={() => setContextLost(true)}
      />

      <div className="sr-only" role="list" aria-label={lang({ ko: "공개 이미지 목록", en: "Public image list" })}>
        {atlasItems.map((item, index) => (
          <button
            key={`${item.templateKey}-${item.src}`}
            type="button"
            role="listitem"
            onClick={() => handleSelect(index)}
          >
            {lang({ ko: `${item.templateTitle} 크게 보기`, en: `Open ${item.templateTitle}` })}
          </button>
        ))}
      </div>
    </div>
  );
}
