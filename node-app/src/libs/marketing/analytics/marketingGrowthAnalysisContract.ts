/**
 * S6 growth operations contract.
 *
 * This module is deliberately side-effect free. It turns stored daily snapshots
 * and the current marketing criteria into a decision-ready, data-honest view.
 * Provider calls and persistence belong to the service layer.
 */

export const MARKETING_GROWTH_ANALYSIS_SCHEMA_VERSION = "s6.v1";
export const MARKETING_GROWTH_TIMEZONE = "Asia/Seoul";
export const MARKETING_GROWTH_REVIEW_WINDOWS = [7, 28] as const;

const STRATEGY_REQUIRED_FIELDS = ["goal", "targetPersona", "primaryConversion"] as const;
const RELATIONSHIP_EVENTS = new Set([
  "content_save",
  "content_save_intent",
  "topic_follow",
  "topic_unfollow",
  "continue_reading",
  "newsletter_subscribe",
  "article_share",
  "related_article_click",
  "signup_complete",
  "login_complete",
  "magazine_return",
]);
const EXPANSION_EVENTS = new Set(["gen_studio_entry", "tutors_entry", "play_entry"]);
const REACH_METRICS = new Set(["impressions", "reach", "views", "videoViews", "activeUsers"]);
const CONSUMPTION_METRICS = new Set(["sessions", "screenPageViews", "pageViews"]);

export type GrowthAnalysisSourceKey = "social" | "web" | "ads" | "commerce";
export type GrowthAnalysisSourceStatus =
  | "observed"
  | "not_collected"
  | "not_configured"
  | "blocked_external";
export type GrowthAnalysisAttributionLevel = "direct" | "estimated" | "correlated" | "unknown";

export type MarketingGrowthPerformanceRow = {
  channel?: string;
  date?: string;
  entityType?: string;
  entityId?: string;
  metrics?: Record<string, unknown> | null;
  meta?: Record<string, unknown> | null;
};

export type MarketingGrowthStrategyInput = {
  goal?: unknown;
  targetPersona?: unknown;
  funnel?: unknown;
  primaryConversion?: unknown;
  coreMessage?: unknown;
  requiredTopics?: unknown;
  excludedTopics?: unknown;
  channelGuidance?: unknown;
  version?: unknown;
};

export type MarketingGrowthAnalysisInput = {
  asOf?: string;
  dateFrom?: string;
  dateTo?: string;
  days?: number;
  strategy?: MarketingGrowthStrategyInput | null;
  rows?: readonly MarketingGrowthPerformanceRow[];
  sourceStatuses?: Partial<Record<GrowthAnalysisSourceKey, GrowthAnalysisSourceStatus>>;
  attributionFilter?: {
    campaignId?: string;
    sourceFingerprint?: string;
    draftId?: string;
  };
};

type GrowthStageKey = "reach" | "consumption" | "relationship" | "expansion" | "revenue";

type GrowthStage = {
  key: GrowthStageKey;
  status: "observed" | "not_observed" | "not_available";
  metricBasis: string[];
  metrics: Record<string, number>;
  rowsUsed: number;
  note?: string;
};

