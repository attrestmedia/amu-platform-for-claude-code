/**
 * @docHint
 * @purpose CardDeck을 browser 의존성이 없는 준비된 CardNews scene으로 변환
 * @process 좌표 변환·레이어 순서·font/asset 준비 결과 결합
 * @domain card-news
 * @scope scene_layout
 */

import {
  getCardNewsAssetKey,
  getCardNewsFontKey,
  type CardNewsImageReference,
  type CardNewsPreparedAsset,
  type CardNewsPreparedBackground,
  type CardNewsPreparedFont,
  type CardNewsPreparedImageLayer,
  type CardNewsPreparedLayer,
  type CardNewsPreparedScene,
  type CardNewsPreparedShapeLayer,
  type CardNewsPreparedTextLayer,
  type CardNewsScenePreparation,
} from "types/card-news/scene";
import {
  toFramePixelBox,
  type CardNewsBackground,
  type CardNewsCard,
  type CardNewsDeckPayload,
  type CardNewsImageLayer,
  type CardNewsTextLayer,
  scaleCardNewsCanonicalPixels,
} from "types/card-news/cardDeck";
import { prepareCardNewsTextLayout } from "libs/card-news/typography";

export type CardNewsScenePreparationErrorCode =
  | "CARD_NOT_FOUND"
  | "ASSET_NOT_PREPARED"
  | "FONT_NOT_PREPARED"
  | "PREPARED_FONT_INVALID"
  | "PREPARED_ASSET_INVALID";

export class CardNewsScenePreparationError extends Error {
  readonly code: CardNewsScenePreparationErrorCode;
  readonly reference?: string;

  constructor(code: CardNewsScenePreparationErrorCode, reference?: string) {
    super(reference ? `${code}:${reference}` : code);
    this.name = "CardNewsScenePreparationError";
    this.code = code;
    this.reference = reference;
  }
}

function requireFont(
  preparation: CardNewsScenePreparation,
  args: { family: CardNewsTextLayer["fontFamily"]; weight: number; fontSizePx: number },
) {
  const key = getCardNewsFontKey(args);
  const font = preparation.fonts.get(key);
  if (!font) throw new CardNewsScenePreparationError("FONT_NOT_PREPARED", key);
  if (
    font.family !== args.family ||
    font.weight !== args.weight ||
    font.fontSizePx !== args.fontSizePx ||
    !font.cssFont ||
    !font.ready
  ) {
    throw new CardNewsScenePreparationError("PREPARED_FONT_INVALID", key);
  }
  return font;
}

function requireAsset(preparation: CardNewsScenePreparation, reference: CardNewsImageReference) {
  const key = getCardNewsAssetKey(reference);
  const asset = preparation.assets.get(key);
  if (!asset) throw new CardNewsScenePreparationError("ASSET_NOT_PREPARED", key);
  if (!asset.source || !Number.isFinite(asset.width) || !Number.isFinite(asset.height) || asset.width <= 0 || asset.height <= 0) {
    throw new CardNewsScenePreparationError("PREPARED_ASSET_INVALID", key);
  }
  return asset;
}

function asImageReference(value: string, valueKind: CardNewsImageReference["valueKind"]): CardNewsImageReference {
  return { value, valueKind };
}

function prepareTextLayer(
  layer: CardNewsTextLayer,
  frameSize: CardNewsDeckPayload["frameSize"],
  preparation: CardNewsScenePreparation,
): CardNewsPreparedTextLayer {
  const box = toFramePixelBox(layer.box, frameSize);
  const font = requireFont(preparation, {
    family: layer.fontFamily,
    weight: layer.fontWeight,
    fontSizePx: layer.fontSize,
  });
  const layout = prepareCardNewsTextLayout({ layer, box, font });

  return {
    type: "text",
    source: layer,
    box,
    align: layer.align,
    font: layout.font,
    letterSpacingPx: layout.letterSpacingPx,
    lines: layout.lines,
  };
}

function prepareImageLayer(
  layer: CardNewsImageLayer,
  frameSize: CardNewsDeckPayload["frameSize"],
  preparation: CardNewsScenePreparation,
): CardNewsPreparedImageLayer {
  const reference = asImageReference(layer.src, layer.srcKind);
  const asset = requireAsset(preparation, reference);
  return { type: "image", source: layer, box: toFramePixelBox(layer.box, frameSize), asset };
}

