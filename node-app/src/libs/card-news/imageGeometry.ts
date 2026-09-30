/**
 * @docHint
 * @purpose CardNews 이미지의 fit·focal point 배치를 순수 계산
 * @process asset pixel size + frame pixel box → source crop + destination box
 * @domain card-news
 * @scope renderer_geometry
 */

import type { CardNewsFocalPoint, CardNewsImageFit } from "types/card-news";

export type CardNewsImagePlacement = {
  source: { x: number; y: number; w: number; h: number };
  destination: { x: number; y: number; w: number; h: number };
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function calculateCardNewsImagePlacement(input: {
  assetSize: { width: number; height: number };
  box: { x: number; y: number; w: number; h: number };
  fit: CardNewsImageFit;
  focalPoint?: CardNewsFocalPoint;
}): CardNewsImagePlacement {
  const { assetSize, box, fit } = input;
  if (fit === "fill") {
    return {
      source: { x: 0, y: 0, w: assetSize.width, h: assetSize.height },
      destination: box,
    };
  }

  const scale = fit === "cover"
    ? Math.max(box.w / assetSize.width, box.h / assetSize.height)
    : Math.min(box.w / assetSize.width, box.h / assetSize.height);
  const renderedWidth = assetSize.width * scale;
  const renderedHeight = assetSize.height * scale;

  if (fit === "contain") {
    return {
      source: { x: 0, y: 0, w: assetSize.width, h: assetSize.height },
      destination: {
        x: box.x + (box.w - renderedWidth) / 2,
        y: box.y + (box.h - renderedHeight) / 2,
        w: renderedWidth,
        h: renderedHeight,
      },
    };
  }

  const sourceWidth = box.w / scale;
  const sourceHeight = box.h / scale;
  const focalPoint = input.focalPoint || { x: 0.5, y: 0.5 };
  const maxSourceX = Math.max(0, assetSize.width - sourceWidth);
  const maxSourceY = Math.max(0, assetSize.height - sourceHeight);
  const sourceX = clamp(maxSourceX * focalPoint.x, 0, maxSourceX);
  const sourceY = clamp(maxSourceY * focalPoint.y, 0, maxSourceY);

  return {
    source: { x: sourceX, y: sourceY, w: sourceWidth, h: sourceHeight },
    destination: box,
  };
}