function toText(value: unknown) {
  return String(value ?? "").trim();
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function toPositiveDays(value: unknown, fallback = 28) {
  const next = Math.floor(Number(value));
  return Number.isFinite(next) ? Math.max(1, Math.min(180, next)) : fallback;
}

function toDateString(value: unknown) {
  const text = toText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function dateDaysBefore(dateText: string, days: number) {
  const date = new Date(`${dateText}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  date.setUTCDate(date.getUTCDate() - Math.max(0, days));
  return date.toISOString().slice(0, 10);
}

function currentDate() {
  return new Date().toISOString().slice(0, 10);
}

function toStringList(value: unknown) {
  return Array.isArray(value) ? value.map(toText).filter(Boolean).slice(0, 30) : [];
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function normalizeStrategy(input: MarketingGrowthStrategyInput | null | undefined) {
  const source = toRecord(input);
  const strategy = {
    goal: toText(source.goal),
    targetPersona: toText(source.targetPersona),
    funnel: toText(source.funnel) || "mixed",
    primaryConversion: toText(source.primaryConversion),
    coreMessage: toText(source.coreMessage),
    requiredTopics: toStringList(source.requiredTopics),
    excludedTopics: toStringList(source.excludedTopics),
    channelGuidance: toRecord(source.channelGuidance),
    version: Math.max(0, Math.floor(Number(source.version) || 0)),
  };
  const missing = STRATEGY_REQUIRED_FIELDS.filter((field) => !strategy[field]);
  return {
    ...strategy,
    status: missing.length === 0 ? ("ready" as const) : ("setup_required" as const),
    missing,
  };
}

function sourceForRow(row: MarketingGrowthPerformanceRow): GrowthAnalysisSourceKey {
  const entityType = toText(row.entityType);
  const channel = toText(row.channel);
  if (entityType.startsWith("ad_") || channel.endsWith("_ads")) return "ads";
  if (entityType.startsWith("ga_") || channel === "web" || channel === "email") return "web";
  if (entityType === "social_post" || entityType === "social_account") return "social";
  return "web";
}

function sourceMetricBasis(row: MarketingGrowthPerformanceRow, source: GrowthAnalysisSourceKey) {
  const metrics = toRecord(row.metrics);
  const meta = toRecord(row.meta);
  const metricBasis = toText(metrics.metricBasis) || toText(meta.metricBasis);
  if (metricBasis) return metricBasis;
  if (source === "social") return "stored_social_snapshot";
  if (source === "web") return "stored_ga4_snapshot";
  if (source === "ads") return "stored_ads_snapshot";
  return "not_available";
}

function eventNameFromMetric(key: string) {
  const prefix = key.startsWith("eventCount:")
    ? "eventCount:"
    : key.startsWith("keyEvent:")
      ? "keyEvent:"
      : "";
  return prefix ? key.slice(prefix.length).trim() : "";
}

function addMetric(target: Record<string, number>, key: string, value: number) {
  target[key] = (target[key] || 0) + value;
}

function emptyStage(key: GrowthStageKey, note?: string): GrowthStage {
  return {
    key,
    status: key === "revenue" ? "not_available" : "not_observed",
    metricBasis: [],
    metrics: {},
    rowsUsed: 0,
    ...(note ? { note } : {}),
  };
}

function buildStages(rows: readonly MarketingGrowthPerformanceRow[]) {
  const stages: Record<GrowthStageKey, GrowthStage> = {
    reach: emptyStage("reach"),
    consumption: emptyStage("consumption"),
    relationship: emptyStage("relationship"),
    expansion: emptyStage("expansion"),
    revenue: emptyStage("revenue", "Store 주문·매출 원장은 SSM-603의 자격증명·법무 게이트가 해소될 때까지 연결하지 않습니다."),
  };
  const stageRows = new Set<GrowthStageKey>();
  const basis = new Map<GrowthStageKey, Set<string>>();

  rows.forEach((row) => {
    const source = sourceForRow(row);
    const rowMetrics = toRecord(row.metrics);
    const metricEntries = Object.entries(rowMetrics);
    const rowStages = new Set<GrowthStageKey>();
    const rowBasis = sourceMetricBasis(row, source);

    metricEntries.forEach(([metricKey, rawValue]) => {
      const value = toFiniteNumber(rawValue);
      if (value === null || metricKey === "metricBasis") return;
      if (REACH_METRICS.has(metricKey)) {
        addMetric(stages.reach.metrics, metricKey, value);
        rowStages.add("reach");
      }
      if (CONSUMPTION_METRICS.has(metricKey)) {
        addMetric(stages.consumption.metrics, metricKey, value);
        rowStages.add("consumption");
      }

      const eventName = eventNameFromMetric(metricKey);
      if (eventName && RELATIONSHIP_EVENTS.has(eventName)) {
        addMetric(stages.relationship.metrics, `eventCount:${eventName}`, value);
        rowStages.add("relationship");
      }
      if (eventName && EXPANSION_EVENTS.has(eventName)) {
        addMetric(stages.expansion.metrics, `eventCount:${eventName}`, value);
        rowStages.add("expansion");
      }
    });

    rowStages.forEach((stageKey) => {
      stageRows.add(stageKey);
      const stageBasis = basis.get(stageKey) || new Set<string>();
      stageBasis.add(rowBasis);
      basis.set(stageKey, stageBasis);
    });
  });

  (Object.keys(stages) as GrowthStageKey[]).forEach((stageKey) => {
    if (stageKey === "revenue") return;
    const stage = stages[stageKey];
    stage.metricBasis = Array.from(basis.get(stageKey) || []);
    stage.rowsUsed = stageRows.has(stageKey) ? rows.filter((row) => {
      const metrics = toRecord(row.metrics);
      return Object.keys(metrics).some((key) => {
        if (REACH_METRICS.has(key)) return stageKey === "reach";
        if (CONSUMPTION_METRICS.has(key)) return stageKey === "consumption";
        const eventName = eventNameFromMetric(key);
        return stageKey === "relationship"
          ? RELATIONSHIP_EVENTS.has(eventName)
          : stageKey === "expansion" && EXPANSION_EVENTS.has(eventName);
      });
    }).length : 0;
    stage.status = Object.keys(stage.metrics).length > 0 ? "observed" : "not_observed";
  });
  return stages;
}

function buildSourceReadiness(
  rows: readonly MarketingGrowthPerformanceRow[],
  sourceStatuses: Partial<Record<GrowthAnalysisSourceKey, GrowthAnalysisSourceStatus>> | undefined,
) {
  const rowCounts: Record<GrowthAnalysisSourceKey, number> = { social: 0, web: 0, ads: 0, commerce: 0 };
  rows.forEach((row) => {
    rowCounts[sourceForRow(row)] += 1;
  });
  const keys: GrowthAnalysisSourceKey[] = ["social", "web", "ads", "commerce"];
  return keys.map((key) => ({
    key,
    status:
      key === "commerce"
        ? "blocked_external"
        : rowCounts[key] > 0
          ? "observed"
          : sourceStatuses?.[key] || "not_collected",
    rows: rowCounts[key],
    metricBasis: key === "commerce" ? "not_available" : key === "social" ? "stored_snapshot" : key === "web" ? "stored_snapshot" : "stored_snapshot",
    note:
      key === "commerce"
        ? "주문 API 자격증명과 법무 검토가 필요합니다. 분석 원장에는 구매자 개인정보를 저장하지 않습니다."
        : rowCounts[key] > 0
          ? "저장된 스냅샷만 사용했습니다. 신규 프로바이더 조회는 실행하지 않았습니다."
          : "해당 기간에 저장된 스냅샷이 없습니다. 미수집을 0 성과로 해석하지 않습니다.",
  }));
}

function buildAttribution(
  rows: readonly MarketingGrowthPerformanceRow[],
  requested: MarketingGrowthAnalysisInput["attributionFilter"],
) {
  const filters = Object.entries(requested || {}).filter(([, value]) => toText(value));
  const lineageKeys = ["campaignId", "sourceFingerprint", "draftId"] as const;
  const coverage = Object.fromEntries(
    lineageKeys.map((key) => [key, rows.filter((row) => Boolean(toText(toRecord(row.meta)[key]))).length]),
  );
  if (rows.length === 0) {
    return { level: "unknown" as const, requested: Object.fromEntries(filters), matchedRows: 0, totalRows: 0, lineageCoverage: coverage };
  }
  const directlyMatchedRows = rows.filter((row) => {
    const meta = toRecord(row.meta);
    return filters.length === 0
      ? lineageKeys.every((key) => Boolean(toText(meta[key])))
      : filters.every(([key, value]) => toText(meta[key]) === toText(value));
  }).length;
  return {
    level: directlyMatchedRows === rows.length ? ("direct" as const) : (directlyMatchedRows > 0 ? "correlated" as const : "estimated" as const),
    requested: Object.fromEntries(filters),
    matchedRows: directlyMatchedRows,
    totalRows: rows.length,
    lineageCoverage: coverage,
  };
}

function buildComparison(rows: readonly MarketingGrowthPerformanceRow[]) {
  const groups = new Map<string, { topic: string; hook: string; format: string; channel: string; rowCount: number; metrics: Record<string, number> }>();
  rows.forEach((row) => {
    const meta = toRecord(row.meta);
    const topic = toText(meta.topic);
    const hook = toText(meta.hook);
    const format = toText(meta.format);
    const channel = toText(row.channel);
    if (!topic || !hook || !format || !channel) return;
    const key = [topic, hook, format, channel].join("::");
    const group = groups.get(key) || { topic, hook, format, channel, rowCount: 0, metrics: {} };
    group.rowCount += 1;
    Object.entries(toRecord(row.metrics)).forEach(([metricKey, value]) => {
      const number = toFiniteNumber(value);
      if (number !== null && (REACH_METRICS.has(metricKey) || CONSUMPTION_METRICS.has(metricKey))) {
        addMetric(group.metrics, metricKey, number);
      }
    });
    groups.set(key, group);
  });
  const results = Array.from(groups.values());
  return results.length >= 2
    ? { status: "available" as const, qualifyingRows: results.reduce((sum, item) => sum + item.rowCount, 0), results }
    : { status: "insufficient_sample" as const, qualifyingRows: results.reduce((sum, item) => sum + item.rowCount, 0), results: [] };
}

function buildDiagnosis(
  strategy: ReturnType<typeof normalizeStrategy>,
  rows: readonly MarketingGrowthPerformanceRow[],
  stages: Record<GrowthStageKey, GrowthStage>,
) {
  const hasObservedStage = Object.values(stages).some((stage) => stage.status === "observed");
  const hasObservedData = rows.length > 0 && hasObservedStage;
  const dataStatus = hasObservedData ? "review_ready" : "awaiting_data";
  const primaryNextAction = !strategy.status || strategy.status === "setup_required"
    ? "마케팅 목표·타깃·주요 전환을 먼저 저장하고 캠페인 ID와 UTM 규칙을 연결한다."
    : !hasObservedData
      ? "캠페인 ID·UTM·sourceFingerprint·draftId 연결을 확인하고 7일 스냅샷을 확보한다."
      : "7일·28일 창을 함께 검토하고 Reach·Consumption·Relationship·Business Contribution 트랙별 다음 실험을 초안으로 만든다.";
  return {
    decisionStatus: strategy.status === "setup_required" ? "setup_required" as const : dataStatus as "awaiting_data" | "review_ready",
    bottleneck: null,
    evidence: Object.values(stages)
      .filter((stage) => stage.status === "observed")
      .map((stage) => ({ stage: stage.key, metricKeys: Object.keys(stage.metrics), rowsUsed: stage.rowsUsed })),
    parallelTracks: ["reach", "consumption", "relationship", "expansion", "revenue"].map((stage) => ({
      stage,
      status: stages[stage as GrowthStageKey].status,
      metric: stage === "revenue" ? "commerce_orders" : stage,
      reviewWindowDays: [...MARKETING_GROWTH_REVIEW_WINDOWS],
    })),
    reviewWindowDays: [...MARKETING_GROWTH_REVIEW_WINDOWS],
    doNotChange: "성과 데이터가 없는 상태에서 발행량·채널·예산을 성과 개선으로 간주해 변경하지 않는다.",
    primaryNextAction,
    executionMode: "draft_only",
    noForecast: true,
  };
}

export function buildMarketingGrowthAnalysis(input: MarketingGrowthAnalysisInput = {}) {
  const rows = Array.isArray(input.rows) ? input.rows : [];
  const days = toPositiveDays(input.days);
  const dateTo = toDateString(input.dateTo) || currentDate();
  const dateFrom = toDateString(input.dateFrom) || dateDaysBefore(dateTo, days - 1);
  const strategy = normalizeStrategy(input.strategy);
  const stages = buildStages(rows);
  const sources = buildSourceReadiness(rows, input.sourceStatuses);
  const observedSources = sources.filter((source) => source.status === "observed").length;
  const hasObservedStage = Object.values(stages).some((stage) => stage.status === "observed");
  const dataStatus = rows.length === 0 || !hasObservedStage ? "awaiting_data" : observedSources < 2 ? "partial" : "ready";

  return {
    schemaVersion: MARKETING_GROWTH_ANALYSIS_SCHEMA_VERSION,
    asOf: toText(input.asOf) || new Date().toISOString(),
    window: { days, dateFrom, dateTo, timezone: MARKETING_GROWTH_TIMEZONE },
    strategy,
    dataReadiness: {
      status: dataStatus as "awaiting_data" | "partial" | "ready",
      rows: rows.length,
      sources,
      missingIsNotZero: true,
    },
    funnel: stages,
    attribution: buildAttribution(rows, input.attributionFilter),
    comparison: buildComparison(rows),
    diagnosis: buildDiagnosis(strategy, rows, stages),
  };
}

export type MarketingGrowthAnalysis = ReturnType<typeof buildMarketingGrowthAnalysis>;
