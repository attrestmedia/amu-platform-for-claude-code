import "server-only";
import type { MarketingChannel } from "consts/marketing/queue";
import { upsertMarketingPerformanceDaily, listMarketingPerformanceDaily } from "libs/database/marketing";
import { upsertMarketingGaSnapshots } from "libs/database/marketing/gaSnapshotRepo";
import { resolveGaConnection, type GaPropertyConfig } from "libs/server-utils/marketing/ga/gaClient";
import {
  GA_REPORT_CONFIGS,
  runGaReport,
  type GaReportRow,
} from "libs/server-utils/marketing/ga/gaReports";
import { isGaReportApplicableToPropertyRole } from "libs/server-utils/marketing/ga/gaReportApplicability";
import { classifyGaReportFailure } from "libs/server-utils/marketing/ga/gaReportFailure";
import { canRollupFilteredGaReport } from "./gaCollectPolicy";
import { logger } from "utils/log";

/**
 * @docHint
 * @purpose GA4 일별 스냅샷 수집 배치와 MarketingPerformanceDaily 롤업 오케스트레이션
 * @process 자격증명 연결 해석 → 리포트 5종 수집(dryRun 지원) → 전량 성공 시에만 ga_* 롤업 upsert
 * @domain marketing
 * @scope server
 */

const GA_ROLLUP_TOP_PAGES_PER_DATE = 200;
const GA_REPORT_TIME_ZONE = "Asia/Seoul";

/** GA sessionSource/Medium → 마케팅 채널 매핑. 매핑 불가 소스는 "web"으로 기록하고 meta에 원본 보존 */
function mapSourceMediumToChannel(source: string, medium: string): MarketingChannel {
  const s = source.toLowerCase();
  const m = medium.toLowerCase();
  if (s.includes("naver") && m === "cpc") return "naver_ads";
  if (s.includes("naver")) return "naver_blog";
  if (s.includes("threads")) return "threads";
  if (s.includes("instagram")) return "instagram";
  if (s.includes("linkedin") || s === "lnkd.in") return "linkedin";
  if (s.includes("google") && (m === "cpc" || m === "paid")) return "google_ads";
  if (m === "email") return "email";
  return "web";
}

function toDateString(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: GA_REPORT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value || "1970";
  const month = parts.find((part) => part.type === "month")?.value || "01";
  const day = parts.find((part) => part.type === "day")?.value || "01";
  return `${year}-${month}-${day}`;
}

function defaultCollectRange() {
  // GA 데이터는 최대 48시간 보정되므로 2일 롤링 윈도로 재수집한다.
  const endDate = toDateString(new Date(Date.now() - 24 * 3600 * 1000));
  const startDate = toDateString(new Date(Date.now() - 2 * 24 * 3600 * 1000));
  return { startDate, endDate };
}

function toSafeString(value: unknown) {
  return String(value || "").trim();
}

