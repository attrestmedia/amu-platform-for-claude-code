import "server-only";

import { getMarketingKeywordSettings, listMarketingPerformanceDaily } from "libs/database/marketing";
import type { MarketingGrowthAnalysis, MarketingGrowthPerformanceRow, GrowthAnalysisSourceKey, GrowthAnalysisSourceStatus } from "./marketingGrowthAnalysisContract";
import { buildMarketingGrowthAnalysis } from "./marketingGrowthAnalysisContract";

/**
 * S6 read-only orchestration. It only reads the stored marketing criteria and
 * daily snapshots; provider collection is intentionally outside this endpoint.
 */

const CUMULATIVE_SNAPSHOT_ENTITY_TYPES = new Set(["social_post", "social_account"]);

function toText(value: unknown) {
  return String(value ?? "").trim();
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function dateStringInSeoul(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value || "1970";
  const month = parts.find((part) => part.type === "month")?.value || "01";
  const day = parts.find((part) => part.type === "day")?.value || "01";
  return `${year}-${month}-${day}`;
}

function dateDaysBefore(dateText: string, days: number) {
  const date = new Date(`${dateText}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - Math.max(0, days));
  return date.toISOString().slice(0, 10);
}

function sourceKeyForRow(row: MarketingGrowthPerformanceRow): GrowthAnalysisSourceKey {
  const entityType = toText(row.entityType);
  const channel = toText(row.channel);
  if (entityType.startsWith("ad_") || channel.endsWith("_ads")) return "ads";
  if (entityType.startsWith("ga_") || channel === "web" || channel === "email") return "web";
  if (entityType === "social_post" || entityType === "social_account") return "social";
  return "web";
}

function rowFromStoredValue(value: unknown): MarketingGrowthPerformanceRow {
  const row = toRecord(value);
  return {
    channel: toText(row.channel),
    date: toText(row.date),
    entityType: toText(row.entityType),
    entityId: toText(row.entityId),
    metrics: toRecord(row.metrics),
    meta: toRecord(row.meta),
  };
}

function matchesAttributionFilter(row: MarketingGrowthPerformanceRow, filter: Record<string, string>) {
  const meta = toRecord(row.meta);
  return Object.entries(filter).every(([key, value]) => toText(meta[key]) === value);
}

function collapseCumulativeSnapshots(rows: readonly MarketingGrowthPerformanceRow[]) {
  const latest = new Map<string, MarketingGrowthPerformanceRow>();
  const dailyRows: MarketingGrowthPerformanceRow[] = [];
  rows.forEach((row) => {
    if (!CUMULATIVE_SNAPSHOT_ENTITY_TYPES.has(toText(row.entityType))) {
      dailyRows.push(row);
      return;
    }
    const key = [row.entityType, row.channel, row.entityId].join(":");
    const previous = latest.get(key);
    if (!previous || toText(previous.date) < toText(row.date)) latest.set(key, row);
  });
  return [...dailyRows, ...latest.values()];
}

function sourceStatuses(rows: readonly MarketingGrowthPerformanceRow[]) {
  const counts: Record<GrowthAnalysisSourceKey, number> = { social: 0, web: 0, ads: 0, commerce: 0 };
  rows.forEach((row) => {
    counts[sourceKeyForRow(row)] += 1;
  });
  const status = (key: GrowthAnalysisSourceKey): GrowthAnalysisSourceStatus =>
    key === "commerce" ? "blocked_external" : counts[key] > 0 ? "observed" : "not_collected";
  return {
    social: status("social"),
    web: status("web"),
    ads: status("ads"),
    commerce: status("commerce"),
  } satisfies Partial<Record<GrowthAnalysisSourceKey, GrowthAnalysisSourceStatus>>;
}

export async function getMarketingGrowthAnalysis(args: {
  universeId: string;
  days?: number;
  campaignId?: string;
  sourceFingerprint?: string;
  draftId?: string;
}): Promise<MarketingGrowthAnalysis> {
  const days = Math.max(1, Math.min(180, Math.floor(Number(args.days || 28))));
  const dateTo = dateStringInSeoul();
  const dateFrom = dateDaysBefore(dateTo, days - 1);
  const [settings, storedRows] = await Promise.all([
    getMarketingKeywordSettings(args.universeId),
    listMarketingPerformanceDaily({
      universeId: args.universeId,
      dateFrom,
      dateTo,
      limit: 5000,
    }),
  ]);

  const allRows = storedRows.map(rowFromStoredValue);
  const attributionFilter = Object.fromEntries(
    Object.entries({
      campaignId: toText(args.campaignId),
      sourceFingerprint: toText(args.sourceFingerprint),
      draftId: toText(args.draftId),
    }).filter(([, value]) => value),
  );
  const filteredRows = Object.keys(attributionFilter).length > 0
    ? allRows.filter((row) => matchesAttributionFilter(row, attributionFilter))
    : allRows;
  const rows = collapseCumulativeSnapshots(filteredRows);
  const criteria = toRecord(toRecord(settings).marketingCriteria);

  return buildMarketingGrowthAnalysis({
    days,
    dateFrom,
    dateTo,
    strategy: criteria,
    rows,
    sourceStatuses: sourceStatuses(allRows),
    attributionFilter,
  });
}
