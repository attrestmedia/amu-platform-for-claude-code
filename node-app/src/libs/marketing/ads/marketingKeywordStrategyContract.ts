/**
 * S7 상품별 광고 키워드 전략 계약.
 *
 * 이 모듈은 provider API와 DB를 호출하지 않는다. 상품 lineage와 전략 입력을
 * Naver·Google별 키워드 초안으로 변환하고, 저장된 실측 snapshot이 있을 때만
 * CTR/CPC/CVR/CPA/ROAS를 계산한다. 없는 값을 0이나 예측치로 채우지 않는다.
 */

export const MARKETING_KEYWORD_STRATEGY_SCHEMA_VERSION = "s7.v1";
export const MARKETING_KEYWORD_REVIEW_WINDOWS = [7, 28] as const;

export type MarketingAdsKeywordProvider = "naver_ads" | "google_ads";
export type MarketingAdsKeywordProviderSelection = MarketingAdsKeywordProvider | "both";
export type MarketingKeywordEvidenceStatus = "operator_seed" | "observed" | "not_collected" | "incomplete";

export type MarketingKeywordStrategyProductInput = {
  productId?: unknown;
  channelProductNo?: unknown;
  productRevision?: unknown;
  productName?: unknown;
  sourceFingerprint?: unknown;
  campaignId?: unknown;
  landingUrl?: unknown;
  creativeIds?: unknown;
  allowedClaims?: unknown;
};

export type MarketingKeywordStrategyInput = {
  asOf?: unknown;
  product?: MarketingKeywordStrategyProductInput | null;
  strategy?: Record<string, unknown> | null;
  providers?: unknown;
  seedKeywords?: unknown;
  negativeKeywords?: unknown;
  keywordRows?: readonly MarketingKeywordPerformanceRow[];
};

export type MarketingKeywordPerformanceRow = {
  provider?: unknown;
  keyword?: unknown;
  date?: unknown;
  metrics?: Record<string, unknown> | null;
  meta?: Record<string, unknown> | null;
};

type KeywordIntent = "brand" | "commercial" | "informational" | "problem_solution";
type KeywordPlanStatus = "setup_required" | "awaiting_data" | "draft_ready" | "review_ready";

type KeywordMetricSummary = {
  impressions?: number;
  clicks?: number;
  cost?: number;
  conversions?: number;
  conversionValue?: number;
  searchVolume?: number;
  competition?: number | string;
  estimatedBid?: number;
  ctr?: number;
  cpc?: number;
  cvr?: number;
  cpa?: number;
  roas?: number;
  metricBasis: string[];
};

type KeywordCandidate = {
  keyword: string;
  intent: KeywordIntent;
  matchType: "BROAD" | "PHRASE" | "EXACT";
  priority: "high" | "medium" | "low";
  longTail: true;
  evidenceStatus: MarketingKeywordEvidenceStatus;
  metricBasis: string;
  source: "operator_seed" | "derived_long_tail";
  observedMetrics?: KeywordMetricSummary;
};

type ProviderPlan = {
  provider: MarketingAdsKeywordProvider;
  role: string;
  status: "draft_ready" | "awaiting_data" | "review_ready";
  evidenceStatus: MarketingKeywordEvidenceStatus;
  candidates: KeywordCandidate[];
  negativeKeywords: string[];
  observedKeywords: number;
  metricBasis: string[];
  note: string;
};

