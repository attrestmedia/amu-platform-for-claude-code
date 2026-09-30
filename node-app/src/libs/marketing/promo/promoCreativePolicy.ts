import type {
  IMarketingPromoCreative,
  MarketingPromoSlot,
} from "models/marketing/MarketingPromoCreativeSchema";

const TARGETING_DIMENSION_WEIGHT = {
  templateKeys: 8,
  tags: 4,
  includeCategories: 2,
} as const;

const SLOT_ORIENTATION: Record<MarketingPromoSlot, "landscape" | "portrait"> = {
  article_inline: "landscape",
  article_end: "landscape",
  home_hero: "landscape",
  home_after_featured: "landscape",
  home_footer_cta: "landscape",
  list_inline_3: "landscape",
  list_sidebar_sticky: "portrait",
};

function targetingDimensionScore(item: IMarketingPromoCreative) {
  return (Object.keys(TARGETING_DIMENSION_WEIGHT) as Array<keyof typeof TARGETING_DIMENSION_WEIGHT>)
    .reduce(
      (score, key) => score + (item.targeting[key]?.length ? TARGETING_DIMENSION_WEIGHT[key] : 0),
      0,
    );
}

function targetingBreadth(item: IMarketingPromoCreative) {
  return (
    item.targeting.templateKeys.length
    + item.targeting.tags.length
    + item.targeting.includeCategories.length
  );
}

/**
 * 타겟팅 차원이 더 구체적인 소재를 먼저 두고, 같은 차원 조합이면 허용값이 적은 소재를 우선한다.
 * 완전히 동률이면 0을 반환해 repository의 updatedAt desc 순서를 보존한다.
 */
export function comparePromoTargetingSpecificity(
  a: IMarketingPromoCreative,
  b: IMarketingPromoCreative,
) {
  const dimensionDiff = targetingDimensionScore(b) - targetingDimensionScore(a);
  if (dimensionDiff) return dimensionDiff;
  return targetingBreadth(a) - targetingBreadth(b);
}

function canonicalTargetingValues(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))).sort();
}

/** A/B 파트너가 동일한 독자 집단을 겨냥하는지 비교한다. */
export function hasSamePromoTargetingScope(
  a: IMarketingPromoCreative,
  b: IMarketingPromoCreative,
) {
  const keys: Array<keyof IMarketingPromoCreative["targeting"]> = [
    "includeCategories",
    "excludeCategories",
    "tags",
    "templateKeys",
  ];
  return keys.every((key) => {
    const left = canonicalTargetingValues(a.targeting[key]);
    const right = canonicalTargetingValues(b.targeting[key]);
    return left.length === right.length && left.every((value, index) => value === right[index]);
  });
}

/**
 * home_hero와 home_after_featured는 여러 소재를 동시에 노출한다.
 * 그 외 슬롯은 클라이언트가 첫 소재의 캠페인 버킷으로 variant를 선택하므로, 다른 캠페인을
 * 섞지 않고 동일 캠페인·축·타겟 범위의 반대 variant만 함께 반환한다.
 */
export function pickPromoServingSet(
  ranked: IMarketingPromoCreative[],
  slotId: MarketingPromoSlot,
  requestedLimit: number,
) {
  const limit = Math.max(1, Math.min(5, requestedLimit));
  if (!ranked.length || slotId === "home_hero" || slotId === "home_after_featured") return ranked.slice(0, limit);

  const primary = ranked[0];
  if (limit === 1) return [primary];
  const partner = ranked.find(
    (item) => item.creativeId !== primary.creativeId
      && item.campaignId === primary.campaignId
      && item.axis === primary.axis
      && item.variant !== primary.variant
      && hasSamePromoTargetingScope(item, primary),
  );
  return partner ? [primary, partner] : [primary];
}

export function getPromoUrlHostname(value: unknown) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return "";
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
    return url.hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function normalizePromoImageUrl(
  value: unknown,
  options: { allowedHosts: ReadonlySet<string>; allowHttpLocalhost?: boolean },
) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return "";
  try {
    const url = new URL(raw);
    const hostname = url.hostname.toLowerCase();
    const allowedProtocol = url.protocol === "https:"
      || (options.allowHttpLocalhost === true && hostname === "localhost" && url.protocol === "http:");
    if (!allowedProtocol || !options.allowedHosts.has(hostname) || url.username || url.password) return "";
    return url.toString();
  } catch {
    return "";
  }
}

export function hasPromoSlotOrientationConflict(
  slotIds: MarketingPromoSlot[],
  hasImage: boolean,
) {
  if (!hasImage || slotIds.length < 2) return false;
  return new Set(slotIds.map((slot) => SLOT_ORIENTATION[slot])).size > 1;
}
