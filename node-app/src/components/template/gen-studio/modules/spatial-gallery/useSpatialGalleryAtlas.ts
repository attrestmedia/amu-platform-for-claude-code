"use client";

import { useEffect, useState } from "react";
import {
  CanvasTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  SRGBColorSpace,
} from "three";
import { SPATIAL_GALLERY_ATLAS, SPATIAL_GALLERY_LIMITS } from "./spatialGalleryLayout";
import type { SpatialGalleryAtlasItem, SpatialGalleryItem, SpatialGalleryQuality } from "./types";

type AtlasState = {
  texture: CanvasTexture | null;
  items: SpatialGalleryAtlasItem[];
  loading: boolean;
  error: Error | null;
};

type DecodedImage = CanvasImageSource & { width: number; height: number };

function getProxyUrl(src: string, thumbnailWidth: number) {
  const params = new URLSearchParams({
    url: src,
    thumbnailWidth: String(thumbnailWidth),
  });
  return `/api/proxy/image?${params.toString()}`;
}

async function fetchImageBlob(src: string, thumbnailWidth: number, signal: AbortSignal) {
  const isRemote = /^https?:\/\//i.test(src);
  const response = await fetch(isRemote ? getProxyUrl(src, thumbnailWidth) : src, {
    signal,
    cache: "force-cache",
  });
  if (!response.ok) throw new Error(`Image request failed: ${response.status}`);
  return response.blob();
}

async function decodeImage(blob: Blob, maxSize: number): Promise<DecodedImage> {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(blob, {
      resizeWidth: maxSize,
      resizeQuality: "medium",
    }) as Promise<ImageBitmap>;
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image decoding failed"));
    };
    image.src = url;
  });
}

function closeDecodedImage(image: DecodedImage) {
  if ("close" in image && typeof image.close === "function") image.close();
}

function drawIntoAtlasCell(
  context: CanvasRenderingContext2D,
  image: DecodedImage,
  x: number,
  y: number,
  size: number,
  padding: number,
) {
  const target = size - padding * 2;
  const sourceRatio = image.width / Math.max(image.height, 1);
  let drawWidth = target;
  let drawHeight = target;

  if (sourceRatio >= 1) {
    drawHeight = target / sourceRatio;
  } else {
    drawWidth = target * sourceRatio;
  }
  const drawX = x + (size - drawWidth) / 2;
  const drawY = y + (size - drawHeight) / 2;

  context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
  return { drawX, drawY, drawWidth, drawHeight };
}

async function createAtlas(
  sourceItems: SpatialGalleryItem[],
  quality: SpatialGalleryQuality,
  signal: AbortSignal,
) {
  const config = SPATIAL_GALLERY_ATLAS[quality];
  const canvas = document.createElement("canvas");
  canvas.width = config.size;
  canvas.height = config.size;
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) throw new Error("Canvas 2D is unavailable");

  const candidates = sourceItems.slice(0, SPATIAL_GALLERY_LIMITS[quality]);
  const loadResults: Array<{ item: SpatialGalleryItem; image: DecodedImage } | undefined> = new Array(
    candidates.length,
  );
  let cursor = 0;
  const workers = Array.from({ length: Math.min(6, candidates.length) }, async () => {
    while (cursor < candidates.length && !signal.aborted) {
      const itemIndex = cursor;
      const item = candidates[itemIndex];
      cursor += 1;
      try {
        const blob = await fetchImageBlob(item.src, config.cell, signal);
        const image = await decodeImage(blob, config.cell);
        loadResults[itemIndex] = { item, image };
      } catch {
        if (signal.aborted) return;
      }
    }
  });
  await Promise.all(workers);
  const loaded = loadResults.filter(
    (result): result is { item: SpatialGalleryItem; image: DecodedImage } => Boolean(result),
  );

  if (!loaded.length) throw new Error("No public images could be loaded");

  const padding = 3;
  const atlasItems = loaded.map(({ item, image }, index) => {
    const column = index % config.columns;
    const row = Math.floor(index / config.columns);
    const x = column * config.cell;
    const y = row * config.cell;
    const drawn = drawIntoAtlasCell(context, image, x, y, config.cell, padding);

    const u0 = drawn.drawX / config.size;
    const u1 = (drawn.drawX + drawn.drawWidth) / config.size;
    const v0 = 1 - (drawn.drawY + drawn.drawHeight) / config.size;
    const v1 = 1 - drawn.drawY / config.size;
    const aspectRatio = image.width / Math.max(image.height, 1);
    closeDecodedImage(image);

    return { ...item, aspectRatio, uvRect: [u0, v0, u1, v1] } as SpatialGalleryAtlasItem;
  });

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;

  return { texture, items: atlasItems };
}

export function useSpatialGalleryAtlas(
  items: SpatialGalleryItem[],
  quality: SpatialGalleryQuality,
  enabled = true,
) {
  const [state, setState] = useState<AtlasState>({ texture: null, items: [], loading: true, error: null });

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let disposed = false;
    let ownedTexture: CanvasTexture | null = null;
    let hasInitialAtlas = false;

    const applyAtlas = (atlas: { texture: CanvasTexture; items: SpatialGalleryAtlasItem[] }) => {
      ownedTexture = atlas.texture;
      if (disposed) {
        atlas.texture.dispose();
        return;
      }
      setState((current) => {
        if (current.texture !== atlas.texture) current.texture?.dispose();
        return { ...atlas, loading: false, error: null };
      });
    };

    const build = async () => {
      try {
        const initialCount = Math.min(quality === "low" ? 6 : 8, items.length);
        const initialAtlas = await createAtlas(items.slice(0, initialCount), quality, controller.signal);
        hasInitialAtlas = true;
        applyAtlas(initialAtlas);

        if (items.length > initialCount && !disposed) {
          const completeAtlas = await createAtlas(items, quality, controller.signal);
          applyAtlas(completeAtlas);
        }
      } catch (error: unknown) {
        if (disposed || controller.signal.aborted || hasInitialAtlas) return;
        setState((current) => ({ ...current, loading: false, error: error as Error }));
      }
    };

    void build();

    return () => {
      disposed = true;
      controller.abort();
      ownedTexture?.dispose();
    };
  }, [enabled, items, quality]);

  return state;
}