export type MarketingKeywordStrategyAnalysis = {
  schemaVersion: typeof MARKETING_KEYWORD_STRATEGY_SCHEMA_VERSION;
  generatedAt: string;
  status: KeywordPlanStatus;
  strategy: {
    objective: string;
    targetAudience: string;
    offer: string;
    landingPage: string;
    requiredClaims: string[];
    prohibitedClaims: string[];
    requiredDisclosures: string[];
    measurementPlan: string;
    version: number;
    status: "ready" | "setup_required";
    missing: string[];
  };
  lineage: {
    productId: string;
    channelProductNo: string;
    productRevision: string;
    productName: string;
    sourceFingerprint: string;
    campaignId: string;
    landingUrl: string;
    creativeIds: string[];
    allowedClaims: string[];
    status: "ready" | "setup_required";
    missing: string[];
  };
  providers: Record<MarketingAdsKeywordProvider, ProviderPlan>;
  measurement: {
    reviewWindowsDays: readonly [7, 28];
    status: "not_collected" | "observed";
    rows: number;
    metricBasis: string[];
    conversionValueNote: string;
  };
  improvement: {
    executionMode: "draft_only";
    noForecast: true;
    doNotChange: string[];
    primaryNextAction: string;
    actions: Array<{
      provider: MarketingAdsKeywordProvider | "both";
      type: "collect_snapshot" | "keep" | "test" | "negative_candidate" | "landing_review";
      status: "draft_only";
      reason: string;
      metricBasis: string[];
      reviewWindowDays: readonly [7, 28];
    }>;
  };
};

