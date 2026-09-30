/**
 * @docHint
 * @purpose 준비된 CardNews scene을 display/preview/export Canvas에 동일하게 그리는 순수 renderer
 * @process logical frame pixels의 background → z-order layer → watermark 렌더
 * @domain card-news
 * @scope renderer
 */

import type {
  CardNewsPreparedAsset,
  CardNewsPreparedImageLayer,
  CardNewsPreparedScene,
  CardNewsPreparedShapeLayer,
  CardNewsPreparedSolidLayer,
  CardNewsPreparedTextLayer,
} from "types/card-news/scene";
import { calculateCardNewsImagePlacement } from "libs/card-news/imageGeometry";
import { scaleCardNewsCanonicalPixels } from "types/card-news/cardDeck";
import { getCardNewsGraphemes } from "libs/card-news/typography";

export type CardNewsRendererErrorCode =
  | "INVALID_FRAME_SIZE"
  | "FONT_NOT_READY"
  | "INVALID_ASSET_SIZE";

export class CardNewsRendererError extends Error {
  readonly code: CardNewsRendererErrorCode;

  constructor(code: CardNewsRendererErrorCode) {
    super(code);
    this.name = "CardNewsRendererError";
    this.code = code;
  }
}

function assertFrameSize(scene: CardNewsPreparedScene) {
  if (
    !Number.isFinite(scene.frameSize.w) ||
    !Number.isFinite(scene.frameSize.h) ||
    scene.frameSize.w <= 0 ||
    scene.frameSize.h <= 0
  ) {
    throw new CardNewsRendererError("INVALID_FRAME_SIZE");
  }
}

function assertAsset(asset: CardNewsPreparedAsset) {
  if (!Number.isFinite(asset.width) || !Number.isFinite(asset.height) || asset.width <= 0 || asset.height <= 0) {
    throw new CardNewsRendererError("INVALID_ASSET_SIZE");
  }
}

function drawRoundedPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number) {
  const r = Math.max(0, Math.min(radius, Math.min(w, h) / 2));
  if (r === 0) {
    ctx.rect(x, y, w, h);
    return;
  }

  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawImage(
  ctx: CanvasRenderingContext2D,
  asset: CardNewsPreparedAsset,
  box: { x: number; y: number; w: number; h: number },
  fit: "cover" | "contain" | "fill",
  radius: number,
  opacity = 1,
  focalPoint = { x: 0.5, y: 0.5 },
) {
  assertAsset(asset);
  const crop = calculateCardNewsImagePlacement({
    assetSize: { width: asset.width, height: asset.height },
    box,
    fit,
    focalPoint,
  });

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.beginPath();
  drawRoundedPath(ctx, box.x, box.y, box.w, box.h, radius);
  ctx.clip();
  ctx.drawImage(
    asset.source,
    crop.source.x,
    crop.source.y,
    crop.source.w,
    crop.source.h,
    crop.destination.x,
    crop.destination.y,
    crop.destination.w,
    crop.destination.h,
  );
  ctx.restore();
}

function drawBackground(ctx: CanvasRenderingContext2D, background: CardNewsPreparedScene["background"], frame: CardNewsPreparedScene["frameSize"]) {
  if (background.type === "color") {
    ctx.save();
    ctx.globalAlpha = background.source.opacity;
    ctx.fillStyle = background.source.value;
    ctx.fillRect(0, 0, frame.w, frame.h);
    ctx.restore();
    return;
  }

  drawImage(
    ctx,
    background.asset,
    { x: 0, y: 0, w: frame.w, h: frame.h },
    background.source.fit,
    0,
    background.source.opacity,
    background.source.focalPoint,
  );
}

function drawShape(ctx: CanvasRenderingContext2D, layer: CardNewsPreparedShapeLayer) {
  const { box, source } = layer;
  ctx.save();
  ctx.fillStyle = source.fill;
  ctx.beginPath();
  if (source.shape === "circle") {
    ctx.ellipse(box.x + box.w / 2, box.y + box.h / 2, box.w / 2, box.h / 2, 0, 0, Math.PI * 2);
  } else {
    drawRoundedPath(ctx, box.x, box.y, box.w, box.h, source.radius);
  }
  ctx.fill();
  ctx.restore();
}

function toCanvasColor(value: string) {
  const match = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(value);
  if (!match) return value;
  if (!match[2]) return `#${match[1]}`;
  const red = Number.parseInt(match[1].slice(0, 2), 16);
  const green = Number.parseInt(match[1].slice(2, 4), 16);
  const blue = Number.parseInt(match[1].slice(4, 6), 16);
  const alpha = Number.parseInt(match[2], 16) / 255;
  return `rgba(${red}, ${green}, ${blue}, ${alpha.toFixed(3)})`;
}

function getGradientCoordinates(
  box: CardNewsPreparedSolidLayer["box"],
  direction: NonNullable<CardNewsPreparedSolidLayer["source"]["gradient"]>["direction"],
) {
  const right = box.x + box.w;
  const bottom = box.y + box.h;
  const centerX = box.x + box.w / 2;
  const centerY = box.y + box.h / 2;
  switch (direction) {
    case "bottom-top":
      return { x0: centerX, y0: bottom, x1: centerX, y1: box.y };
    case "left-right":
      return { x0: box.x, y0: centerY, x1: right, y1: centerY };
    case "right-left":
      return { x0: right, y0: centerY, x1: box.x, y1: centerY };
    case "top-left-bottom-right":
      return { x0: box.x, y0: box.y, x1: right, y1: bottom };
    case "top-right-bottom-left":
      return { x0: right, y0: box.y, x1: box.x, y1: bottom };
    case "top-bottom":
    default:
      return { x0: centerX, y0: box.y, x1: centerX, y1: bottom };
  }
}

function drawSolid(ctx: CanvasRenderingContext2D, layer: CardNewsPreparedSolidLayer) {
  const { box, source } = layer;
  ctx.save();
  ctx.globalAlpha = source.opacity;
  ctx.beginPath();
  drawRoundedPath(ctx, box.x, box.y, box.w, box.h, source.radius);
  ctx.clip();

  if (source.gradient) {
    const coordinates = getGradientCoordinates(box, source.gradient.direction);
    const gradient = ctx.createLinearGradient(coordinates.x0, coordinates.y0, coordinates.x1, coordinates.y1);
    gradient.addColorStop(0, toCanvasColor(source.gradient.from));
    gradient.addColorStop(1, toCanvasColor(source.gradient.to));
    ctx.fillStyle = gradient;
  } else {
    ctx.fillStyle = toCanvasColor(source.color);
  }
  ctx.fill();
  ctx.restore();
}

function drawText(ctx: CanvasRenderingContext2D, layer: CardNewsPreparedTextLayer) {
  if (!layer.font.ready) throw new CardNewsRendererError("FONT_NOT_READY");

  ctx.save();
  ctx.font = layer.font.cssFont;
  ctx.fillStyle = layer.source.color;
  ctx.textAlign = layer.align;
  ctx.textBaseline = "top";
  for (const line of layer.lines) {
    if (!layer.letterSpacingPx || !line.glyphAdvances?.length) {
      ctx.fillText(line.text, line.x, line.y);
      continue;
    }

    const width = line.width || 0;
    let cursor = layer.align === "center" ? line.x - width / 2 : layer.align === "right" ? line.x - width : line.x;
    const graphemes = getCardNewsGraphemes(line.text, layer.source.locale);
    ctx.textAlign = "left";
    graphemes.forEach((grapheme, index) => {
      ctx.fillText(grapheme, cursor, line.y);
      cursor += line.glyphAdvances?.[index] || 0;
    });
    ctx.textAlign = layer.align;
  }
  ctx.restore();
}

function drawImageLayer(
  ctx: CanvasRenderingContext2D,
  layer: CardNewsPreparedImageLayer,
  frame: CardNewsPreparedScene["frameSize"],
) {
  drawImage(
    ctx,
    layer.asset,
    layer.box,
    layer.source.fit,
    scaleCardNewsCanonicalPixels(layer.source.radius, frame),
    layer.source.opacity,
    layer.source.focalPoint,
  );
}

function drawWatermark(ctx: CanvasRenderingContext2D, scene: CardNewsPreparedScene) {
  const watermark = scene.watermark;
  if (!watermark) return;

  if (watermark.logo) {
    drawImage(ctx, watermark.logo.asset, watermark.logo.box, "contain", 0, watermark.opacity);
  }
  if (!watermark.line || !watermark.font) return;
  if (!watermark.font.ready) throw new CardNewsRendererError("FONT_NOT_READY");

  ctx.save();
  ctx.globalAlpha = watermark.opacity;
  ctx.font = watermark.font.cssFont;
  ctx.fillStyle = "#111827";
  ctx.textAlign = watermark.position.endsWith("right") ? "right" : "left";
  ctx.textBaseline = "top";
  ctx.fillText(watermark.line.text, watermark.line.x, watermark.line.y);
  ctx.restore();
}

/**
 * 모든 좌표는 scene.frameSize의 logical pixel이다. 호출자는 display Canvas의 DPR transform 또는
 * export Canvas의 1:1 backing size를 먼저 설정한다. 이 함수에는 브라우저·네트워크 책임이 없다.
 */
export function renderCardScene(ctx: CanvasRenderingContext2D, scene: CardNewsPreparedScene) {
  assertFrameSize(scene);
  const { w, h } = scene.frameSize;
  ctx.clearRect(0, 0, w, h);
  drawBackground(ctx, scene.background, scene.frameSize);

  for (const layer of scene.layers) {
    if (layer.type === "text") drawText(ctx, layer);
    else if (layer.type === "image") drawImageLayer(ctx, layer, scene.frameSize);
    else if (layer.type === "solid") drawSolid(ctx, layer);
    else drawShape(ctx, layer);
  }

  drawWatermark(ctx, scene);
}
