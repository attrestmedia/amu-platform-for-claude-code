"use client";

import { trackGaEvent } from "./ga4";

export type CardNewsExportScope = "card" | "deck";

type CardNewsTrackingBase = {
  cardCount: number;
  aspectRatio: "1:1" | "4:5";
};

function normalizeCardCount(value: number) {
  return Math.max(1, Math.min(10, Math.floor(Number.isFinite(value) ? value : 1)));
}

function buildBaseParams({ cardCount, aspectRatio }: CardNewsTrackingBase) {
  return {
    card_count: normalizeCardCount(cardCount),
    aspect_ratio: aspectRatio,
  };
}

/**
 * CardNews 편집기 사용 계측은 내부 ID나 계정 식별자 없이 제품 행동과 안전한 집계 차원만 보낸다.
 * 게시물 성과는 Marketing Oops publish log/Insights가 소유하므로 여기서 발행 이벤트를 중복 발화하지 않는다.
 */
export function trackCardNewsDeckCreated(args: CardNewsTrackingBase) {
  return trackGaEvent("card_news_deck_created", buildBaseParams(args));
}

export function trackCardNewsExported(args: CardNewsTrackingBase & { exportScope: CardNewsExportScope }) {
  return trackGaEvent("card_news_exported", {
    ...buildBaseParams(args),
    export_scope: args.exportScope,
  });
}

export function trackCardNewsAssetsUploaded(args: CardNewsTrackingBase & { assetCount: number }) {
  return trackGaEvent("card_news_assets_uploaded", {
    ...buildBaseParams(args),
    asset_count: normalizeCardCount(args.assetCount),
  });
}