function toText(value: unknown) {
  return String(value ?? "").trim();
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function toList(value: unknown, limit = 30) {
  return Array.from(new Set((Array.isArray(value) ? value : []).map(toText).filter(Boolean))).slice(0, limit);
}

function toLineList(value: unknown, limit = 30) {
  if (Array.isArray(value)) return toList(value, limit);
  return Array.from(new Set(toText(value).split(/[\n,]/).map((item) => item.trim()).filter(Boolean))).slice(0, limit);
}

function normalizeProviders(value: unknown): MarketingAdsKeywordProvider[] {
  const source = toText(value);
  const list = Array.isArray(value) ? value.map(toText) : source === "both" ? ["naver_ads", "google_ads"] : [source];
  const providers = Array.from(new Set(list.filter((item): item is MarketingAdsKeywordProvider => item === "naver_ads" || item === "google_ads")));
  return providers.length ? providers : ["naver_ads", "google_ads"];
}

function normalizeStrategy(input: Record<string, unknown> | null | undefined) {
  const source = toRecord(input);
  const strategy = {
    objective: toText(source.objective) || "traffic",
    targetAudience: toText(source.targetAudience),
    offer: toText(source.offer),
    landingPage: toText(source.landingPage),
    requiredClaims: toLineList(source.requiredClaims),
    prohibitedClaims: toLineList(source.prohibitedClaims),
    requiredDisclosures: toLineList(source.requiredDisclosures),
    measurementPlan: toText(source.measurementPlan),
    version: Math.max(0, Math.floor(Number(source.version) || 0)),
  };
  const missing = ["targetAudience", "offer"].filter((field) => !strategy[field as "targetAudience" | "offer"]);
  return { ...strategy, status: missing.length ? ("setup_required" as const) : ("ready" as const), missing };
}

function normalizeProduct(input: MarketingKeywordStrategyProductInput | null | undefined) {
  const source = toRecord(input);
  const product = {
    productId: toText(source.productId),
    channelProductNo: toText(source.channelProductNo),
    productRevision: toText(source.productRevision),
    productName: toText(source.productName),
    sourceFingerprint: toText(source.sourceFingerprint),
    campaignId: toText(source.campaignId),
    landingUrl: toText(source.landingUrl),
    creativeIds: toList(source.creativeIds, 20),
    allowedClaims: toLineList(source.allowedClaims, 30),
  };
  const missing = ["productId", "channelProductNo", "productRevision", "sourceFingerprint", "campaignId", "landingUrl"].filter(
    (field) => !product[field as keyof typeof product],
  );
  return { ...product, status: missing.length ? ("setup_required" as const) : ("ready" as const), missing };
}

function keywordParts(keyword: string) {
  return keyword.split(/\s+/).map((part) => part.trim()).filter(Boolean).length;
}

function isLongTail(keyword: string) {
  return keywordParts(keyword) >= 2 || keyword.length >= 8;
}

function uniqueKeywords(value: unknown, productName: string) {
  const seeds = toLineList(value, 20);
  if (seeds.length) return seeds;
  return productName ? [productName] : [];
}

function deriveLongTail(seed: string, intent: KeywordIntent) {
  if (isLongTail(seed)) return [{ keyword: seed, source: "operator_seed" as const }];
  const suffixes: Record<KeywordIntent, string[]> = {
    brand: ["공식", "사용법"],
    commercial: ["가격 비교", "구매 방법"],
    informational: ["사용법", "초보 가이드"],
    problem_solution: ["문제 해결", "선택 기준"],
  };
  return suffixes[intent].map((suffix) => ({ keyword: `${seed} ${suffix}`, source: "derived_long_tail" as const }));
}

function intentsForSeeds(seeds: string[]) {
  return seeds.map((seed, index) => ({
    seed,
    intent: index % 4 === 0
      ? ("commercial" as const)
      : index % 4 === 1
        ? ("informational" as const)
        : index % 4 === 2
          ? ("problem_solution" as const)
          : ("brand" as const),
  }));
}

function matchTypeForIntent(intent: KeywordIntent) {
  if (intent === "brand" || intent === "commercial") return "EXACT" as const;
  if (intent === "informational") return "PHRASE" as const;
  return "BROAD" as const;
}

function priorityForIntent(intent: KeywordIntent) {
  return intent === "commercial" ? "high" as const : intent === "problem_solution" ? "medium" as const : "low" as const;
}

function metricNumber(metrics: Record<string, unknown>, key: string) {
  return toFiniteNumber(metrics[key]);
}

function sumOptional(target: Record<string, number>, key: string, value: number | null) {
  if (value === null) return;
  target[key] = (target[key] || 0) + value;
}

function aggregateRows(rows: readonly MarketingKeywordPerformanceRow[]) {
  const byProvider = new Map<MarketingAdsKeywordProvider, Map<string, { metrics: Record<string, number>; basis: Set<string> }>>();
  rows.forEach((row) => {
    const provider = toText(row.provider) as MarketingAdsKeywordProvider;
    const keyword = toText(row.keyword) || toText(toRecord(row.meta).keyword);
    if (!(provider === "naver_ads" || provider === "google_ads") || !keyword) return;
    const metrics = toRecord(row.metrics);
    const providerRows = byProvider.get(provider) || new Map();
    const current = providerRows.get(keyword) || { metrics: {}, basis: new Set<string>() };
    ["impressions", "clicks", "cost", "conversions", "conversionValue"].forEach((key) => {
      sumOptional(current.metrics, key, metricNumber(metrics, key));
    });
    ["searchVolume", "estimatedBid"].forEach((key) => {
      const value = metricNumber(metrics, key);
      if (value !== null) current.metrics[key] = value;
    });
    const competition = toFiniteNumber(metrics.competition);
    if (competition !== null) current.metrics.competition = competition;
    else if (["LOW", "MEDIUM", "HIGH"].includes(toText(metrics.competition).toUpperCase())) current.metrics.competition = toText(metrics.competition).toUpperCase();
    const basis = toText(metrics.metricBasis) || toText(toRecord(row.meta).metricBasis);
    if (basis) current.basis.add(basis);
    providerRows.set(keyword, current);
    byProvider.set(provider, providerRows);
  });
  return byProvider;
}

function derivedMetrics(values: Record<string, number>, basis: Set<string>): KeywordMetricSummary {
  const summary: KeywordMetricSummary = { metricBasis: Array.from(basis) };
  ["impressions", "clicks", "cost", "conversions", "conversionValue", "searchVolume", "estimatedBid"].forEach((key) => {
    if (typeof values[key] === "number") summary[key as keyof KeywordMetricSummary] = values[key] as never;
  });
  if (typeof values.competition === "number") summary.competition = values.competition;
  if (typeof values.competition === "string") summary.competition = values.competition;
  if (typeof values.impressions === "number" && values.impressions > 0 && typeof values.clicks === "number") summary.ctr = values.clicks / values.impressions;
  if (typeof values.clicks === "number" && values.clicks > 0 && typeof values.cost === "number") summary.cpc = values.cost / values.clicks;
  if (typeof values.clicks === "number" && values.clicks > 0 && typeof values.conversions === "number") summary.cvr = values.conversions / values.clicks;
  if (typeof values.conversions === "number" && values.conversions > 0 && typeof values.cost === "number") summary.cpa = values.cost / values.conversions;
  if (typeof values.cost === "number" && values.cost > 0 && typeof values.conversionValue === "number") summary.roas = values.conversionValue / values.cost;
  return summary;
}

function buildProviderPlan(
  provider: MarketingAdsKeywordProvider,
  seeds: string[],
  negativeKeywords: string[],
  rows: readonly MarketingKeywordPerformanceRow[],
): ProviderPlan {
  const observed = aggregateRows(rows).get(provider) || new Map();
  const intentSeeds = intentsForSeeds(seeds);
  const candidates: KeywordCandidate[] = [];
  intentSeeds.forEach(({ seed, intent }) => {
    deriveLongTail(seed, intent).forEach(({ keyword, source }) => {
      const stored = observed.get(keyword);
      const observedMetrics = stored ? derivedMetrics(stored.metrics, stored.basis) : undefined;
      candidates.push({
        keyword,
        intent,
        matchType: matchTypeForIntent(intent),
        priority: priorityForIntent(intent),
        longTail: true,
        evidenceStatus: stored ? "observed" : "not_collected",
        metricBasis: stored ? (Array.from(stored.basis).join(",") || "stored_provider_snapshot") : "not_collected",
        source,
        ...(observedMetrics ? { observedMetrics } : {}),
      });
    });
  });
  const metricBasis = Array.from(new Set(candidates.flatMap((candidate) => candidate.observedMetrics?.metricBasis || [])));
  const observedKeywords = candidates.filter((candidate) => candidate.evidenceStatus === "observed").length;
  return {
    provider,
    role: provider === "naver_ads" ? "한국어 검색 수요·상업 의도 검증" : "검색 의도·전환 경로 검증",
    status: observedKeywords ? "review_ready" : rows.length ? "awaiting_data" : "draft_ready",
    evidenceStatus: observedKeywords ? "observed" : rows.length ? "incomplete" : "not_collected",
    candidates,
    negativeKeywords,
    observedKeywords,
    metricBasis,
    note: observedKeywords
      ? "저장된 provider snapshot만 사용했습니다. 입찰·확장은 사람 승인 전까지 draft-only입니다."
      : "검색량·경쟁·입찰가는 아직 provider 실측을 수집하지 않았습니다.",
  };
}

function buildImprovement(
  providers: MarketingAdsKeywordProvider[],
  rows: readonly MarketingKeywordPerformanceRow[],
  strategyReady: boolean,
  lineageReady: boolean,
  seedsReady: boolean,
  providerPlans: Record<MarketingAdsKeywordProvider, ProviderPlan>,
) {
  const actions: MarketingKeywordStrategyAnalysis["improvement"]["actions"] = [];
  let primaryNextAction = "상품별 전략과 lineage를 먼저 입력하세요.";
  if (!strategyReady || !lineageReady) {
    primaryNextAction = "상품 광고 목표·타깃·offer와 product/campaign lineage를 확정하세요.";
  } else if (!seedsReady) {
    primaryNextAction = "상품 source snapshot과 금지어 검토 후 seed keyword를 입력하세요.";
  } else if (!rows.length) {
    primaryNextAction = "UTM과 provider 식별자를 확인하고 7일 키워드 snapshot을 수집하세요.";
    actions.push({
      provider: "both",
      type: "collect_snapshot",
      status: "draft_only",
      reason: "현재 검색량·경쟁·입찰·성과 실측 행이 없습니다.",
      metricBasis: ["not_collected"],
      reviewWindowDays: MARKETING_KEYWORD_REVIEW_WINDOWS,
    });
  } else {
    primaryNextAction = "7일 운영 확인 후 28일 패턴을 비교해 provider별 유지·실험·제외 draft를 검토하세요.";
    providers.forEach((provider) => {
      const plan = providerPlans[provider];
      actions.push({
        provider,
        type: plan.observedKeywords ? "test" : "collect_snapshot",
        status: "draft_only",
        reason: plan.observedKeywords
          ? "실측 키워드가 있으므로 CTR·CPC·CVR·CPA를 확인한 뒤 한 번에 하나의 변경만 실험합니다."
          : "provider 행은 있으나 후보 키워드와 매칭되는 실측이 없습니다.",
        metricBasis: plan.metricBasis.length ? plan.metricBasis : ["stored_provider_snapshot"],
        reviewWindowDays: MARKETING_KEYWORD_REVIEW_WINDOWS,
      });
    });
  }
  return {
    executionMode: "draft_only" as const,
    noForecast: true as const,
    doNotChange: [
      "사람 승인 전 예산·입찰가·키워드 확장·제외어를 자동 변경하지 않음",
      "검색량·경쟁·전환·매출을 비어 있는 값에서 추정하지 않음",
      "provider conversionValue를 Store 주문·매출로 간주하지 않음",
    ],
    primaryNextAction,
    actions,
  };
}

export function buildMarketingKeywordStrategy(input: MarketingKeywordStrategyInput = {}): MarketingKeywordStrategyAnalysis {
  const product = normalizeProduct(input.product);
  const strategy = normalizeStrategy(input.strategy);
  const seeds = uniqueKeywords(input.seedKeywords, product.productName);
  const negativeKeywords = toLineList(input.negativeKeywords, 30);
  const providers = normalizeProviders(input.providers);
  const rows = Array.isArray(input.keywordRows) ? input.keywordRows : [];
  const providerPlans: Record<MarketingAdsKeywordProvider, ProviderPlan> = {
    naver_ads: buildProviderPlan("naver_ads", seeds, negativeKeywords, rows.filter((row) => toText(row.provider) === "naver_ads"),
    ),
    google_ads: buildProviderPlan("google_ads", seeds, negativeKeywords, rows.filter((row) => toText(row.provider) === "google_ads"),
    ),
  };
  const selectedPlans = providers.reduce<Record<MarketingAdsKeywordProvider, ProviderPlan>>((acc, provider) => {
    acc[provider] = providerPlans[provider];
    return acc;
  }, {} as Record<MarketingAdsKeywordProvider, ProviderPlan>);
  const strategyReady = strategy.status === "ready";
  const lineageReady = product.status === "ready";
  const seedsReady = seeds.length > 0;
  const status: KeywordPlanStatus = !strategyReady || !lineageReady || !seedsReady
    ? "setup_required"
    : rows.length
      ? "review_ready"
      : "draft_ready";
  const metricBasis = Array.from(new Set(Object.values(selectedPlans).flatMap((plan) => plan.metricBasis)));
  return {
    schemaVersion: MARKETING_KEYWORD_STRATEGY_SCHEMA_VERSION,
    generatedAt: toText(input.asOf) || new Date().toISOString(),
    status,
    strategy,
    lineage: product,
    providers: {
      naver_ads: selectedPlans.naver_ads || { ...providerPlans.naver_ads, candidates: [], negativeKeywords },
      google_ads: selectedPlans.google_ads || { ...providerPlans.google_ads, candidates: [], negativeKeywords },
    },
    measurement: {
      reviewWindowsDays: MARKETING_KEYWORD_REVIEW_WINDOWS,
      status: rows.length ? "observed" : "not_collected",
      rows: rows.length,
      metricBasis: metricBasis.length ? metricBasis : ["not_collected"],
      conversionValueNote: "provider conversionValue/ROAS는 광고 계정 값이며 Store 주문·매출과 동일하다고 판정하지 않습니다. SSM-603 외부 게이트가 필요합니다.",
    },
    improvement: buildImprovement(providers, rows, strategyReady, lineageReady, seedsReady, providerPlans),
  };
}
