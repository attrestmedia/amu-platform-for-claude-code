import "server-only";
import { AI_MODEL_CATALOG } from "consts/ai/generated/modelCatalog.generated";
import {
  readAiCostMonitorReservationOperationIds,
  readAiCostMonitorTraceAndLedger,
} from "libs/database/ai/aiCostMonitorRepo";
import { readAiCostMonitorCoinUsage } from "libs/server-utils/ai/costMonitor/coinUsageMonitorReader";
import type { AiCostMonitorReportV1, AiCostMonitorWindowPreset } from "types/ai";
import type { AiCostMonitorFxObservation } from "types/ai";
import type { AiCostMonitorTraceAndLedgerRead } from "libs/database/ai/aiCostMonitorRepo";
import type { AiCostMonitorCoinUsageRead } from "libs/server-utils/ai/costMonitor/coinUsageMonitorReader";
import { readFrankfurterUsdKrw } from "./fxObservationReader";
import { logger } from "utils/log";
import { aggregateAiCostMonitorReport } from "./costMonitorAggregation";
import { resolveCostMonitorWindow } from "./costMonitorWindow";

/**
 * @docHint
 * @purpose 공용 AI 비용 모니터 보고서를 조립하는 서버 진입점
 * @process 독립 저장소 조회를 병렬로 수행하고 집계 결과를 반환한다
 * @domain ai
 * @scope server
 */

export type AiCostMonitorReportReaders = {
  readTraceAndLedger: (window: { from: Date; to: Date }) => Promise<AiCostMonitorTraceAndLedgerRead>;
  readCoinUsage: (window: { from: Date; to: Date }) => Promise<AiCostMonitorCoinUsageRead>;
  readReservationOperationIds: () => Promise<{ held: string[]; reconciliation: string[] }>;
  readFxObservation: () => Promise<AiCostMonitorFxObservation>;
  now: () => Date;
};

const defaultReaders: AiCostMonitorReportReaders = {
  readTraceAndLedger: readAiCostMonitorTraceAndLedger,
  readCoinUsage: readAiCostMonitorCoinUsage,
  readReservationOperationIds: readAiCostMonitorReservationOperationIds,
  readFxObservation: () => readFrankfurterUsdKrw(),
  now: () => new Date(),
};

function unavailableFxObservation(fetchedAt: Date): AiCostMonitorFxObservation {
  return {
    status: "unavailable",
    reason: "FX_NETWORK_ERROR",
    rate: null,
    rateDate: null,
    fetchedAt: Number.isFinite(fetchedAt.getTime()) ? fetchedAt.toISOString() : new Date().toISOString(),
    source: "frankfurter_v2",
    sourceUrl: "https://api.frankfurter.dev/v2/rate/USD/KRW",
  };
}

export async function buildAiCostMonitorReport(
  preset: unknown,
  readers: AiCostMonitorReportReaders = defaultReaders,
): Promise<AiCostMonitorReportV1> {
  const window = resolveCostMonitorWindow(preset, readers.now());
  const [traceAndLedger, coinUsage, reservationOperationIds, fxObservation] = await Promise.all([
    readers.readTraceAndLedger({ from: window.from, to: window.to }),
    readers.readCoinUsage({ from: window.from, to: window.to }),
    readers.readReservationOperationIds(),
    Promise.resolve().then(() => readers.readFxObservation()).catch(() => {
      logger.warn("[ai-cost-monitor] FX observation unavailable", { reason: "FX_NETWORK_ERROR" });
      return unavailableFxObservation(readers.now());
    }),
  ]);
  const generatedAt = readers.now();

  return aggregateAiCostMonitorReport({
    preset: window.preset as AiCostMonitorWindowPreset,
    from: window.from,
    to: window.to,
    generatedAt,
    traceCounts: traceAndLedger.traceCounts,
    callLatencies: traceAndLedger.callLatencies,
    classLatencies: traceAndLedger.classLatencies,
    jobCounts: traceAndLedger.jobCounts,
    ledgerOperations: traceAndLedger.ledgerOperations,
    coinUsageSummaries: coinUsage.summaries,
    appliedCoinUsageEntries: coinUsage.appliedEntries,
    reservationOperationIds,
    fxObservation,
    latestDocumentAt: {
      traces: traceAndLedger.latestDocumentAt.traces,
      ledger: traceAndLedger.latestDocumentAt.ledger,
      coinUsages: coinUsage.latestDocumentAt,
    },
    pricingPolicy: AI_MODEL_CATALOG.pricingPolicy,
  });
}
