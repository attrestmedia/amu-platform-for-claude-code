import "server-only";

import {
  getMarketingKeywordPlan,
  listMarketingPerformanceDaily,
} from "libs/database/marketing";
import {
  buildMarketingKeywordStrategy,
  type MarketingKeywordPerformanceRow,
  type MarketingKeywordStrategyAnalysis,
} from "./marketingKeywordStrategyContract";

function toText(value: unknown) {
  return String(value ?? "").trim();
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function rowFromStoredValue(value: unknown): MarketingKeywordPerformanceRow {
  const row = toRecord(value);
  const meta = toRecord(row.meta);
  return {
    provider: toText(row.channel),
    keyword: toText(meta.keyword),
    date: toText(row.date),
    metrics: toRecord(row.metrics),
    meta,
  };
}

export async function getMarketingKeywordPlanAnalysis(args: {
  universeId: string;
  planId: string;
}): Promise<MarketingKeywordStrategyAnalysis | null> {
  const plan = await getMarketingKeywordPlan(args.universeId, args.planId);
  if (!plan) return null;

  const source = toRecord(plan.source);
  const dateTo = new Date().toISOString().slice(0, 10);
  const dateFrom = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const storedRows = await listMarketingPerformanceDaily({
    universeId: args.universeId,
    channel: ["naver_ads", "google_ads"],
    entityType: ["ad_keyword", "ad_campaign", "ad_group", "ad_creative"],
    dateFrom,
    dateTo,
    limit: 5000,
  });
  const rows = storedRows
    .filter((row) => {
      const meta = toRecord(row.meta);
      return toText(meta.keywordPlanId) === args.planId || toText(meta.campaignId) === toText(plan.campaignId);
    })
    .map(rowFromStoredValue);

  return buildMarketingKeywordStrategy({
    asOf: new Date().toISOString(),
    product: toRecord(source.product),
    strategy: toRecord(source.strategy),
    providers: source.providers,
    seedKeywords: source.seedKeywords,
    negativeKeywords: source.negativeKeywords,
    keywordRows: rows,
  });
}
