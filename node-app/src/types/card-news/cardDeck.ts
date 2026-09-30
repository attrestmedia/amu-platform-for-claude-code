/**
 * @docHint
 * @purpose CardNews 편집기·캡처·서버가 공유하는 CardDeck 문서 계약
 * @process 정규화 좌표 검증  폰트/이미지 참조 검증  프레임별 픽셀 변환
 * @domain card-news
 * @scope shared
 */

import type { CardNewsAgentDeckMetadata } from "./agent";

export const CARD_NEWS_LEGACY_DOCUMENT_VERSION = 1 as const;
export const CARD_NEWS_DOCUMENT_VERSION = 2 as const;
export const CARD_NEWS_SUPPORTED_DOCUMENT_VERSIONS = [
  CARD_NEWS_LEGACY_DOCUMENT_VERSION,
  CARD_NEWS_DOCUMENT_VERSION,
] as const;
export type CardNewsDocumentVersion = (typeof CARD_NEWS_SUPPORTED_DOCUMENT_VERSIONS)[number];
export const CARD_NEWS_MAX_CARDS = 10 as const;
export const CARD_NEWS_MAX_LAYERS_PER_CARD = 50 as const;
export const CARD_NEWS_MAX_TITLE_LENGTH = 120 as const;
export const CARD_NEWS_MAX_TEXT_LENGTH = 3_000 as const;
export const CARD_NEWS_MAX_ALT_TEXT_LENGTH = 500 as const;
export const CARD_NEWS_AUTOSAVE_DEBOUNCE_MS = 500 as const;
export const CARD_NEWS_AUTOSAVE_MAX_RETRY = 1 as const;

export const CARD_NEWS_ASPECT_RATIOS = ["1:1", "4:5"] as const;
export type CardNewsAspectRatio = (typeof CARD_NEWS_ASPECT_RATIOS)[number];

export const CARD_NEWS_CANONICAL_FRAME_WIDTH = 1_080 as const;
export const CARD_NEWS_CANONICAL_UNIT = "frame-1080px" as const;
export type CardNewsCanonicalUnit = typeof CARD_NEWS_CANONICAL_UNIT;

export const CARD_NEWS_FONT_FAMILIES = [
  "Noto Sans KR",
  "Noto Serif KR",
  "Nanum Gothic",
  "Nanum Myeongjo",
  "Gothic A1",
] as const;
export type CardNewsFontFamily = (typeof CARD_NEWS_FONT_FAMILIES)[number];

export const CARD_NEWS_FONT_WEIGHTS: Record<CardNewsFontFamily, readonly number[]> = {
  "Noto Sans KR": [400, 500, 700],
  "Noto Serif KR": [400, 600, 700],
  "Nanum Gothic": [400, 700, 800],
  "Nanum Myeongjo": [400, 700, 800],
  "Gothic A1": [400, 500, 700, 900],
};

export type CardNewsFrameSize = {
  w: number;
  h: number;
};

export type CardNewsBox = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type CardNewsPixelBox = CardNewsBox;

export type CardNewsTheme = {
  backgroundColor: string;
  fontFamily: CardNewsFontFamily;
  palette: string[];
};

export type CardNewsImageFit = "cover" | "contain" | "fill";
export type CardNewsTextAlign = "left" | "center" | "right";
export type CardNewsTextOverflow = "clip" | "ellipsis";
export type CardNewsTextVerticalAlign = "top" | "middle" | "bottom";
export type CardNewsTextWordBreak = "normal" | "break-word" | "keep-all";
export type CardNewsFocalPoint = { x: number; y: number };
export type CardNewsShape = "rectangle" | "circle";
export type CardNewsImageSourceKind = "assetId" | "proxyUrl";
export const CARD_NEWS_GRADIENT_DIRECTIONS = [
  "top-bottom",
  "bottom-top",
  "left-right",
  "right-left",
  "top-left-bottom-right",
  "top-right-bottom-left",
] as const;
export type CardNewsGradientDirection = (typeof CARD_NEWS_GRADIENT_DIRECTIONS)[number];

export type CardNewsSolidGradient = {
  from: string;
  to: string;
  direction: CardNewsGradientDirection;
};

