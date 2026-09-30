import "server-only";

import { listMarketingPerformanceDaily, upsertMarketingPerformanceDaily } from "libs/database/marketing";
import { getNaverAdsAuth, naverSearchAdReadApi } from "libs/api/thirdparty/naverads/naverSearchAdClient";
import { getGoogleAdsAuth, googleAdsSearch, GOOGLE_ADS_GAQL } from "libs/api/thirdparty/googleads/googleAdsClient";
import { toSafeString, toUnknownRecord } from "utils/common/typeUtils";

export const ADS_PERFORMANCE_CHANNELS = ["naver_ads", "google_ads"] as const;
type AdsChannel = (typeof ADS_PERFORMANCE_CHANNELS)[number];
const number = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const dateString = (date: Date) => date.toISOString().slice(0, 10);

function metrics(raw: { impressions?: unknown; clicks?: unknown; cost?: unknown; conversions?: unknown; conversionValue?: unknown }) {
  const impressions = number(raw.impressions);
  const clicks = number(raw.clicks);
  const cost = number(raw.cost);
  const conversions = number(raw.conversions);
  const conversionValue = number(raw.conversionValue);
  return {
    impressions,
    clicks,
    cost,
    conversions,
    conversionValue,
    ctr: impressions ? clicks / impressions : 0,
    cpc: clicks ? cost / clicks : 0,
    cpa: conversions ? cost / conversions : 0,
    roas: cost ? conversionValue / cost : 0,
  };
}

export async function collectAdsPerformanceSnapshots(args: {
  universeId: string;
  dateFrom?: string;
  dateTo?: string;
  channels?: string[];
  dryRun?: boolean;
}) {
  const until = args.dateTo || dateString(new Date());
  const since = args.dateFrom || dateString(new Date(Date.now() - 29 * 86_400_000));
  const requested = args.channels?.filter((item): item is AdsChannel => ADS_PERFORMANCE_CHANNELS.includes(item as AdsChannel)) || [...ADS_PERFORMANCE_CHANNELS];
  const results: Array<Record<string, unknown>> = [];
  const errors: Array<{ channel: AdsChannel; error: string }> = [];

  if (requested.includes("google_ads")) {
    try {
      const auth = await getGoogleAdsAuth(args.universeId);
      if (!auth) throw new Error("google_ads_credentials_incomplete");
      const response = await googleAdsSearch<Record<string, unknown>>(auth, GOOGLE_ADS_GAQL.campaignDaily(since, until));
      const chunks = Array.isArray(response) ? response : [response];
      const rows = chunks.flatMap((chunk) => (Array.isArray(toUnknownRecord(chunk).results) ? toUnknownRecord(chunk).results as unknown[] : []));
      for (const value of rows) {
        const row = toUnknownRecord(value);
        const campaign = toUnknownRecord(row.campaign);
        const segment = toUnknownRecord(row.segments);
        const rawMetrics = toUnknownRecord(row.metrics);
        const campaignId = toSafeString(campaign.id);
        const date = toSafeString(segment.date);
        const normalized = metrics({
          impressions: rawMetrics.impressions,
          clicks: rawMetrics.clicks,
          cost: number(rawMetrics.costMicros) / 1_000_000,
          conversions: rawMetrics.conversions,
          conversionValue: rawMetrics.conversionsValue,
        });
        if (!campaignId || !date) continue;
        if (!args.dryRun) await upsertMarketingPerformanceDaily({
          universeId: args.universeId,
          entityType: "ad_campaign",
          entityId: `google_ads:${campaignId}`,
          channel: "google_ads",
          date,
          metrics: normalized,
          meta: { campaignName: toSafeString(campaign.name), campaignStatus: toSafeString(campaign.status), raw: row },
        });
        results.push({ channel: "google_ads", campaignId, date, metrics: normalized });
      }
    } catch (error) {
      errors.push({ channel: "google_ads", error: error instanceof Error ? error.message : "google_ads_collect_failed" });
    }
  }

  if (requested.includes("naver_ads")) {
    try {
      const auth = await getNaverAdsAuth(args.universeId);
      if (!auth) throw new Error("naver_ads_credentials_incomplete");
      const campaigns = await naverSearchAdReadApi.listCampaigns(auth);
      const ids = campaigns.map((item) => toSafeString(item.nccCampaignId)).filter(Boolean);
      const response = ids.length ? await naverSearchAdReadApi.getStats(auth, ids, since, until) : {};
      const rows = Array.isArray(toUnknownRecord(response).data) ? toUnknownRecord(response).data as unknown[] : [];
      for (const value of rows) {
        const row = toUnknownRecord(value);
        const campaignId = toSafeString(row.id);
        const date = toSafeString(row.dateStart || row.date);
        const normalized = metrics({ impressions: row.impCnt, clicks: row.clkCnt, cost: row.salesAmt, conversions: row.ccnt, conversionValue: row.convAmt });
        if (!campaignId || !date) continue;
        if (!args.dryRun) await upsertMarketingPerformanceDaily({
          universeId: args.universeId,
          entityType: "ad_campaign",
          entityId: `naver_ads:${campaignId}`,
          channel: "naver_ads",
          date,
          metrics: normalized,
          meta: { raw: row },
        });
        results.push({ channel: "naver_ads", campaignId, date, metrics: normalized });
      }
    } catch (error) {
      errors.push({ channel: "naver_ads", error: error instanceof Error ? error.message : "naver_ads_collect_failed" });
    }
  }
  return { ok: errors.length === 0, universeId: args.universeId, since, until, collected: results.length, results, errors, dryRun: !!args.dryRun };
}

export async function getAdsPerformance(args: { universeId: string; channels?: string[]; days?: number }) {
  const days = Math.max(1, Math.min(180, Math.floor(args.days || 30)));
  const items = await listMarketingPerformanceDaily({
    universeId: args.universeId,
    entityType: "ad_campaign",
    channel: args.channels?.length === 1 ? args.channels[0] as AdsChannel : undefined,
    dateFrom: dateString(new Date(Date.now() - (days - 1) * 86_400_000)),
    dateTo: dateString(new Date()),
    limit: 5000,
  });
  const summary = items.reduce((acc, item) => {
    const row = toUnknownRecord(item.metrics);
    acc.impressions += number(row.impressions);
    acc.clicks += number(row.clicks);
    acc.cost += number(row.cost);
    acc.conversions += number(row.conversions);
    acc.conversionValue += number(row.conversionValue);
    return acc;
  }, { impressions: 0, clicks: 0, cost: 0, conversions: 0, conversionValue: 0 });
  return { universeId: args.universeId, days, summary: { ...summary, roas: summary.cost ? summary.conversionValue / summary.cost : 0 }, items };
}
