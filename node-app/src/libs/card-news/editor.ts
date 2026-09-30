import {
  CARD_NEWS_CANONICAL_UNIT,
  CARD_NEWS_MAX_CARDS,
  getDefaultCardNewsDeckPayload,
  type CardNewsBackground,
  type CardNewsBox,
  type CardNewsCard,
  type CardNewsDeckPayload,
  type CardNewsImageFit,
  type CardNewsImageLayer,
  type CardNewsImageSourceKind,
  type CardNewsLayer,
  type CardNewsSolidLayer,
  type CardNewsTextAlign,
  type CardNewsTextLayer,
} from "types/card-news/cardDeck";

export type CardNewsLayerBoxMode = "move" | "resize";
export type CardNewsResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

function createId(prefix: string) {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  return `${prefix}-${randomUuid ? randomUuid.replace(/-/g, "").slice(0, 18) : `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function clampBox(box: CardNewsBox, minSize = 0.02): CardNewsBox {
  const w = clamp(Number(box.w) || minSize, minSize, 1);
  const h = clamp(Number(box.h) || minSize, minSize, 1);
  return {
    x: clamp(Number(box.x) || 0, 0, 1 - w),
    y: clamp(Number(box.y) || 0, 0, 1 - h),
    w,
    h,
  };
}

export function resizeCardNewsBoxByHandle(box: CardNewsBox, delta: { x: number; y: number }, handle: CardNewsResizeHandle): CardNewsBox {
  const right = box.x + box.w;
  const bottom = box.y + box.h;
  const left = handle.includes("w") ? box.x + delta.x : box.x;
  const top = handle.includes("n") ? box.y + delta.y : box.y;
  const nextRight = handle.includes("e") ? right + delta.x : right;
  const nextBottom = handle.includes("s") ? bottom + delta.y : bottom;
  return {
    x: left,
    y: top,
    w: nextRight - left,
    h: nextBottom - top,
  };
}

function withCard(document: CardNewsDeckPayload, cardId: string, update: (card: CardNewsCard) => CardNewsCard) {
  return {
    ...document,
    cards: document.cards.map((card) => (card.cardId === cardId ? update(card) : card)),
  };
}

function withLayer(
  document: CardNewsDeckPayload,
  cardId: string,
  layerId: string,
  update: (layer: CardNewsLayer) => CardNewsLayer,
) {
  return withCard(document, cardId, (card) => ({
    ...card,
    layers: card.layers.map((layer) => (layer.id === layerId ? update(layer) : layer)),
  }));
}

export function getCardNewsCard(document: CardNewsDeckPayload, cardId: string) {
  return document.cards.find((card) => card.cardId === cardId) || null;
}

export function getCardNewsLayer(document: CardNewsDeckPayload, cardId: string, layerId: string) {
  return getCardNewsCard(document, cardId)?.layers.find((layer) => layer.id === layerId) || null;
}

export function createCardNewsTextLayer(document: CardNewsDeckPayload): CardNewsTextLayer {
  return {
    id: createId("text"),
    type: "text",
    text: "새 텍스트",
    fontFamily: document.theme.fontFamily,
    fontSize: 56,
    fontWeight: 700,
    lineHeight: 72,
    letterSpacing: 0,
    unit: CARD_NEWS_CANONICAL_UNIT,
    maxLines: 4,
    overflow: "clip",
    verticalAlign: "top",
    locale: "ko-KR",
    wordBreak: "keep-all",
    color: "#15161e",
    align: "left",
    box: { x: 0.1, y: 0.12, w: 0.8, h: 0.24 },
  };
}

export function createCardNewsImageLayer(input: {
  value: string;
  valueKind: CardNewsImageSourceKind;
  fit?: CardNewsImageFit;
}): CardNewsImageLayer {
  return {
    id: createId("image"),
    type: "image",
    src: input.value,
    srcKind: input.valueKind,
    box: { x: 0.1, y: 0.42, w: 0.8, h: 0.42 },
    fit: input.fit || "cover",
    focalPoint: { x: 0.5, y: 0.5 },
    opacity: 1,
    radius: 0,
    radiusUnit: CARD_NEWS_CANONICAL_UNIT,
  };
}

export function createCardNewsSolidLayer(): CardNewsSolidLayer {
  return {
    id: createId("solid"),
    type: "solid",
    // 새 솔리드는 이미지 배경 위, 기존 텍스트 아래에 놓여 가독성 보정용으로 바로 쓸 수 있다.
    box: { x: 0, y: 0.56, w: 1, h: 0.44 },
    color: "#111827",
    opacity: 0.72,
    radius: 0,
  };
}

export function addCardNewsLayer(document: CardNewsDeckPayload, cardId: string, layer: CardNewsLayer) {
  return withCard(document, cardId, (card) => ({ ...card, layers: [...card.layers, layer] }));
}

export function addCardNewsSolidLayer(document: CardNewsDeckPayload, cardId: string, layer: CardNewsSolidLayer) {
  return withCard(document, cardId, (card) => {
    const firstTextIndex = card.layers.findIndex((candidate) => candidate.type === "text");
    const insertAt = firstTextIndex >= 0 ? firstTextIndex : card.layers.length;
    const layers = [...card.layers];
    layers.splice(insertAt, 0, layer);
    return { ...card, layers };
  });
}

export function updateCardNewsLayer(
  document: CardNewsDeckPayload,
  cardId: string,
  layerId: string,
  patch: Partial<CardNewsLayer>,
) {
  return withLayer(document, cardId, layerId, (layer) => {
    const next = { ...layer, ...patch } as CardNewsLayer;
    if (patch.box) next.box = clampBox(patch.box);
    return next;
  });
}

export function setCardNewsLayerBox(
  document: CardNewsDeckPayload,
  cardId: string,
  layerId: string,
  box: CardNewsBox,
) {
  return updateCardNewsLayer(document, cardId, layerId, { box: clampBox(box) });
}

export function moveCardNewsLayer(
  document: CardNewsDeckPayload,
  cardId: string,
  layerId: string,
  delta: { x: number; y: number },
) {
  const layer = getCardNewsLayer(document, cardId, layerId);
  if (!layer) return document;
  return setCardNewsLayerBox(document, cardId, layerId, {
    ...layer.box,
    x: layer.box.x + delta.x,
    y: layer.box.y + delta.y,
  });
}

export function resizeCardNewsLayer(
  document: CardNewsDeckPayload,
  cardId: string,
  layerId: string,
  delta: { w: number; h: number },
) {
  const layer = getCardNewsLayer(document, cardId, layerId);
  if (!layer) return document;
  return setCardNewsLayerBox(document, cardId, layerId, {
    ...layer.box,
    w: layer.box.w + delta.w,
    h: layer.box.h + delta.h,
  });
}

export function deleteCardNewsLayer(document: CardNewsDeckPayload, cardId: string, layerId: string) {
  return withCard(document, cardId, (card) => ({
    ...card,
    layers: card.layers.filter((layer) => layer.id !== layerId),
  }));
}

export function duplicateCardNewsLayer(document: CardNewsDeckPayload, cardId: string, layerId: string) {
  const layer = getCardNewsLayer(document, cardId, layerId);
  if (!layer) return { document, layerId: null };
  const duplicate = {
    ...layer,
    id: createId(layer.type),
    box: clampBox({ ...layer.box, x: layer.box.x + 0.025, y: layer.box.y + 0.025 }),
  } as CardNewsLayer;
  return {
    document: addCardNewsLayer(document, cardId, duplicate),
    layerId: duplicate.id,
  };
}

export function updateCardNewsBackground(
  document: CardNewsDeckPayload,
  cardId: string,
  background: Partial<CardNewsBackground> & { type: CardNewsBackground["type"] },
) {
  return withCard(document, cardId, (card) => ({
    ...card,
    background: { ...card.background, ...background } as CardNewsBackground,
  }));
}

export function updateCardNewsCard(document: CardNewsDeckPayload, cardId: string, patch: Partial<CardNewsCard>) {
  return withCard(document, cardId, (card) => ({ ...card, ...patch, cardId: card.cardId, order: card.order }));
}

export function addCardNewsCard(document: CardNewsDeckPayload, sourceCardId?: string) {
  if (document.cards.length >= CARD_NEWS_MAX_CARDS) return { document, cardId: null, blocked: true };
  const source = sourceCardId ? getCardNewsCard(document, sourceCardId) : null;
  const cardId = createId("card");
  const card: CardNewsCard = source
    ? {
        cardId,
        order: document.cards.length,
        background: source.background,
        layers: source.layers.map((layer) => ({ ...layer, id: createId(layer.type), box: { ...layer.box } })),
        altText: source.altText,
        ...(source.watermarkEnabled !== undefined ? { watermarkEnabled: source.watermarkEnabled } : {}),
      }
    : {
        cardId,
        order: document.cards.length,
        background: { type: "color", value: document.theme.backgroundColor, opacity: 1 },
        layers: [],
        altText: "",
      };
  return { document: { ...document, cards: [...document.cards, card] }, cardId, blocked: false };
}

export function deleteCardNewsCard(document: CardNewsDeckPayload, cardId: string) {
  if (document.cards.length <= 1) return { document, blocked: true };
  const cards = document.cards
    .filter((card) => card.cardId !== cardId)
    .map((card, order) => ({ ...card, order }));
  return { document: { ...document, cards }, blocked: false };
}

export function reorderCardNewsCard(document: CardNewsDeckPayload, cardId: string, direction: -1 | 1) {
  const index = document.cards.findIndex((card) => card.cardId === cardId);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= document.cards.length) return document;
  const cards = [...document.cards];
  [cards[index], cards[nextIndex]] = [cards[nextIndex], cards[index]];
  return { ...document, cards: cards.map((card, order) => ({ ...card, order })) };
}

export function createCardNewsDocument() {
  return getDefaultCardNewsDeckPayload();
}

export function normalizeCardNewsKeyboardDelta(document: CardNewsDeckPayload, layerId: string, shiftKey: boolean) {
  const layer = document.cards.flatMap((card) => card.layers).find((candidate) => candidate.id === layerId);
  if (!layer) return { x: 0, y: 0 };
  return {
    x: shiftKey ? layer.box.w * 0.05 : 8 / document.frameSize.w,
    y: shiftKey ? layer.box.h * 0.05 : 8 / document.frameSize.h,
  };
}

export function setCardNewsTextAlign(document: CardNewsDeckPayload, cardId: string, layerId: string, align: CardNewsTextAlign) {
  return updateCardNewsLayer(document, cardId, layerId, { align });
}
