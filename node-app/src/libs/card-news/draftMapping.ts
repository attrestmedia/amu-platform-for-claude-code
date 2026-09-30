/**
 * @docHint
 * @purpose 렌더된 CardNews 카드와 Instagram 검수 draft 사이의 순서·대체텍스트 계약
 * @process CardDeck cards + rendered references → legacy first-image fields + ordered card mapping
 * @domain card-news
 * @scope marketing_bridge
 */

import type { CardNewsDeckPayload } from "types/card-news";

export const CARD_NEWS_DRAFT_KIND = "card_news" as const;

export type CardNewsDraftMetadata = {
  kind: typeof CARD_NEWS_DRAFT_KIND;
  deckId?: string;
  cardIds: string[];
  altTexts: string[];
  visualEvidenceCardIds: string[];
  hasVisualEvidence: boolean;
  uploadPolicyVersion?: number;
};

export type CardNewsRenderedCardReference = {
  cardId: string;
  imageUrl?: string;
  imageAssetId?: string;
};

export type CardNewsInstagramDraftCard = CardNewsRenderedCardReference & {
  order: number;
  altText: string;
};

export type CardNewsInstagramDraftMapping = {
  channel: "instagram";
  title: string;
  imageUrl?: string;
  imageAssetId?: string;
  imageAlt: string;
  imageUrls?: string[];
  imageAssetIds?: string[];
  imageCards: CardNewsInstagramDraftCard[];
  cardNews: CardNewsDraftMetadata;
};

export class CardNewsDraftMappingError extends Error {
  readonly code = "INVALID_CARD_NEWS_DRAFT_MAPPING";

  constructor(message: string) {
    super(message);
    this.name = "CardNewsDraftMappingError";
  }
}

function nonEmpty(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

export function getCardNewsVisualEvidenceCardIds(deck: CardNewsDeckPayload) {
  return deck.cards
    .filter((card) =>
      card.background.type === "image" || card.layers.some((layer) => layer.type === "image"),
    )
    .map((card) => card.cardId);
}

export function getCardNewsPublishGateError(draft: Record<string, unknown> | null | undefined) {
  const metadata = draft?.cardNews;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return "";
  const cardNews = metadata as Partial<CardNewsDraftMetadata>;
  if (cardNews.kind !== CARD_NEWS_DRAFT_KIND) return "";
  if (cardNews.hasVisualEvidence !== true || !Array.isArray(cardNews.visualEvidenceCardIds) || cardNews.visualEvidenceCardIds.length === 0) {
    return "card_news_visual_evidence_required";
  }
  if (!Array.isArray(cardNews.cardIds) || cardNews.cardIds.length === 0 || !cardNews.cardIds.every(nonEmpty)) {
    return "card_news_card_ids_required";
  }
  const cardIdSet = new Set(cardNews.cardIds);
  if (!cardNews.visualEvidenceCardIds.every((cardId) => nonEmpty(cardId) && cardIdSet.has(cardId))) {
    return "card_news_visual_evidence_invalid";
  }
  if (!Array.isArray(cardNews.altTexts) || cardNews.altTexts.length !== cardNews.cardIds.length) {
    return "card_news_alt_texts_mismatch";
  }
  const imageAssetIds = Array.isArray(draft.imageAssetIds)
    ? draft.imageAssetIds.filter(nonEmpty)
    : [];
  const imageUrls = Array.isArray(draft.imageUrls)
    ? draft.imageUrls.filter(nonEmpty)
    : [];
  if (imageAssetIds.length !== cardNews.cardIds.length && imageUrls.length !== cardNews.cardIds.length) {
    return "card_news_card_asset_count_mismatch";
  }
  if (!Number.isInteger(cardNews.uploadPolicyVersion) || Number(cardNews.uploadPolicyVersion) < 1) {
    return "marketing_upload_policy_version_required";
  }
  return "";
}

export function mapCardNewsDeckToInstagramDraft(input: {
  deck: CardNewsDeckPayload;
  renderedCards: readonly CardNewsRenderedCardReference[];
}): CardNewsInstagramDraftMapping {
  if (input.deck.cards.length === 0) {
    throw new CardNewsDraftMappingError("카드가 하나 이상인 덱만 Instagram draft로 매핑할 수 있습니다.");
  }
  if (input.renderedCards.length !== input.deck.cards.length) {
    throw new CardNewsDraftMappingError("덱의 카드 수와 렌더 결과 수가 일치해야 합니다.");
  }

  const imageCards = input.deck.cards.map((card, index) => {
    const rendered = input.renderedCards[index];
    if (!rendered || rendered.cardId !== card.cardId) {
      throw new CardNewsDraftMappingError("렌더 결과는 CardDeck 카드 순서와 cardId를 보존해야 합니다.");
    }
    if (!nonEmpty(rendered.imageUrl) && !nonEmpty(rendered.imageAssetId)) {
      throw new CardNewsDraftMappingError(`카드 ${card.cardId}의 렌더 결과 참조가 없습니다.`);
    }
    return {
      cardId: card.cardId,
      order: index,
      altText: card.altText,
      ...(rendered.imageUrl ? { imageUrl: rendered.imageUrl } : {}),
      ...(rendered.imageAssetId ? { imageAssetId: rendered.imageAssetId } : {}),
    };
  });

  const first = imageCards[0];
  const imageUrls = imageCards.every((card) => nonEmpty(card.imageUrl))
    ? imageCards.map((card) => card.imageUrl as string)
    : undefined;
  const imageAssetIds = imageCards.every((card) => nonEmpty(card.imageAssetId))
    ? imageCards.map((card) => card.imageAssetId as string)
    : undefined;
  const visualEvidenceCardIds = getCardNewsVisualEvidenceCardIds(input.deck);
  const deckId = "deckId" in input.deck && nonEmpty(input.deck.deckId)
    ? String(input.deck.deckId).trim()
    : undefined;

  return {
    channel: "instagram",
    title: input.deck.title,
    ...(first.imageUrl ? { imageUrl: first.imageUrl } : {}),
    ...(first.imageAssetId ? { imageAssetId: first.imageAssetId } : {}),
    imageAlt: first.altText,
    ...(imageUrls ? { imageUrls } : {}),
    ...(imageAssetIds ? { imageAssetIds } : {}),
    imageCards,
    cardNews: {
      kind: CARD_NEWS_DRAFT_KIND,
      ...(deckId ? { deckId } : {}),
      cardIds: imageCards.map((card) => card.cardId),
      altTexts: imageCards.map((card) => card.altText),
      visualEvidenceCardIds,
      hasVisualEvidence: visualEvidenceCardIds.length > 0,
    },
  };
}