function normalizeGaPropertyId(value: unknown) {
  const propertyId = toSafeString(value).replace(/^properties\//, "").replace(/[^\d]/g, "");
  return propertyId ? `properties/${propertyId}` : "";
}

type RollupAccumulator = Map<string, { metrics: Record<string, number>; meta: Record<string, unknown> }>;

function accumulate(acc: RollupAccumulator, key: string, metrics: Record<string, number>, meta: Record<string, unknown>) {
  const existing = acc.get(key);
  if (!existing) {
    acc.set(key, { metrics: { ...metrics }, meta });
    return;
  }
  Object.entries(metrics).forEach(([name, value]) => {
    existing.metrics[name] = (existing.metrics[name] || 0) + value;
  });
  existing.meta = { ...existing.meta, ...meta };
}

function normalizeSourceMedium(source: string, medium: string) {
  return `${source || "(direct)"}/${medium || "(none)"}`.replace(/\s*\/\s*/g, "/");
}

function parseSourceMedium(value: string) {
  const normalized = String(value || "(direct)/(none)")
    .trim()
    .replace(/\s*\/\s*/g, "/");
  const [source = "(direct)", medium = "(none)"] = normalized.split("/");
  return { source: source || "(direct)", medium: medium || "(none)", entityId: normalizeSourceMedium(source, medium) };
}

function metricSuffix(value: string) {
  return String(value || "unknown_event").replace(/[^a-zA-Z0-9_:-]/g, "_");
}

function scopedEntityId(property: GaPropertyConfig, entityId: string) {
  return `${property.propertyKey}:${entityId}`;
}

function propertyMeta(property: GaPropertyConfig, extra: Record<string, unknown> = {}) {
  return {
    source: "ga4",
    propertyId: property.propertyId,
    propertyKey: property.propertyKey,
    propertyRole: property.role,
    ...(property.label ? { propertyLabel: property.label } : {}),
    ...extra,
  };
}

async function rollupGaRowsToPerformanceDaily(
  universeId: string,
  property: GaPropertyConfig,
  rowsByReport: Map<string, GaReportRow[]>,
) {
  let rollupCount = 0;

  // 1) ga_channel: acquisition + key_events 소스/매체별 집계 (entityId = source/medium)
  const channelAcc: RollupAccumulator = new Map();
  const channelOf = new Map<string, MarketingChannel>();
  (rowsByReport.get("acquisition") || []).forEach((row) => {
    const source = row.dimensions.sessionSource || "(direct)";
    const medium = row.dimensions.sessionMedium || "(none)";
    const sourceMedium = normalizeSourceMedium(source, medium);
    const entityId = scopedEntityId(property, sourceMedium);
    const key = `${row.date}|${entityId}`;
    channelOf.set(key, mapSourceMediumToChannel(source, medium));
    accumulate(channelAcc, key, row.metrics, propertyMeta(property, {
      rawEntityId: sourceMedium,
      sourceMedium,
      campaign: row.dimensions.sessionCampaignName || "",
    }));
  });
  (rowsByReport.get("key_events") || []).forEach((row) => {
    const { source, medium, entityId: sourceMedium } = parseSourceMedium(row.dimensions.sessionSourceMedium || "");
    const entityId = scopedEntityId(property, sourceMedium);
    const key = `${row.date}|${entityId}`;
    const eventName = row.dimensions.eventName || "unknown_event";
    const suffix = metricSuffix(eventName);
    channelOf.set(key, channelOf.get(key) || mapSourceMediumToChannel(source, medium));
    accumulate(
      channelAcc,
      key,
      {
        totalKeyEvents: row.metrics.keyEvents || 0,
        totalKeyEventCount: row.metrics.eventCount || 0,
        totalRevenue: row.metrics.totalRevenue || 0,
        [`keyEvent:${suffix}`]: row.metrics.keyEvents || 0,
        [`eventCount:${suffix}`]: row.metrics.eventCount || 0,
        [`revenue:${suffix}`]: row.metrics.totalRevenue || 0,
      },
      propertyMeta(property, {
        rawEntityId: sourceMedium,
        sourceMedium,
        campaign: row.dimensions.sessionCampaignName || "",
        includesKeyEvents: true,
      }),
    );
  });
  for (const [key, value] of channelAcc) {
    const [date, entityId] = [key.slice(0, 10), key.slice(11)];
    await upsertMarketingPerformanceDaily({
      universeId,
      channel: channelOf.get(key) || "web",
      date,
      entityType: "ga_channel",
      entityId,
      metrics: value.metrics,
      meta: value.meta,
    });
    rollupCount += 1;
  }

  // 2) ga_template: event_funnel의 template_key별 이벤트 집계 (entityId = template_key)
  const templateAcc: RollupAccumulator = new Map();
  (rowsByReport.get("event_funnel") || []).forEach((row) => {
    const templateKey = String(row.dimensions["customEvent:template_key"] || "").trim();
    if (!templateKey || templateKey === "(not set)") return;
    const eventName = row.dimensions.eventName || "unknown_event";
    const entityId = scopedEntityId(property, templateKey);
    const key = `${row.date}|${entityId}`;
    accumulate(
      templateAcc,
      key,
      { [`event:${eventName}`]: row.metrics.eventCount || 0, activeUsers: row.metrics.activeUsers || 0 },
      propertyMeta(property, { rawEntityId: templateKey, entrySource: row.dimensions["customEvent:entry_source"] || "" }),
    );
  });
  for (const [key, value] of templateAcc) {
    const [date, entityId] = [key.slice(0, 10), key.slice(11)];
    await upsertMarketingPerformanceDaily({
      universeId,
      channel: "web",
      date,
      entityType: "ga_template",
      entityId,
      metrics: value.metrics,
      meta: value.meta,
    });
    rollupCount += 1;
  }

  // 3) ga_page: page_traffic의 페이지별 집계 — 날짜별 세션 상위 페이지만 기록해 행 폭증 방지
  const pageAcc: RollupAccumulator = new Map();
  (rowsByReport.get("page_traffic") || []).forEach((row) => {
    const pagePath = row.dimensions.pagePath || "/";
    accumulate(pageAcc, `${row.date}|${scopedEntityId(property, pagePath)}`, row.metrics, propertyMeta(property, { rawEntityId: pagePath }));
  });
  const pagesByDate = new Map<string, Array<{ entityId: string; metrics: Record<string, number>; meta: Record<string, unknown> }>>();
  for (const [key, value] of pageAcc) {
    const [date, entityId] = [key.slice(0, 10), key.slice(11)];
    const list = pagesByDate.get(date) || [];
    list.push({ entityId, metrics: value.metrics, meta: value.meta });
    pagesByDate.set(date, list);
  }
  for (const [date, pages] of pagesByDate) {
    const topPages = pages
      .sort((a, b) => (b.metrics.sessions || 0) - (a.metrics.sessions || 0))
      .slice(0, GA_ROLLUP_TOP_PAGES_PER_DATE);
    for (const page of topPages) {
      await upsertMarketingPerformanceDaily({
        universeId,
        channel: "web",
        date,
        entityType: "ga_page",
        entityId: page.entityId,
        metrics: page.metrics,
        meta: page.meta,
      });
      rollupCount += 1;
    }
  }

  // 4) ga_promo: 슬롯/소재/캠페인/variant별 impression·click 보조 지표.
  const promoAcc: RollupAccumulator = new Map();
  (rowsByReport.get("promo_performance") || []).forEach((row) => {
    const slotId = toSafeString(row.dimensions["customEvent:slot_id"]);
    const creativeId = toSafeString(row.dimensions["customEvent:creative_id"]);
    const campaignId = toSafeString(row.dimensions["customEvent:campaign_id"]);
    const variant = toSafeString(row.dimensions["customEvent:variant"]);
    const eventName = toSafeString(row.dimensions.eventName);
    if (!slotId || !creativeId || !["promo_impression", "promo_click"].includes(eventName)) return;
    const rawEntityId = [campaignId || "evergreen", slotId, creativeId, variant || "A"].join(":");
    const entityId = scopedEntityId(property, rawEntityId);
    accumulate(
      promoAcc,
      `${row.date}|${entityId}`,
      { [`event:${eventName}`]: row.metrics.eventCount || 0, [`activeUsers:${eventName}`]: row.metrics.activeUsers || 0 },
      propertyMeta(property, { rawEntityId, campaignId, slotId, creativeId, variant }),
    );
  });
  for (const [key, value] of promoAcc) {
    const [date, entityId] = [key.slice(0, 10), key.slice(11)];
    await upsertMarketingPerformanceDaily({
      universeId,
      channel: "web",
      date,
      entityType: "ga_promo",
      entityId,
      metrics: value.metrics,
      meta: value.meta,
    });
    rollupCount += 1;
  }

  // 5) ga_audience: audience_profile의 국가·언어·기기·브라우저별 사용자 분포 (R-118)
  const audienceAcc: RollupAccumulator = new Map();
  (rowsByReport.get("audience_profile") || []).forEach((row) => {
    const country = toSafeString(row.dimensions.country);
    const language = toSafeString(row.dimensions.language);
    const deviceCategory = toSafeString(row.dimensions.deviceCategory);
    const browser = toSafeString(row.dimensions.browser);
    const rawEntityId = [country, language, deviceCategory, browser].filter(Boolean).join(":") || "(not set)";
    const entityId = scopedEntityId(property, rawEntityId);
    accumulate(
      audienceAcc,
      `${row.date}|${entityId}`,
      row.metrics,
      propertyMeta(property, { rawEntityId, country, language, deviceCategory, browser }),
    );
  });
  for (const [key, value] of audienceAcc) {
    const [date, entityId] = [key.slice(0, 10), key.slice(11)];
    await upsertMarketingPerformanceDaily({
      universeId,
      channel: "web",
      date,
      entityType: "ga_audience",
      entityId,
      metrics: value.metrics,
      meta: value.meta,
    });
    rollupCount += 1;
  }

  return rollupCount;
}

export async function collectGaDailySnapshots(args: {
  universeId: string;
  startDate?: string;
  endDate?: string;
  dryRun?: boolean;
  propertyKey?: string;
  propertyId?: string;
  reportKey?: string;
}) {
  const connection = await resolveGaConnection(args.universeId);
  if (!connection) {
    return { ok: false as const, error: "ga_credential_not_configured", results: [] };
  }
  if (!connection.enabled) {
    return { ok: false as const, error: "ga_collect_disabled", results: [] };
  }

  const range = defaultCollectRange();
  const startDate = args.startDate || range.startDate;
  const endDate = args.endDate || range.endDate;
  const dryRun = args.dryRun === true;
  const requestedPropertyKey = toSafeString(args.propertyKey);
  const requestedPropertyId = normalizeGaPropertyId(args.propertyId);
  const requestedReportKey = toSafeString(args.reportKey);
  const properties = connection.properties.filter((property) => {
    if (requestedPropertyKey && property.propertyKey !== requestedPropertyKey) return false;
    if (requestedPropertyId && property.propertyId !== requestedPropertyId) return false;
    return true;
  });
  const reportConfigs = GA_REPORT_CONFIGS.filter((config) => !requestedReportKey || config.reportKey === requestedReportKey);

  if (properties.length === 0) {
    return { ok: false as const, error: "ga_property_not_found", results: [] };
  }
  if (reportConfigs.length === 0) {
    return { ok: false as const, error: "ga_report_not_found", results: [] };
  }

  const results: Array<{
    propertyId: string;
    propertyKey: string;
    propertyRole: string;
    reportKey: string;
    rows: number;
    rowCount?: number;
    truncated?: boolean;
    error?: string;
    skipped?: boolean;
    warning?: string;
    requiredCustomDimensions?: string[];
  }> = [];
  let rollupCount = 0;

  for (const property of properties) {
    const rowsByReport = new Map<string, GaReportRow[]>();
    const propertyReportConfigs = reportConfigs.filter((config) =>
      isGaReportApplicableToPropertyRole(config, property.role),
    );

    if (requestedReportKey && propertyReportConfigs.length === 0) {
      results.push({
        propertyId: property.propertyId,
        propertyKey: property.propertyKey,
        propertyRole: property.role,
        reportKey: requestedReportKey,
        rows: 0,
        skipped: true,
        warning: "ga_report_not_applicable_for_property_role",
      });
      continue;
    }

    const propertyResults = await Promise.all(
      propertyReportConfigs.map(async (config) => {
        try {
          const report = await runGaReport({ ...connection, propertyId: property.propertyId }, config, startDate, endDate);
          const rows = report.rows;
          rowsByReport.set(config.reportKey, rows);
          if (!dryRun) {
            await upsertMarketingGaSnapshots(
              rows.map((row) => ({
                universeId: args.universeId,
                propertyId: property.propertyId,
                reportKey: row.reportKey,
                date: row.date,
                dimensions: row.dimensions,
                metrics: row.metrics,
              })),
            );
          }
          if (report.truncated) {
            logger.warn("[gaCollect] report truncated", {
              universeId: args.universeId,
              propertyId: property.propertyId,
              propertyKey: property.propertyKey,
              reportKey: config.reportKey,
              rows: rows.length,
              rowCount: report.rowCount,
            });
          }
          return {
            propertyId: property.propertyId,
            propertyKey: property.propertyKey,
            propertyRole: property.role,
            reportKey: config.reportKey,
            rows: rows.length,
            rowCount: report.rowCount,
            truncated: report.truncated,
          };
        } catch (error) {
          const failure = classifyGaReportFailure(config, error);
          if ("skipped" in failure) {
            logger.warn("[gaCollect] optional report skipped", {
              universeId: args.universeId,
              propertyId: property.propertyId,
              propertyKey: property.propertyKey,
              reportKey: config.reportKey,
              warning: failure.warning,
              requiredCustomDimensions: failure.requiredCustomDimensions,
            });
            return {
              propertyId: property.propertyId,
              propertyKey: property.propertyKey,
              propertyRole: property.role,
              reportKey: config.reportKey,
              rows: 0,
              ...failure,
            };
          }
          // 핵심 리포트 또는 설정 누락 외 오류는 fail-closed로 유지한다.
          logger.error("[gaCollect] report failed", {
            universeId: args.universeId,
            propertyId: property.propertyId,
            propertyKey: property.propertyKey,
            reportKey: config.reportKey,
            error: failure.error,
          });
          return {
            propertyId: property.propertyId,
            propertyKey: property.propertyKey,
            propertyRole: property.role,
            reportKey: config.reportKey,
            rows: 0,
            error: failure.error,
          };
        }
      }),
    );

    results.push(...propertyResults);

    const propertyFailed = propertyResults.some((result) => "error" in result && Boolean(result.error));
    const filteredRollupSafe = canRollupFilteredGaReport(requestedReportKey);
    if (!dryRun && requestedReportKey && !filteredRollupSafe) {
      logger.info("[gaCollect] rollup skipped for coupled filtered report", {
        universeId: args.universeId,
        propertyId: property.propertyId,
        propertyKey: property.propertyKey,
        reportKey: requestedReportKey,
      });
      continue;
    }

    if (!dryRun && !propertyFailed) {
      rollupCount += await rollupGaRowsToPerformanceDaily(args.universeId, property, rowsByReport);
    }
  }

  const failed = results.filter((r) => r.error);
  return {
    ok: failed.length === 0,
    dryRun,
    startDate,
    endDate,
    dateTimeZone: GA_REPORT_TIME_ZONE,
    properties: connection.properties.map((property) => ({
      propertyId: property.propertyId,
      propertyKey: property.propertyKey,
      role: property.role,
      label: property.label || "",
    })),
    results,
    rollupCount,
    ...(failed.length > 0 ? { error: "ga_collect_partial_failure" as const } : {}),
  };
}

const GA_PERFORMANCE_VIEWS = ["template_funnel", "channel_contribution", "page_traffic", "promo_performance", "audience_profile"] as const;
export type GaPerformanceView = (typeof GA_PERFORMANCE_VIEWS)[number];

export function isGaPerformanceView(value: string): value is GaPerformanceView {
  return (GA_PERFORMANCE_VIEWS as readonly string[]).includes(value);
}

/** 저장된 ga_* 롤업을 조회한다 (GA API 미호출 — 스냅샷 기반, quota 소비 없음). */
export async function getGaPerformance(args: {
  universeId: string;
  view: GaPerformanceView;
  days?: number;
  entityId?: string;
  propertyKey?: string;
  propertyId?: string;
  limit?: number;
  offset?: number;
}) {
  const days = Math.min(Math.max(args.days || 28, 1), 90);
  const limit = Math.min(Math.max(args.limit || 2000, 1), 2000);
  const offset = Math.min(Math.max(args.offset || 0, 0), 50_000);
  const dateFrom = toDateString(new Date(Date.now() - days * 24 * 3600 * 1000));
  const entityType =
    args.view === "template_funnel"
      ? "ga_template"
      : args.view === "channel_contribution"
        ? "ga_channel"
        : args.view === "promo_performance"
          ? "ga_promo"
          : args.view === "audience_profile"
            ? "ga_audience"
            : "ga_page";

  const rows = await listMarketingPerformanceDaily({
    universeId: args.universeId,
    entityType,
    entityId: args.entityId,
    propertyKey: args.propertyKey,
    propertyId: args.propertyId,
    dateFrom,
    limit: limit + 1,
    offset,
  });
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  return {
    view: args.view,
    days,
    dateFrom,
    propertyKey: args.propertyKey || "",
    propertyId: args.propertyId || "",
    pagination: {
      limit,
      offset,
      hasMore,
      nextOffset: hasMore ? offset + limit : null,
    },
    note:
      "GA4 스냅샷 롤업 기반 조회입니다. entityId는 propertyKey로 prefix 처리되며, channel_contribution에는 key event/revenue, promo_performance에는 소재별 impression/click 보조 지표가 포함됩니다. 절대 원장(가입/충전 수)은 AMU DB가 기준입니다.",
    items,
  };
}
