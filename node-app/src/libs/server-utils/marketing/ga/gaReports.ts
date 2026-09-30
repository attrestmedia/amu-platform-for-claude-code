import "server-only";
import type { protos } from "@google-analytics/data";
import type { MarketingGaReportKey } from "models/marketing";
import { getGaDataClient, type GaConnection } from "./gaClient";

/**
 * @docHint
 * @purpose GA4 Data API 리포트 정의(5종 고정)와 runReport 실행/평탄화
 * @process 리포트 상수 정의 → runReport 호출 → 차원/지표 헤더 역매핑으로 행 평탄화
 * @domain marketing
 * @scope server
 */

export type GaReportConfig = {
  reportKey: MarketingGaReportKey;
  dimensions: string[];
  metrics: string[];
  propertyRoles?: string[];
  orderBys?: Array<{ metric?: string; dimension?: string; desc?: boolean }>;
  limit?: number;
  eventNames?: string[];
  optional?: boolean;
  requiredCustomDimensions?: string[];
};

/**
 * 기본 리포트 5종과 선택적 프로모션 리포트로 quota 소비를 예측 가능하게 유지한다.
 * customEvent:* 차원은 GA4 관리 화면에 이벤트 범위 custom dimension으로
 * 등록된 이후의 데이터부터 조회 가능하다.
 */
export const GA_REPORT_CONFIGS: GaReportConfig[] = [
  {
    reportKey: "page_traffic",
    // 페이지 순위는 source/medium 분해가 필요 없고, 차원을 추가하면 같은 페이지가
    // 여러 행으로 갈라져 averageSessionDuration·activeUsers 집계가 왜곡된다.
    dimensions: ["date", "pagePath"],
    metrics: ["activeUsers", "sessions", "screenPageViews", "averageSessionDuration"],
    orderBys: [{ metric: "sessions", desc: true }],
    limit: 5000,
  },
  {
    reportKey: "event_funnel",
    dimensions: ["date", "eventName", "customEvent:template_key", "customEvent:entry_source"],
    metrics: ["eventCount", "activeUsers"],
    limit: 5000,
  },
  {
    reportKey: "acquisition",
    dimensions: ["date", "sessionSource", "sessionMedium", "sessionCampaignName"],
    metrics: ["activeUsers", "sessions", "keyEvents"],
    limit: 2000,
  },
  {
    reportKey: "key_events",
    dimensions: ["date", "eventName", "sessionSourceMedium", "sessionCampaignName"],
    metrics: ["keyEvents", "eventCount", "totalRevenue"],
    limit: 2000,
  },
  {
    reportKey: "audience_profile",
    dimensions: ["date", "country", "language", "deviceCategory", "browser"],
    metrics: ["activeUsers", "sessions", "screenPageViews"],
    limit: 3000,
  },
  ...(process.env.MARKETING_GA_PROMO_REPORT_ENABLED === "true"
    ? [
        {
          reportKey: "promo_performance" as const,
          // 매거진 프로모션 슬롯은 acquisition 속성에서만 수집한다.
          propertyRoles: ["acquisition"],
          dimensions: [
            "date",
            "eventName",
            "customEvent:slot_id",
            "customEvent:creative_id",
            "customEvent:campaign_id",
            "customEvent:variant",
          ],
          metrics: ["eventCount", "activeUsers"],
          eventNames: ["promo_impression", "promo_click"],
          optional: true,
          requiredCustomDimensions: ["slot_id", "creative_id", "campaign_id", "variant"],
          limit: 5000,
        },
      ]
    : []),
];

export type GaReportRow = {
  reportKey: MarketingGaReportKey;
  date: string;
  dimensions: Record<string, string>;
  metrics: Record<string, number>;
};

export type GaReportResult = {
  rows: GaReportRow[];
  rowCount: number;
  truncated: boolean;
};

function buildOrderBys(config: GaReportConfig): protos.google.analytics.data.v1beta.IOrderBy[] {
  return (config.orderBys || []).reduce<protos.google.analytics.data.v1beta.IOrderBy[]>((items, order) => {
    if (order.metric) {
      items.push({ metric: { metricName: order.metric }, desc: order.desc === true });
    } else if (order.dimension) {
      items.push({ dimension: { dimensionName: order.dimension }, desc: order.desc === true });
    }
    return items;
  }, []);
}

export async function runGaReport(
  connection: GaConnection,
  config: GaReportConfig,
  startDate: string,
  endDate: string,
): Promise<GaReportResult> {
  const client = getGaDataClient(connection);
  const limit = config.limit ?? 5000;
  const request: protos.google.analytics.data.v1beta.IRunReportRequest = {
    property: connection.propertyId,
    dateRanges: [{ startDate, endDate }],
    dimensions: config.dimensions.map((name) => ({ name })),
    metrics: config.metrics.map((name) => ({ name })),
    orderBys: buildOrderBys(config),
    ...(config.eventNames?.length
      ? {
          dimensionFilter: {
            filter: {
              fieldName: "eventName",
              inListFilter: { values: config.eventNames, caseSensitive: true },
            },
          },
        }
      : {}),
    limit,
  };
  const [response] = await client.runReport(request);

  const dimHeaders = (response.dimensionHeaders || []).map((h) => String(h.name || ""));
  const metricHeaders = (response.metricHeaders || []).map((h) => String(h.name || ""));

  const rows = (response.rows || []).map((row) => {
    const dimensions: Record<string, string> = {};
    dimHeaders.forEach((name, i) => {
      dimensions[name] = String(row.dimensionValues?.[i]?.value ?? "");
    });
    const metrics: Record<string, number> = {};
    metricHeaders.forEach((name, i) => {
      const parsed = Number(row.metricValues?.[i]?.value ?? 0);
      metrics[name] = Number.isFinite(parsed) ? parsed : 0;
    });
    const rawDate = dimensions.date || "";
    const date =
      rawDate.length === 8 ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}` : rawDate;
    delete dimensions.date;
    return { reportKey: config.reportKey, date, dimensions, metrics };
  });

  const rowCount = Number(response.rowCount || rows.length);
  return {
    rows,
    rowCount,
    truncated: rowCount > rows.length || rows.length >= limit,
  };
}