export type CardNewsColorBackground = {
  type: "color";
  value: string;
  opacity: number;
};

export type CardNewsImageBackground = {
  type: "image";
  value: string;
  valueKind: CardNewsImageSourceKind;
  fit: CardNewsImageFit;
  focalPoint: CardNewsFocalPoint;
  opacity: number;
};

export type CardNewsBackground = CardNewsColorBackground | CardNewsImageBackground;

export type CardNewsTextLayer = {
  id: string;
  type: "text";
  text: string;
  fontFamily: CardNewsFontFamily;
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  letterSpacing: number;
  unit: CardNewsCanonicalUnit;
  maxLines?: number;
  overflow: CardNewsTextOverflow;
  verticalAlign: CardNewsTextVerticalAlign;
  locale: string;
  wordBreak: CardNewsTextWordBreak;
  color: string;
  align: CardNewsTextAlign;
  box: CardNewsBox;
};

export type CardNewsImageLayer = {
  id: string;
  type: "image";
  src: string;
  srcKind: CardNewsImageSourceKind;
  box: CardNewsBox;
  fit: CardNewsImageFit;
  focalPoint: CardNewsFocalPoint;
  opacity: number;
  radius: number;
  radiusUnit: CardNewsCanonicalUnit;
};

export type CardNewsShapeLayer = {
  id: string;
  type: "shape";
  shape: CardNewsShape;
  box: CardNewsBox;
  fill: string;
  radius: number;
};

export type CardNewsSolidLayer = {
  id: string;
  type: "solid";
  box: CardNewsBox;
  color: string;
  opacity: number;
  radius: number;
  gradient?: CardNewsSolidGradient;
};

export type CardNewsLayer = CardNewsTextLayer | CardNewsImageLayer | CardNewsShapeLayer | CardNewsSolidLayer;

export type CardNewsWatermarkLogo = {
  value: string;
  valueKind: CardNewsImageSourceKind;
};

export type CardNewsWatermark = {
  enabled: boolean;
  text: string;
  /** canonical frame pixel 기준 텍스트/브랜드 마크 크기 */
  size: number;
  opacity: number;
  position: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  /** private asset은 owner-scoped resolver가 준비하며 자동 public 전환하지 않는다. */
  logo?: CardNewsWatermarkLogo;
};

export type CardNewsTemplateReference = {
  id: string;
  version: number;
};

export type CardNewsCard = {
  cardId: string;
  order: number;
  background: CardNewsBackground;
  layers: CardNewsLayer[];
  altText: string;
  exportedAssetId?: string;
  /** undefined는 덱 기본 설정을 따르고 false만 해당 카드에서 끈다. */
  watermarkEnabled?: boolean;
};

export type CardNewsDeckPayload = {
  title: string;
  aspectRatio: CardNewsAspectRatio;
  frameSize: CardNewsFrameSize;
  theme: CardNewsTheme;
  cards: CardNewsCard[];
  watermark?: CardNewsWatermark;
  /** preset 적용 당시의 version을 보존해 이후 preset 변경으로 재배치되지 않게 한다. */
  template?: CardNewsTemplateReference;
};

export type CardNewsDeck = CardNewsDeckPayload & {
  documentVersion: typeof CARD_NEWS_DOCUMENT_VERSION;
  deckId: string;
  ownerUid: string;
  revision: number;
  state: "active" | "deleted";
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  /** Agent semantic 입력과 source를 보존해 편집기 재진입·감사를 가능하게 한다. */
  agentMetadata?: CardNewsAgentDeckMetadata;
};

export type CardNewsDeckIssue = {
  path: string;
  message: string;
};

export type CardNewsDeckParseResult =
  | { success: true; data: CardNewsDeckPayload }
  | { success: false; error: string; issues: CardNewsDeckIssue[] };

export type CardNewsDeckAutosaveContract = {
  debounceMs: typeof CARD_NEWS_AUTOSAVE_DEBOUNCE_MS;
  maxRetry: typeof CARD_NEWS_AUTOSAVE_MAX_RETRY;
  requiresRevision: true;
};

type UnknownRecord = Record<string, unknown>;