function prepareLayer(
  layer: CardNewsCard["layers"][number],
  frameSize: CardNewsDeckPayload["frameSize"],
  preparation: CardNewsScenePreparation,
): CardNewsPreparedLayer {
  if (layer.type === "text") return prepareTextLayer(layer, frameSize, preparation);
  if (layer.type === "image") return prepareImageLayer(layer, frameSize, preparation);
  if (layer.type === "solid") {
    return {
      type: "solid",
      source: layer,
      box: toFramePixelBox(layer.box, frameSize),
    };
  }

  const prepared: CardNewsPreparedShapeLayer = {
    type: "shape",
    source: layer,
    box: toFramePixelBox(layer.box, frameSize),
  };
  return prepared;
}

function prepareBackground(
  background: CardNewsBackground,
  preparation: CardNewsScenePreparation,
): CardNewsPreparedBackground {
  if (background.type === "color") return { type: "color", source: background };

  const reference = asImageReference(background.value, background.valueKind);
  return {
    type: "image",
    source: background,
    asset: requireAsset(preparation, reference),
  };
}

function prepareWatermark(
  deck: CardNewsDeckPayload,
  card: CardNewsCard,
  frameSize: CardNewsDeckPayload["frameSize"],
  preparation: CardNewsScenePreparation,
) {
  const watermark = deck.watermark;
  if (!watermark?.enabled || card.watermarkEnabled === false || (!watermark.text && !watermark.logo)) return undefined;

  const font = watermark.text
    ? requireFont(preparation, {
        family: deck.theme.fontFamily,
        weight: 700,
        fontSizePx: watermark.size,
      })
    : undefined;
  const inset = Math.round(Math.min(frameSize.w, frameSize.h) * 0.04);
  const right = watermark.position.endsWith("right");
  const bottom = watermark.position.startsWith("bottom");
  const logoSize = Math.round(scaleCardNewsCanonicalPixels(watermark.size, frameSize));
  const logoBox = watermark.logo
    ? {
        x: right ? frameSize.w - inset - logoSize : inset,
        y: bottom ? frameSize.h - inset - logoSize : inset,
        w: logoSize,
        h: logoSize,
      }
    : undefined;
  const logo = watermark.logo
    ? {
        source: watermark.logo,
        asset: requireAsset(preparation, asImageReference(watermark.logo.value, watermark.logo.valueKind)),
        box: logoBox!,
      }
    : undefined;
  const line = watermark.text && font
    ? {
        text: watermark.text,
        x: right
          ? (logoBox ? logoBox.x - Math.round(logoSize * 0.2) : frameSize.w - inset)
          : (logoBox ? logoBox.x + logoSize + Math.round(logoSize * 0.2) : inset),
        y: bottom
          ? (logoBox ? logoBox.y + Math.max(0, (logoSize - font.lineHeightPx) / 2) : frameSize.h - inset - font.lineHeightPx)
          : (logoBox ? logoBox.y + Math.max(0, (logoSize - font.lineHeightPx) / 2) : inset),
      }
    : undefined;

  return {
    text: watermark.text,
    size: watermark.size,
    position: watermark.position,
    opacity: watermark.opacity,
    ...(font ? { font } : {}),
    ...(line ? { line } : {}),
    ...(logo ? { logo } : {}),
  };
}

export function createCardNewsScene(
  deck: CardNewsDeckPayload,
  preparation: CardNewsScenePreparation,
  cardId = deck.cards[0]?.cardId,
): CardNewsPreparedScene {
  const card = deck.cards.find((candidate) => candidate.cardId === cardId);
  if (!card) throw new CardNewsScenePreparationError("CARD_NOT_FOUND", cardId);

  const watermark = prepareWatermark(deck, card, deck.frameSize, preparation);

  return {
    contractVersion: 1,
    cardId: card.cardId,
    aspectRatio: deck.aspectRatio,
    frameSize: deck.frameSize,
    background: prepareBackground(card.background, preparation),
    layers: card.layers.map((layer) => prepareLayer(layer, deck.frameSize, preparation)),
    ...(watermark ? { watermark } : {}),
  };
}

export function createEmptyCardNewsScenePreparation(): CardNewsScenePreparation {
  return {
    assets: new Map<string, CardNewsPreparedAsset>(),
    fonts: new Map<string, CardNewsPreparedFont>(),
  };
}
