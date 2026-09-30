export type StudioTemplateCatalogItem = {
  key?: unknown;
  title?: unknown;
  tags?: readonly unknown[];
  categories?: readonly unknown[];
};

export type StudioTemplatePreferenceOptions = {
  preferredTemplateKeys?: readonly unknown[];
  preferredTemplateTags?: readonly unknown[];
  preferredTemplateCategories?: readonly unknown[];
};

export type StudioRecommendedTemplateValue = string | { templateKey?: unknown };

export type StudioRecommendedTemplateProps = {
  recommendedTemplateKeys?: readonly unknown[] | null;
  /** @deprecated 내부 소비부는 recommendedTemplateKeys를 사용한다. */
  recommendedTemplates?: readonly StudioRecommendedTemplateValue[] | null;
};

export function normalizeStudioTemplateKey(value: unknown) {
  return String(value || "").trim();
}

export function normalizeStudioTemplateKeyList(values?: readonly unknown[] | null) {
  const seen = new Set<string>();
  const normalized: string[] = [];

  (values || []).forEach((value) => {
    const key = normalizeStudioTemplateKey(value);
    if (!key || seen.has(key)) return;
    seen.add(key);
    normalized.push(key);
  });

  return normalized;
}

export function normalizeStudioRecommendedTemplateKeys(values?: readonly unknown[] | null) {
  return normalizeStudioTemplateKeyList(
    (values || []).map((value) => {
      if (typeof value !== "object" || value === null) return value;
      return (value as { templateKey?: unknown }).templateKey;
    }),
  );
}

/** 추천 prop의 canonical/legacy 입력을 같은 키 목록 계약으로 정규화한다. */
export function normalizeStudioRecommendedTemplateProps(options: StudioRecommendedTemplateProps = {}) {
  const canonical = normalizeStudioTemplateKeyList(options.recommendedTemplateKeys);
  return canonical.length
    ? canonical
    : normalizeStudioRecommendedTemplateKeys(options.recommendedTemplates);
}

export function deduplicateStudioTemplateItems<T extends StudioTemplateCatalogItem>(
  items: readonly T[],
  options: { keep?: "first" | "last" } = {},
) {
  const keep = options.keep || "last";
  const itemByKey = new Map<string, T & { key: string }>();

  items.forEach((item) => {
    const key = normalizeStudioTemplateKey(item?.key);
    if (!key || (keep === "first" && itemByKey.has(key))) return;
    itemByKey.set(key, { ...item, key });
  });

  return Array.from(itemByKey.values());
}

export function sortStudioTemplateItemsByKeyOrder<T extends StudioTemplateCatalogItem>(
  items: readonly T[],
  keys: readonly unknown[],
) {
  const orderMap = new Map(normalizeStudioTemplateKeyList(keys).map((key, index) => [key, index] as const));

  return [...items].sort((a, b) => {
    const aKey = normalizeStudioTemplateKey(a?.key);
    const bKey = normalizeStudioTemplateKey(b?.key);
    const aOrder = orderMap.get(aKey) ?? Number.MAX_SAFE_INTEGER;
    const bOrder = orderMap.get(bKey) ?? Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return String(a?.title || aKey).localeCompare(String(b?.title || bKey));
  });
}

export function normalizeStudioTemplateSearchValue(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[()[\]{}"'`.,/\\|_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function createStudioTemplatePreferenceRanker(options: StudioTemplatePreferenceOptions = {}) {
  const preferredKeyRank = new Map<string, number>();
  (options.preferredTemplateKeys || []).forEach((value, index) => {
    const key = normalizeStudioTemplateKey(value);
    if (key) preferredKeyRank.set(key, index);
  });
  const preferredTags = new Set(
    (options.preferredTemplateTags || []).map(normalizeStudioTemplateSearchValue).filter(Boolean),
  );
  const preferredCategories = new Set(
    (options.preferredTemplateCategories || []).map(normalizeStudioTemplateSearchValue).filter(Boolean),
  );

  return (item: StudioTemplateCatalogItem) => {
    const keyRank = preferredKeyRank.get(normalizeStudioTemplateKey(item?.key));
    if (keyRank != null) return keyRank;

    if ((item?.tags || []).some((tag) => preferredTags.has(normalizeStudioTemplateSearchValue(tag)))) return 1000;
    if ((item?.categories || []).some((category) => preferredCategories.has(normalizeStudioTemplateSearchValue(category)))) {
      return 2000;
    }
    return 9999;
  };
}

export function filterStudioTemplateItemsByAllowList<T extends StudioTemplateCatalogItem>(
  items: readonly T[],
  allowedKeys?: readonly unknown[] | null,
) {
  const normalizedAllowedKeys = normalizeStudioTemplateKeyList(allowedKeys);
  if (!normalizedAllowedKeys.length) return [...items];

  const allowedKeySet = new Set(normalizedAllowedKeys);
  return items.filter((item) => allowedKeySet.has(normalizeStudioTemplateKey(item?.key)));
}

export function filterStudioRecommendedTemplateItems<T extends StudioTemplateCatalogItem>(
  items: readonly T[],
  recommendedKeys?: readonly unknown[] | null,
) {
  const itemByKey = new Map<string, T>();
  items.forEach((item) => {
    const key = normalizeStudioTemplateKey(item?.key);
    if (key && !itemByKey.has(key)) itemByKey.set(key, item);
  });

  return normalizeStudioTemplateKeyList(recommendedKeys)
    .map((key) => itemByKey.get(key))
    .filter((item): item is T => Boolean(item));
}
