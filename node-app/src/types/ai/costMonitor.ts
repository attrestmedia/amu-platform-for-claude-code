/**
 * @docHint
 * @purpose 공용 AI 비용 모니터의 API 응답 타입을 정의한다
 * @process 집계 결과와 카탈로그 provenance를 안전한 공개 shape으로 표현한다
 * @domain ai
 * @scope shared
 */

export const AI_COST_MONITOR_WINDOWS = ["24h", "7d", "30d"] as const;
export type AiCostMonitorWindowPreset = (typeof AI_COST_MONITOR_WINDOWS)[number];

export type AiCostMonitorExecutionRoute = "direct" | "unknown";

export type AiCostMonitorCallStats = {
  attempts: number;
  completed: number;
  success: number;
  partial: number;
  failed: number;
  inProgress: number;
  successRate: number | null;
  latencyMs: { p50: number | null; p95: number | null };
};

export type AiCostMonitorCallGroup = AiCostMonitorCallStats & {
  provider: string;
  model: string;
  workflow: string;
  traceClass: "billable" | "shadow";
  executionRoute: AiCostMonitorExecutionRoute;
};

export type AiCostMonitorJobStats = {
  workflow: string;
  total: number;
  success: number;
  partial: number;
  failed: number;
  inProgress: number;
  successRate: number | null;
};

export type AiCostMonitorRevenue = {
  deductionCoins: number;
  refundCoins: number;
  netCoins: number;
  heldReservationCoins: number;
  reconciliationCoins: number;
  nonFinalCounts: { prepared: number; failed: number; unknownOutcome: number; reconciliationRequired: number };
};

export type AiCostMonitorCostGroup = {
  provider: string;
  model: string;
  modality: "text" | "image" | "video" | "audio";
  executionRoute: AiCostMonitorExecutionRoute;
  source: "billable" | "shadow";
  rows: number;
  knownCostRows: number;
  unknownCostRows: number;
  knownCostUsd: number;
  ledgerCoins: number;
};

export type AiCostMonitorMargin = {
  status: "ok" | "partial" | "unavailable";
  marginRate: number | null;
  coveredNetCoins: number;
  coveredCostUsd: number;
  netRevenuePerCoinKrw: number | null;
  fxKrwPerUsd: number | null;
  fxProvisional: boolean;
  targetMargin: number | null;
  minMargin: number | null;
};

export type AiCostMonitorFxUnavailableReason =
  | "FX_TIMEOUT"
  | "FX_HTTP_ERROR"
  | "FX_INVALID_RESPONSE"
  | "FX_NETWORK_ERROR";

export type AiCostMonitorFxObservation =
  | {
      status: "ok";
      rate: number;
      rateDate: string;
      fetchedAt: string;
      source: "frankfurter_v2";
      sourceUrl: string;
    }
  | {
      status: "unavailable";
      reason: AiCostMonitorFxUnavailableReason;
      rate: null;
      rateDate: null;
      fetchedAt: string;
      source: "frankfurter_v2";
      sourceUrl: string;
    };

export type AiCostMonitorFx = {
  baseline: {
    value: number | null;
    reviewedAt: string | null;
    source: string | null;
    provisional: boolean;
  };
  observed: AiCostMonitorFxObservation;
  deltaRatio: number | null;
  marginAtObserved: AiCostMonitorMargin;
};

export type AiCostMonitorDataQuality = {
  costCoverage: number | null;
  billingLinkMissing: { ledgerWithoutCoinUsage: number; coinUsageWithoutLedger: number };
  latestDocumentAt: { traces: string | null; ledger: string | null; coinUsages: string | null };
  lastAggregatedAt: string;
};

export type AiCostMonitorProvenanceItem = {
  modelId: string;
  modality: "text" | "image" | "video" | "audio";
  providerCost: {
    certainty: string | null;
    verifiedAt: string | null;
    source: string | null;
    trackerRunId: string | null;
    changeRecordPath: string | null;
  } | null;
};

export type AiCostMonitorCatalogProvenance = {
  manifestRevision: string;
  pricingRevision: string;
  providerCostRevision: string;
  items: AiCostMonitorProvenanceItem[];
  trackerComparison: { status: "unavailable"; reason: "TRACKER_PROPOSAL_NOT_INGESTED" };
};

export type AiCostMonitorReportV1 = {
  schemaVersion: 1;
  window: { preset: AiCostMonitorWindowPreset; from: string; to: string };
  generatedAt: string;
  providerCalls: { billable: AiCostMonitorCallStats; shadow: AiCostMonitorCallStats; groups: AiCostMonitorCallGroup[] };
  jobs: AiCostMonitorJobStats[];
  revenue: AiCostMonitorRevenue;
  cost: { actualCostUsd: number; shadowOperatingCostUsd: number; unknownCostCount: number; groups: AiCostMonitorCostGroup[] };
  margin: AiCostMonitorMargin;
  fx: AiCostMonitorFx;
  dataQuality: AiCostMonitorDataQuality;
  catalogProvenance: AiCostMonitorCatalogProvenance;
};
