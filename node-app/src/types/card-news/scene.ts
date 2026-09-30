/**
 * @docHint
 * @purpose CardNews CardDeck을 Canvas 2D가 소비할 수 있는 준비된 scene 계약으로 표현
 * @process raw CardDeck → prepared scene → display/export renderer
 * @domain card-news
 * @scope shared
 */

import type {
  CardNewsAspectRatio,
  CardNewsBackground,
  CardNewsBox,
  CardNewsCard,
  CardNewsFontFamily,
  CardNewsFrameSize,
  CardNewsImageSourceKind,
  CardNewsLayer,
  CardNewsPixelBox,
  CardNewsShapeLayer,
  CardNewsSolidLayer,
  CardNewsWatermarkLogo,
  CardNewsTextAlign,
  CardNewsTextLayer,
} from "./cardDeck";

export const CARD_NEWS_SCENE_CONTRACT_VERSION = 1 as const;

export type CardNewsRenderSurface = "display" | "preview" | "export";

/**
 * Canvas에 그리지 않고 editor DOM에서만 제공하는 정보다.
 * export Canvas는 이 목록의 어떤 요소도 소비하지 않는다.
 */
export const CARD_NEWS_EDITOR_ONLY_OVERLAYS = [
  "selection",
  "guide",
  "cursor",
  "text-input",
  "layer-list",
] as const;
export type CardNewsEditorOnlyOverlay = (typeof CARD_NEWS_EDITOR_ONLY_OVERLAYS)[number];

export type CardNewsImageReference = {
  value: string;
  valueKind: CardNewsImageSourceKind;
};

export type CardNewsPreparedFont = {
  family: CardNewsFontFamily;
  weight: number;
  fontSizePx: number;
  lineHeightPx: number;
  cssFont: string;
  sampleText: string;
  /** true만 renderer에 전달할 수 있다. fallback 폰트는 유효한 handle이 아니다. */
  ready: true;
};

export type CardNewsPreparedAsset = {
  reference: CardNewsImageReference;
  source: CanvasImageSource;
  width: number;
  height: number;
  dispose?: () => void;
};

export type CardNewsPreparedTextLine = {
  text: string;
  /** scene frame pixel 기준 baseline이 아니라 top 좌표다. */
  x: number;
  y: number;
  width?: number;
  glyphAdvances?: readonly number[];
};

export type CardNewsPreparedTextLayer = {
  type: "text";
  source: CardNewsTextLayer;
  box: CardNewsPixelBox;
  align: CardNewsTextAlign;
  font: CardNewsPreparedFont;
  letterSpacingPx: number;
  lines: readonly CardNewsPreparedTextLine[];
};

export type CardNewsPreparedImageLayer = {
  type: "image";
  source: Extract<CardNewsLayer, { type: "image" }>;
  box: CardNewsPixelBox;
  asset: CardNewsPreparedAsset;
};

export type CardNewsPreparedShapeLayer = {
  type: "shape";
  source: CardNewsShapeLayer;
  box: CardNewsPixelBox;
};

export type CardNewsPreparedSolidLayer = {
  type: "solid";
  source: CardNewsSolidLayer;
  box: CardNewsPixelBox;
};

export type CardNewsPreparedLayer =
  | CardNewsPreparedTextLayer
  | CardNewsPreparedImageLayer
  | CardNewsPreparedShapeLayer
  | CardNewsPreparedSolidLayer;

export type CardNewsPreparedColorBackground = {
  type: "color";
  source: Extract<CardNewsBackground, { type: "color" }>;
};

export type CardNewsPreparedImageBackground = {
  type: "image";
  source: Extract<CardNewsBackground, { type: "image" }>;
  asset: CardNewsPreparedAsset;
};

export type CardNewsPreparedBackground =
  | CardNewsPreparedColorBackground
  | CardNewsPreparedImageBackground;

export type CardNewsPreparedWatermark = {
  text: string;
  size: number;
  position: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  opacity: number;
  font?: CardNewsPreparedFont;
  line?: CardNewsPreparedTextLine;
  logo?: {
    source: CardNewsWatermarkLogo;
    asset: CardNewsPreparedAsset;
    box: CardNewsPixelBox;
  };
};

export type CardNewsPreparedScene = {
  contractVersion: typeof CARD_NEWS_SCENE_CONTRACT_VERSION;
  cardId: CardNewsCard["cardId"];
  aspectRatio: CardNewsAspectRatio;
  frameSize: CardNewsFrameSize;
  background: CardNewsPreparedBackground;
  /** CardDeck의 배열 순서를 보존한 z-order다. 뒤 레이어가 위에 그려진다. */
  layers: readonly CardNewsPreparedLayer[];
  watermark?: CardNewsPreparedWatermark;
};

export type CardNewsScenePreparation = {
  assets: ReadonlyMap<string, CardNewsPreparedAsset>;
  fonts: ReadonlyMap<string, CardNewsPreparedFont>;
};

export type CardNewsEditorOverlayState = {
  activeCardId: string;
  selectedLayerId: string | null;
  visible: ReadonlySet<CardNewsEditorOnlyOverlay>;
  textInputLayerId: string | null;
};

export function getCardNewsFontKey(args: {
  family: CardNewsFontFamily;
  weight: number;
  fontSizePx: number;
}) {
  return `${args.family}:${args.weight}:${args.fontSizePx}`;
}

export function getCardNewsAssetKey(reference: CardNewsImageReference) {
  return `${reference.valueKind}:${reference.value}`;
}

/**
 * 준비 단계에서 box를 소비하는 모듈이 동일한 좌표 계약을 사용하도록 하는 타입 별칭이다.
 * 실제 변환은 CardDeck의 frame-pixel helper가 담당한다.
 */
export type CardNewsSceneBox = CardNewsBox;