const HEX_COLOR = /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i;
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const PROXY_IMAGE_URL = /^\/api\/proxy\/image\?(?:[^#]*&)?url=/i;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isInteger(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value);
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function addIssue(issues: CardNewsDeckIssue[], path: string, message: string) {
  issues.push({ path, message });
}

function parseColor(value: unknown, path: string, issues: CardNewsDeckIssue[]) {
  const color = text(value);
  if (!HEX_COLOR.test(color)) {
    addIssue(issues, path, "#RRGGBB 또는 #RRGGBBAA 형식의 색상이어야 합니다.");
    return "#000000";
  }
  return color;
}

function parseOpacity(value: unknown, path: string, issues: CardNewsDeckIssue[]) {
  if (!isFiniteNumber(value) || value < 0 || value > 1) {
    addIssue(issues, path, "투명도는 0..1 범위의 숫자여야 합니다.");
    return 1;
  }
  return value;
}

function parseCanonicalUnit(value: unknown, path: string, issues: CardNewsDeckIssue[]) {
  if (value === CARD_NEWS_CANONICAL_UNIT) return CARD_NEWS_CANONICAL_UNIT;
  addIssue(issues, path, `단위는 ${CARD_NEWS_CANONICAL_UNIT}이어야 합니다.`);
  return CARD_NEWS_CANONICAL_UNIT;
}

function parseFocalPoint(value: unknown, path: string, issues: CardNewsDeckIssue[]): CardNewsFocalPoint {
  const source = isRecord(value) ? value : {};
  const x = source.x;
  const y = source.y;
  if (!isFiniteNumber(x) || x < 0 || x > 1) addIssue(issues, `${path}.x`, "focalPoint x는 0..1 범위의 숫자여야 합니다.");
  if (!isFiniteNumber(y) || y < 0 || y > 1) addIssue(issues, `${path}.y`, "focalPoint y는 0..1 범위의 숫자여야 합니다.");
  return {
    x: isFiniteNumber(x) ? x : 0.5,
    y: isFiniteNumber(y) ? y : 0.5,
  };
}

function parseLocale(value: unknown, path: string, issues: CardNewsDeckIssue[]) {
  const locale = text(value);
  if (!locale || locale.length > 35 || !/^[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{2,8})*$/.test(locale)) {
    addIssue(issues, path, "locale는 유효한 BCP 47 언어 태그여야 합니다.");
    return "ko-KR";
  }
  return locale.replace(/_/g, "-");
}

function parseMaxLines(value: unknown, path: string, issues: CardNewsDeckIssue[]) {
  if (value === undefined) return undefined;
  if (!isInteger(value) || value < 1 || value > 100) {
    addIssue(issues, path, "maxLines는 1..100 범위의 정수여야 합니다.");
    return undefined;
  }
  return value;
}

function parseTemplateReference(value: unknown, path: string, issues: CardNewsDeckIssue[]): CardNewsTemplateReference | undefined {
  if (value === undefined) return undefined;
  const source = isRecord(value) ? value : {};
  const id = text(source.id);
  const version = source.version;
  if (!SAFE_ID.test(id)) addIssue(issues, `${path}.id`, "template id는 영문·숫자·_- 1..128자여야 합니다.");
  if (!isInteger(version) || version < 1 || version > 100) {
    addIssue(issues, `${path}.version`, "template version은 1..100 범위의 정수여야 합니다.");
  }
  return {
    id: id || "template-invalid",
    version: isInteger(version) ? version : 1,
  };
}

function parseBox(value: unknown, path: string, issues: CardNewsDeckIssue[]): CardNewsBox {
  const source = isRecord(value) ? value : {};
  const box = {
    x: source.x,
    y: source.y,
    w: source.w,
    h: source.h,
  };
  for (const key of ["x", "y", "w", "h"] as const) {
    if (!isFiniteNumber(box[key]) || box[key] < 0 || box[key] > 1) {
      addIssue(issues, `${path}.${key}`, "정규화 좌표는 0..1 범위의 숫자여야 합니다.");
    }
  }
  const parsed = {
    x: isFiniteNumber(box.x) ? box.x : 0,
    y: isFiniteNumber(box.y) ? box.y : 0,
    w: isFiniteNumber(box.w) ? box.w : 0,
    h: isFiniteNumber(box.h) ? box.h : 0,
  };
  if (parsed.w <= 0 || parsed.h <= 0) addIssue(issues, path, "박스의 w/h는 0보다 커야 합니다.");
  if (parsed.x + parsed.w > 1.000001 || parsed.y + parsed.h > 1.000001) {
    addIssue(issues, path, "박스가 정규화된 프레임 경계를 넘을 수 없습니다.");
  }
  return parsed;
}

function parseImageSource(value: unknown, kind: unknown, path: string, issues: CardNewsDeckIssue[]) {
  const source = text(value);
  if (!source || source.length > 2_048) {
    addIssue(issues, path, "이미지 참조는 1..2048자여야 합니다.");
    return { value: "", valueKind: "assetId" as const };
  }
  const inferredKind: CardNewsImageSourceKind = kind === "assetId" || kind === "proxyUrl"
    ? kind
    : PROXY_IMAGE_URL.test(source)
      ? "proxyUrl"
      : "assetId";
  if (inferredKind === "assetId" && SAFE_ID.test(source)) return { value: source, valueKind: "assetId" as const };
  if (inferredKind === "proxyUrl" && PROXY_IMAGE_URL.test(source)) return { value: source, valueKind: "proxyUrl" as const };
  addIssue(issues, path, "이미지는 assetId 또는 /api/proxy/image?url= 프록시 참조여야 합니다.");
  return { value: source, valueKind: inferredKind };
}

function parseFit(value: unknown, path: string, issues: CardNewsDeckIssue[]): CardNewsImageFit {
  if (value === "cover" || value === "contain" || value === "fill") return value;
  addIssue(issues, path, "fit은 cover, contain, fill 중 하나여야 합니다.");
  return "cover";
}

function parseBackground(value: unknown, path: string, issues: CardNewsDeckIssue[]): CardNewsBackground {
  const source = isRecord(value) ? value : {};
  if (source.type === "color") {
    return {
      type: "color",
      value: parseColor(source.value, `${path}.value`, issues),
      opacity: parseOpacity(source.opacity, `${path}.opacity`, issues),
    };
  }
  if (source.type === "image") {
    const image = parseImageSource(source.value, source.valueKind, `${path}.value`, issues);
    return {
      type: "image",
      value: image.value,
      valueKind: image.valueKind,
      fit: parseFit(source.fit, `${path}.fit`, issues),
      focalPoint: parseFocalPoint(source.focalPoint, `${path}.focalPoint`, issues),
      opacity: parseOpacity(source.opacity, `${path}.opacity`, issues),
    };
  }
  addIssue(issues, `${path}.type`, "배경 type은 color 또는 image여야 합니다.");
  return { type: "color", value: "#ffffff", opacity: 1 };
}

function parseFontFamily(value: unknown, path: string, issues: CardNewsDeckIssue[]): CardNewsFontFamily {
  if (CARD_NEWS_FONT_FAMILIES.includes(value as CardNewsFontFamily)) return value as CardNewsFontFamily;
  addIssue(issues, path, "허용된 Google Fonts 계열만 사용할 수 있습니다.");
  return CARD_NEWS_FONT_FAMILIES[0];
}

function parseLayer(value: unknown, path: string, issues: CardNewsDeckIssue[]): CardNewsLayer {
  const source = isRecord(value) ? value : {};
  const id = text(source.id);
  if (!SAFE_ID.test(id)) addIssue(issues, `${path}.id`, "레이어 id는 영문·숫자·_- 1..128자여야 합니다.");
  const base = { id: id || "layer-invalid", box: parseBox(source.box, `${path}.box`, issues) };

  if (source.type === "text") {
    const fontFamily = parseFontFamily(source.fontFamily, `${path}.fontFamily`, issues);
    const unit = parseCanonicalUnit(source.unit, `${path}.unit`, issues);
    const fontWeight = source.fontWeight;
    if (!isInteger(fontWeight) || !CARD_NEWS_FONT_WEIGHTS[fontFamily].includes(fontWeight)) {
      addIssue(issues, `${path}.fontWeight`, "선택한 폰트 계열에서 지원하는 weight여야 합니다.");
    }
    const fontSize = source.fontSize;
    if (!isFiniteNumber(fontSize) || fontSize < 8 || fontSize > 240) {
      addIssue(issues, `${path}.fontSize`, "fontSize는 8..240 범위여야 합니다.");
    }
    const parsedFontSize = isFiniteNumber(fontSize) ? fontSize : 16;
    const lineHeight = source.lineHeight;
    if (!isFiniteNumber(lineHeight) || lineHeight < parsedFontSize * 0.8 || lineHeight > parsedFontSize * 3) {
      addIssue(issues, `${path}.lineHeight`, "lineHeight는 fontSize의 0.8..3배인 canonical frame pixel이어야 합니다.");
    }
    const letterSpacing = source.letterSpacing;
    if (!isFiniteNumber(letterSpacing) || letterSpacing < -10 || letterSpacing > 20) {
      addIssue(issues, `${path}.letterSpacing`, "letterSpacing은 -10..20 범위여야 합니다.");
    }
    const align = source.align;
    if (align !== "left" && align !== "center" && align !== "right") {
      addIssue(issues, `${path}.align`, "align은 left, center, right 중 하나여야 합니다.");
    }
    const content = typeof source.text === "string" ? source.text : "";
    if (!content || content.length > CARD_NEWS_MAX_TEXT_LENGTH) {
      addIssue(issues, `${path}.text`, `text는 1..${CARD_NEWS_MAX_TEXT_LENGTH}자여야 합니다.`);
    }
    const maxLines = parseMaxLines(source.maxLines, `${path}.maxLines`, issues);
    return {
      ...base,
      type: "text",
      text: content,
      fontFamily,
      fontSize: parsedFontSize,
      fontWeight: isInteger(fontWeight) ? fontWeight : 400,
      lineHeight: isFiniteNumber(lineHeight) ? lineHeight : 22,
      letterSpacing: isFiniteNumber(letterSpacing) ? letterSpacing : 0,
      unit,
      ...(maxLines !== undefined ? { maxLines } : {}),
      overflow: source.overflow === "ellipsis" || source.overflow === "clip"
        ? source.overflow
        : (addIssue(issues, `${path}.overflow`, "overflow는 clip 또는 ellipsis여야 합니다."), "clip"),
      verticalAlign: source.verticalAlign === "middle" || source.verticalAlign === "bottom" || source.verticalAlign === "top"
        ? source.verticalAlign
        : (addIssue(issues, `${path}.verticalAlign`, "verticalAlign은 top, middle, bottom 중 하나여야 합니다."), "top"),
      locale: parseLocale(source.locale, `${path}.locale`, issues),
      wordBreak: source.wordBreak === "normal" || source.wordBreak === "break-word" || source.wordBreak === "keep-all"
        ? source.wordBreak
        : (addIssue(issues, `${path}.wordBreak`, "wordBreak는 normal, break-word, keep-all 중 하나여야 합니다."), "keep-all"),
      color: parseColor(source.color, `${path}.color`, issues),
      align: align === "center" || align === "right" ? align : "left",
      box: base.box,
    };
  }

  if (source.type === "image") {
    const image = parseImageSource(source.src, source.srcKind, `${path}.src`, issues);
    const radiusUnit = parseCanonicalUnit(source.radiusUnit, `${path}.radiusUnit`, issues);
    const radius = source.radius;
    if (!isFiniteNumber(radius) || radius < 0 || radius > 100) {
      addIssue(issues, `${path}.radius`, "radius는 0..100 범위여야 합니다.");
    }
    return {
      ...base,
      type: "image",
      src: image.value,
      srcKind: image.valueKind,
      box: base.box,
      fit: parseFit(source.fit, `${path}.fit`, issues),
      focalPoint: parseFocalPoint(source.focalPoint, `${path}.focalPoint`, issues),
      opacity: parseOpacity(source.opacity, `${path}.opacity`, issues),
      radius: isFiniteNumber(radius) ? radius : 0,
      radiusUnit,
    };
  }

  if (source.type === "shape") {
    const shape = source.shape;
    if (shape !== "rectangle" && shape !== "circle") {
      addIssue(issues, `${path}.shape`, "shape는 rectangle 또는 circle이어야 합니다.");
    }
    const radius = source.radius;
    if (!isFiniteNumber(radius) || radius < 0 || radius > 100) {
      addIssue(issues, `${path}.radius`, "radius는 0..100 범위여야 합니다.");
    }
    return {
      ...base,
      type: "shape",
      shape: shape === "circle" ? shape : "rectangle",
      box: base.box,
      fill: parseColor(source.fill, `${path}.fill`, issues),
      radius: isFiniteNumber(radius) ? radius : 0,
    };
  }

  if (source.type === "solid") {
    const radius = source.radius;
    if (!isFiniteNumber(radius) || radius < 0 || radius > 100) {
      addIssue(issues, `${path}.radius`, "radius는 0..100 범위여야 합니다.");
    }
    const gradientSource = isRecord(source.gradient) ? source.gradient : null;
    let gradient: CardNewsSolidGradient | undefined;
    if (gradientSource) {
      const direction = gradientSource.direction;
      if (!CARD_NEWS_GRADIENT_DIRECTIONS.includes(direction as CardNewsGradientDirection)) {
        addIssue(issues, `${path}.gradient.direction`, "gradient direction이 올바르지 않습니다.");
      }
      gradient = {
        from: parseColor(gradientSource.from, `${path}.gradient.from`, issues),
        to: parseColor(gradientSource.to, `${path}.gradient.to`, issues),
        direction: CARD_NEWS_GRADIENT_DIRECTIONS.includes(direction as CardNewsGradientDirection)
          ? direction as CardNewsGradientDirection
          : "top-bottom",
      };
    } else if (source.gradient !== undefined) {
      addIssue(issues, `${path}.gradient`, "gradient는 객체여야 합니다.");
    }
    return {
      ...base,
      type: "solid",
      box: base.box,
      color: parseColor(source.color, `${path}.color`, issues),
      opacity: parseOpacity(source.opacity, `${path}.opacity`, issues),
      radius: isFiniteNumber(radius) ? radius : 0,
      ...(gradient ? { gradient } : {}),
    };
  }

  addIssue(issues, `${path}.type`, "layer type은 text, image, shape, solid 중 하나여야 합니다.");
  return {
    ...base,
    type: "shape",
    shape: "rectangle",
    fill: "#000000",
    radius: 0,
  };
}

function parseCard(value: unknown, index: number, issues: CardNewsDeckIssue[]): CardNewsCard {
  const path = `cards[${index}]`;
  const source = isRecord(value) ? value : {};
  const cardId = text(source.cardId);
  if (!SAFE_ID.test(cardId)) addIssue(issues, `${path}.cardId`, "cardId는 영문·숫자·_- 1..128자여야 합니다.");
  if (source.order !== index) addIssue(issues, `${path}.order`, "카드 order는 cards 배열의 0부터 시작하는 순번과 같아야 합니다.");
  const rawLayers = Array.isArray(source.layers) ? source.layers : [];
  if (rawLayers.length > CARD_NEWS_MAX_LAYERS_PER_CARD) {
    addIssue(issues, `${path}.layers`, `카드당 레이어는 ${CARD_NEWS_MAX_LAYERS_PER_CARD}개까지 허용됩니다.`);
  }
  const layerIds = new Set<string>();
  const layers = rawLayers.slice(0, CARD_NEWS_MAX_LAYERS_PER_CARD).map((layer, layerIndex) => {
    const parsed = parseLayer(layer, `${path}.layers[${layerIndex}]`, issues);
    if (layerIds.has(parsed.id)) addIssue(issues, `${path}.layers[${layerIndex}].id`, "카드 안에서 layer id는 중복될 수 없습니다.");
    layerIds.add(parsed.id);
    return parsed;
  });
  const exportedAssetId = text(source.exportedAssetId);
  if (exportedAssetId && !SAFE_ID.test(exportedAssetId)) {
    addIssue(issues, `${path}.exportedAssetId`, "exportedAssetId 형식이 올바르지 않습니다.");
  }
  const altText = typeof source.altText === "string" ? source.altText.trim() : "";
  if (altText.length > CARD_NEWS_MAX_ALT_TEXT_LENGTH) {
    addIssue(issues, `${path}.altText`, `altText는 ${CARD_NEWS_MAX_ALT_TEXT_LENGTH}자까지 허용됩니다.`);
  }
  if (source.watermarkEnabled !== undefined && typeof source.watermarkEnabled !== "boolean") {
    addIssue(issues, `${path}.watermarkEnabled`, "watermarkEnabled는 boolean이어야 합니다.");
  }
  return {
    cardId: cardId || `card-invalid-${index}`,
    order: index,
    background: parseBackground(source.background, `${path}.background`, issues),
    layers,
    altText,
    ...(exportedAssetId ? { exportedAssetId } : {}),
    ...(typeof source.watermarkEnabled === "boolean" ? { watermarkEnabled: source.watermarkEnabled } : {}),
  };
}

export function parseCardNewsDeckPayload(value: unknown): CardNewsDeckParseResult {
  const issues: CardNewsDeckIssue[] = [];
  const source = isRecord(value) ? value : {};
  const title = typeof source.title === "string" ? source.title.trim() : "";
  if (!title || title.length > CARD_NEWS_MAX_TITLE_LENGTH) {
    addIssue(issues, "title", `title은 1..${CARD_NEWS_MAX_TITLE_LENGTH}자여야 합니다.`);
  }

  const aspectRatio = source.aspectRatio;
  if (!CARD_NEWS_ASPECT_RATIOS.includes(aspectRatio as CardNewsAspectRatio)) {
    addIssue(issues, "aspectRatio", "aspectRatio는 1:1 또는 4:5여야 합니다.");
  }
  const parsedAspectRatio = aspectRatio === "1:1" ? "1:1" : "4:5";

  const frame = isRecord(source.frameSize) ? source.frameSize : {};
  const w = frame.w;
  const h = frame.h;
  if (!isInteger(w) || w < 320 || w > 4_096 || !isInteger(h) || h < 320 || h > 4_096) {
    addIssue(issues, "frameSize", "frameSize w/h는 320..4096 범위의 정수여야 합니다.");
  }
  const frameSize = { w: isInteger(w) ? w : 1_080, h: isInteger(h) ? h : 1_350 };
  const expectedRatio = parsedAspectRatio === "1:1" ? 1 : 0.8;
  if (Math.abs(frameSize.w / frameSize.h - expectedRatio) > 0.01) {
    addIssue(issues, "frameSize", `${parsedAspectRatio} aspectRatio와 frameSize 비율이 일치해야 합니다.`);
  }

  const themeSource = isRecord(source.theme) ? source.theme : {};
  const fontFamily = parseFontFamily(themeSource.fontFamily, "theme.fontFamily", issues);
  const paletteSource = Array.isArray(themeSource.palette) ? themeSource.palette : [];
  if (paletteSource.length > 8) addIssue(issues, "theme.palette", "palette는 8개까지 허용됩니다.");
  const palette = paletteSource.slice(0, 8).map((color, index) => parseColor(color, `theme.palette[${index}]`, issues));
  const theme: CardNewsTheme = {
    backgroundColor: parseColor(themeSource.backgroundColor, "theme.backgroundColor", issues),
    fontFamily,
    palette,
  };

  const rawCards = Array.isArray(source.cards) ? source.cards : [];
  if (rawCards.length < 1 || rawCards.length > CARD_NEWS_MAX_CARDS) {
    addIssue(issues, "cards", `cards는 1..${CARD_NEWS_MAX_CARDS}장이어야 합니다.`);
  }
  const cardIds = new Set<string>();
  const cards = rawCards.slice(0, CARD_NEWS_MAX_CARDS).map((card, index) => {
    const parsed = parseCard(card, index, issues);
    if (cardIds.has(parsed.cardId)) addIssue(issues, `cards[${index}].cardId`, "deck 안에서 cardId는 중복될 수 없습니다.");
    cardIds.add(parsed.cardId);
    return parsed;
  });

  let watermark: CardNewsWatermark | undefined;
  if (source.watermark !== undefined) {
    const watermarkSource = isRecord(source.watermark) ? source.watermark : {};
    const watermarkText = typeof watermarkSource.text === "string" ? watermarkSource.text.trim() : "";
    if (watermarkText.length > 120) addIssue(issues, "watermark.text", "watermark text는 120자까지 허용됩니다.");
    const size = watermarkSource.size === undefined ? 24 : watermarkSource.size;
    if (!isFiniteNumber(size) || size < 8 || size > 120) {
      addIssue(issues, "watermark.size", "watermark size는 8..120 범위의 canonical frame pixel이어야 합니다.");
    }
    const position = watermarkSource.position;
    if (position !== "top-left" && position !== "top-right" && position !== "bottom-left" && position !== "bottom-right") {
      addIssue(issues, "watermark.position", "watermark position이 올바르지 않습니다.");
    }
    let logo: CardNewsWatermark["logo"];
    if (watermarkSource.logo !== undefined) {
      const logoSource = isRecord(watermarkSource.logo) ? watermarkSource.logo : {};
      const parsedLogo = parseImageSource(
        logoSource.value,
        logoSource.valueKind,
        "watermark.logo.value",
        issues,
      );
      logo = { value: parsedLogo.value, valueKind: parsedLogo.valueKind };
    }
    watermark = {
      enabled: watermarkSource.enabled === true,
      text: watermarkText,
      size: isFiniteNumber(size) ? size : 24,
      opacity: parseOpacity(watermarkSource.opacity, "watermark.opacity", issues),
      position: position === "top-left" || position === "top-right" || position === "bottom-left" ? position : "bottom-right",
      ...(logo ? { logo } : {}),
    };
  }

  const template = parseTemplateReference(source.template, "template", issues);

  if (issues.length > 0) return { success: false, error: issues[0].message, issues };
  return {
    success: true,
    data: {
      title,
      aspectRatio: parsedAspectRatio,
      frameSize,
      theme,
      cards,
      ...(watermark ? { watermark } : {}),
      ...(template ? { template } : {}),
    },
  };
}

export function getDefaultCardNewsDeckPayload(): CardNewsDeckPayload {
  return {
    title: "새 카드뉴스",
    aspectRatio: "4:5",
    frameSize: { w: 1_080, h: 1_350 },
    theme: {
      backgroundColor: "#ffffff",
      fontFamily: "Noto Sans KR",
      palette: ["#ffffff", "#111827", "#e85d75"],
    },
    cards: [
      {
        cardId: "card-0",
        order: 0,
        background: { type: "color", value: "#ffffff", opacity: 1 },
        layers: [],
        altText: "",
      },
    ],
    watermark: {
      enabled: false,
      text: "",
      size: 24,
      opacity: 0.7,
      position: "bottom-right",
    },
  };
}

export function pickCardNewsDeckPayload(value: unknown): Partial<CardNewsDeckPayload> {
  if (!isRecord(value)) return {};
  const output: Partial<CardNewsDeckPayload> = {};
  for (const key of ["title", "aspectRatio", "frameSize", "theme", "cards", "watermark", "template"] as const) {
    if (value[key] !== undefined) output[key] = value[key] as never;
  }
  return output;
}

export function mergeCardNewsDeckPayload(base: CardNewsDeckPayload, patch: unknown): CardNewsDeckPayload {
  const picked = pickCardNewsDeckPayload(patch);
  return {
    ...base,
    ...picked,
    frameSize: picked.frameSize ? { ...base.frameSize, ...picked.frameSize } : base.frameSize,
    theme: picked.theme ? { ...base.theme, ...picked.theme } : base.theme,
  };
}

export function toFramePixelBox(box: CardNewsBox, frameSize: CardNewsFrameSize): CardNewsPixelBox {
  const left = Math.round(box.x * frameSize.w);
  const top = Math.round(box.y * frameSize.h);
  const right = Math.round((box.x + box.w) * frameSize.w);
  const bottom = Math.round((box.y + box.h) * frameSize.h);
  return {
    x: left,
    y: top,
    w: right - left,
    h: bottom - top,
  };
}

export function scaleCardNewsCanonicalPixels(value: number, frameSize: CardNewsFrameSize) {
  return value * (frameSize.w / CARD_NEWS_CANONICAL_FRAME_WIDTH);
}
