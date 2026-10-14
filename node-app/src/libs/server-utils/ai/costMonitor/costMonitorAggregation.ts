/**
 * @docHint
 * @purpose 조회 결과를 공개 모니터 보고서로 조립한다
 * @process root·child 중복을 피하고 operation 연결과 unknown 원가를 분리한다
 * @domain ai
 * @scope server
 */

import type {
  AiCostMonitorCallGroup,
  AiCostMonitorCallStats,
  AiCostMonitorCostGroup,
  AiCostMonitorFx,
  AiCostMonitorFxObservation,
  AiCostMonitorJobStats,
  AiCostMonitorReportV1,
  AiCostMonitorWindowPreset,
} from "types/ai";
import type {
  AiCostMonitorCallLatencyRow,
  AiCostMonitorClassLatencyRow,
  AiCostMonitorJobCountRow,
  AiCostMonitorLedgerOperationRow,
  AiCostMonitorTraceCountRow,
} from "libs/database/ai/aiCostMonitorRepo";
import type {
  AiCostMonitorAppliedCoinUsage,
  AiCostMonitorCoinUsageSummary,
} from "libs/server-utils/ai/costMonitor/coinUsageMonitorReader";
import { buildCatalogProvenance } from "./catalogProvenance";
import { computeMargin, resolveMarginPolicy, withFx } from "./costMonitorMargin";
import { resolveMonitorExecutionRoute } from "./executionRoute";

type StatusCounts = { success: number; partial: number; failed: number; started: number };
type MutableCallGroup = StatusCounts & {
  provider: string;
  model: string;
  workflow: string;
  traceClass: "billable" | "shadow";
  p50: number | null;
  p95: number | null;
};
type MutableCostGroup = {
  provider: string;
  model: string;
  modality: "text" | "image" | "video" | "audio";
  source: "billable" | "shadow";
  rows: number;
  knownCostRows: number;
  unknownCostRows: number;
  knownCostUsd: number;
  ledgerCoins: number;
};
type MutableOperation = {
  rows: number;
  knownCostRows: number;
  knownCostUsd: number;
  allApplied: boolean;
};

export type AiCostMonitorAggregationInput = {
  preset: AiCostMonitorWindowPreset;
  from: Date;
  to: Date;
  generatedAt: Date;
  traceCounts: AiCostMonitorTraceCountRow[];
  callLatencies: AiCostMonitorCallLatencyRow[];
  classLatencies: AiCostMonitorClassLatencyRow[];
  jobCounts: AiCostMonitorJobCountRow[];
  ledgerOperations: AiCostMonitorLedgerOperationRow[];
  coinUsageSummaries: AiCostMonitorCoinUsageSummary[];
  appliedCoinUsageEntries: AiCostMonitorAppliedCoinUsage[];
  reservationOperationIds: { held: string[]; reconciliation: string[] };
  fxObservation: AiCostMonitorFxObservation;
  latestDocumentAt: { traces: Date | null; ledger: Date | null; coinUsages: Date | null };
  pricingPolicy: unknown;
};

function traceClass(value: string): "billable" | "shadow" {
  return value === "shadow" ? "shadow" : "billable";
}

function safeCount(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function nullableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function percentile(values: number[] | undefined, index: number) {
  return values && values.length > index ? nullableNumber(values[index]) : null;
}

function statsFromCounts(counts: StatusCounts, p50: number | null, p95: number | null): AiCostMonitorCallStats {
  const completed = counts.success + counts.partial + counts.failed;
  return {
    attempts: completed + counts.started,
    completed,
    success: counts.success,
    partial: counts.partial,
    failed: counts.failed,
    inProgress: counts.started,
    successRate: completed > 0 ? counts.success / completed : null,
    latencyMs: { p50, p95 },
  };
}

function incrementStatus(counts: StatusCounts, status: string, count: number) {
  if (status === "success") counts.success += count;
  else if (status === "partial") counts.partial += count;
  else if (status === "failed") counts.failed += count;
  else if (status === "started") counts.started += count;
}

function callGroupKey(row: { provider: string; model: string; workflow: string; traceClass: string }) {
  return JSON.stringify([row.provider, row.model, row.workflow, traceClass(row.traceClass)]);
}

function buildCallGroups(
  traceCounts: AiCostMonitorTraceCountRow[],
  callLatencies: AiCostMonitorCallLatencyRow[],
): AiCostMonitorCallGroup[] {
  const groups = new Map<string, MutableCallGroup>();
  for (const row of traceCounts) {
    if (row.workflow === "ai-billing-v1") continue;
    const groupTraceClass = traceClass(row.traceClass);
    const key = callGroupKey(row);
    let group = groups.get(key);
    if (!group) {
      group = {
        provider: row.provider,
        model: row.model,
        workflow: row.workflow,
        traceClass: groupTraceClass,
        success: 0,
        partial: 0,
        failed: 0,
        started: 0,
        p50: null,
        p95: null,
      };
      groups.set(key, group);
    }
    incrementStatus(group, row.resultStatus, safeCount(row.count));
  }

  for (const row of callLatencies) {
    const group = groups.get(callGroupKey(row));
    if (!group) continue;
    group.p50 = percentile(row.percentiles, 0);
    group.p95 = percentile(row.percentiles, 1);
  }

  return [...groups.values()]
    .filter((group) => group.success + group.partial + group.failed + group.started > 0)
    .map((group) => ({
      provider: group.provider,
      model: group.model,
      workflow: group.workflow,
      traceClass: group.traceClass,
      executionRoute: resolveMonitorExecutionRoute(group.provider, group.model),
      ...statsFromCounts(group, group.p50, group.p95),
    }))
    .sort((left, right) =>
      `${left.provider}/${left.model}/${left.workflow}/${left.traceClass}`.localeCompare(
        `${right.provider}/${right.model}/${right.workflow}/${right.traceClass}`,
      ),
    );
}

function buildOverallCallStats(
  groups: AiCostMonitorCallGroup[],
  traceClassValue: "billable" | "shadow",
  latencyRows: AiCostMonitorClassLatencyRow[],
): AiCostMonitorCallStats {
  const counts: StatusCounts = { success: 0, partial: 0, failed: 0, started: 0 };
  for (const group of groups) {
    if (group.traceClass !== traceClassValue) continue;
    counts.success += group.success;
    counts.partial += group.partial;
    counts.failed += group.failed;
    counts.started += group.inProgress;
  }
  const latency = latencyRows.find((row) => traceClass(row.traceClass) === traceClassValue)?.percentiles;
  return statsFromCounts(counts, percentile(latency, 0), percentile(latency, 1));
}

function buildJobs(jobCounts: AiCostMonitorJobCountRow[]): AiCostMonitorJobStats[] {
  const groups = new Map<string, StatusCounts>();
  for (const row of jobCounts) {
    if (row.workflow === "ai-billing-v1") continue;
    let counts = groups.get(row.workflow);
    if (!counts) {
      counts = { success: 0, partial: 0, failed: 0, started: 0 };
      groups.set(row.workflow, counts);
    }
    incrementStatus(counts, row.resultStatus, safeCount(row.count));
  }
  return [...groups.entries()]
    .map(([workflow, counts]) => {
      const completed = counts.success + counts.partial + counts.failed;
      return {
        workflow,
        total: completed + counts.started,
        success: counts.success,
        partial: counts.partial,
        failed: counts.failed,
        inProgress: counts.started,
        successRate: completed > 0 ? counts.success / completed : null,
      };
    })
    .filter((group) => group.total > 0)
    .sort((left, right) => left.workflow.localeCompare(right.workflow));
}

function costSource(value: string): "billable" | "shadow" {
  if (value === "billable" || value === "shadow") return value;
  throw new Error("AI cost monitor contains an unsupported cost source.");
}

function costModality(value: string): MutableCostGroup["modality"] {
  if (value === "text" || value === "image" || value === "video" || value === "audio") return value;
  throw new Error("AI cost monitor contains an unsupported modality.");
}

function buildCosts(rows: AiCostMonitorLedgerOperationRow[]) {
  const groups = new Map<string, MutableCostGroup>();
  const operations = new Map<string, MutableOperation>();
  let actualCostUsd = 0;
  let shadowOperatingCostUsd = 0;
  let unknownCostCount = 0;
  let totalRows = 0;
  let knownCostRows = 0;
  let billableRows = 0;

  for (const row of rows) {
    const source = costSource(row.source);
    const modality = costModality(row.modality);
    const key = JSON.stringify([row.provider, row.model, modality, source]);
    let group = groups.get(key);
    if (!group) {
      group = {
        provider: row.provider,
        model: row.model,
        modality,
        source,
        rows: 0,
        knownCostRows: 0,
        unknownCostRows: 0,
        knownCostUsd: 0,
        ledgerCoins: 0,
      };
      groups.set(key, group);
    }
    const count = safeCount(row.rows);
    const knownRows = Math.min(count, safeCount(row.knownCostRows));
    const unknownRows = Math.min(count - knownRows, safeCount(row.unknownCostRows));
    const costUsd = Number.isFinite(row.knownCostUsd) ? row.knownCostUsd : 0;
    const ledgerCoins = Number.isFinite(row.ledgerCoins) ? row.ledgerCoins : 0;
    group.rows += count;
    group.knownCostRows += knownRows;
    group.unknownCostRows += unknownRows;
    group.knownCostUsd += costUsd;
    group.ledgerCoins += ledgerCoins;
    totalRows += count;
    knownCostRows += knownRows;
    unknownCostCount += unknownRows;
    if (source === "billable") {
      billableRows += count;
      actualCostUsd += costUsd;
      if (row.operationId) {
        const operation = operations.get(row.operationId) || { rows: 0, knownCostRows: 0, knownCostUsd: 0, allApplied: true };
        operation.rows += count;
        operation.knownCostRows += knownRows;
        operation.knownCostUsd += costUsd;
        operation.allApplied = operation.allApplied && row.coinChargeState === "applied";
        operations.set(row.operationId, operation);
      }
    } else {
      shadowOperatingCostUsd += costUsd;
    }
  }

  const costGroups: AiCostMonitorCostGroup[] = [...groups.values()]
    .map((group) => ({
      provider: group.provider,
      model: group.model,
      modality: group.modality,
      executionRoute: resolveMonitorExecutionRoute(group.provider, group.model),
      source: group.source,
      rows: group.rows,
      knownCostRows: group.knownCostRows,
      unknownCostRows: group.unknownCostRows,
      knownCostUsd: group.knownCostUsd,
      ledgerCoins: group.ledgerCoins,
    }))
    .sort((left, right) =>
      `${left.provider}/${left.model}/${left.modality}/${left.source}`.localeCompare(
        `${right.provider}/${right.model}/${right.modality}/${right.source}`,
      ),
    );

  return { groups: costGroups, operations, actualCostUsd, shadowOperatingCostUsd, unknownCostCount, totalRows, knownCostRows, billableRows };
}

function compensationSourceOperationId(operationId: string) {
  if (!operationId.startsWith("compensation:")) return "";
  const finalSeparator = operationId.lastIndexOf(":");
  if (finalSeparator <= "compensation:".length) return "";
  return operationId.slice("compensation:".length, finalSeparator);
}

function appliedCoinUsageMaps(entries: AiCostMonitorAppliedCoinUsage[]) {
  const deductionByOperation = new Map<string, number>();
  const refundByOperation = new Map<string, number>();
  for (const entry of entries) {
    const operationId = entry.operationId.trim();
    const amount = Number.isFinite(entry.coins) ? entry.coins : 0;
    if (!operationId) continue;
    if (entry.entryType === "deduction") {
      deductionByOperation.set(operationId, (deductionByOperation.get(operationId) || 0) + amount);
      continue;
    }
    if (entry.entryType !== "refund" && entry.entryType !== "compensation") continue;
    const sourceOperationId = compensationSourceOperationId(operationId) || operationId;
    refundByOperation.set(sourceOperationId, (refundByOperation.get(sourceOperationId) || 0) + Math.abs(amount));
  }
  return { deductionByOperation, refundByOperation };
}

function buildRevenueAndMargin(args: {
  summaries: AiCostMonitorCoinUsageSummary[];
  appliedEntries: AiCostMonitorAppliedCoinUsage[];
  heldOperationIds: string[];
  reconciliationOperationIds: string[];
  ledgerOperations: AiCostMonitorLedgerOperationRow[];
  costOperations: Map<string, MutableOperation>;
  billableRows: number;
  pricingPolicy: unknown;
}) {
  const heldIds = new Set(args.heldOperationIds);
  const reconciliationIds = new Set(args.reconciliationOperationIds);
  let appliedDeductionCoins = 0;
  let heldReservationCoins = 0;
  let reconciliationCoins = 0;
  let refundCoins = 0;
  const nonFinalCounts = { prepared: 0, failed: 0, unknownOutcome: 0, reconciliationRequired: 0 };

  for (const row of args.summaries) {
    if (row.state === "applied" && row.entryType === "deduction") appliedDeductionCoins += row.coins;
    if (row.state === "applied" && (row.entryType === "refund" || row.entryType === "compensation")) refundCoins += row.absoluteCoins;
    if (row.state === "prepared") nonFinalCounts.prepared += row.count;
    else if (row.state === "failed") nonFinalCounts.failed += row.count;
    else if (row.state === "unknown_outcome") nonFinalCounts.unknownOutcome += row.count;
    else if (row.state === "reconciliation_required") nonFinalCounts.reconciliationRequired += row.count;
  }

  const coinUsageOperations = new Set<string>();
  for (const row of args.appliedEntries) {
    if (row.entryType !== "deduction" && row.entryType !== "refund" && row.entryType !== "compensation") continue;
    const operationId = row.operationId.trim();
    if (!operationId || operationId.startsWith("compensation:")) continue;
    if (row.entryType === "deduction") {
      if (reconciliationIds.has(operationId)) {
        appliedDeductionCoins -= row.coins;
        reconciliationCoins += row.coins;
      } else if (heldIds.has(operationId)) {
        appliedDeductionCoins -= row.coins;
        heldReservationCoins += row.coins;
      }
      else {
        coinUsageOperations.add(operationId);
      }
    } else if (!heldIds.has(operationId) && !reconciliationIds.has(operationId)) {
      coinUsageOperations.add(operationId);
    }
  }

  const ledgerOperations = new Set<string>();
  for (const row of args.ledgerOperations) {
    if (row.source === "billable" && row.coinChargeState === "applied" && row.operationId) ledgerOperations.add(row.operationId);
  }
  let ledgerWithoutCoinUsage = 0;
  for (const operationId of ledgerOperations) if (!coinUsageOperations.has(operationId)) ledgerWithoutCoinUsage += 1;
  let coinUsageWithoutLedger = 0;
  for (const operationId of coinUsageOperations) if (!ledgerOperations.has(operationId)) coinUsageWithoutLedger += 1;

  const { deductionByOperation, refundByOperation } = appliedCoinUsageMaps(args.appliedEntries);
  let coveredNetCoins = 0;
  let coveredCostUsd = 0;
  let coveredBillableRows = 0;
  for (const [operationId, operation] of args.costOperations) {
    if (heldIds.has(operationId) || reconciliationIds.has(operationId)) continue;
    if (!operation.allApplied || operation.knownCostRows !== operation.rows || !deductionByOperation.has(operationId)) continue;
    coveredBillableRows += operation.rows;
    coveredCostUsd += operation.knownCostUsd;
    coveredNetCoins +=
      (deductionByOperation.get(operationId) || 0) - (refundByOperation.get(operationId) || 0);
  }

  const margin = computeMargin({ netCoins: coveredNetCoins, costUsd: coveredCostUsd }, resolveMarginPolicy(args.pricingPolicy));
  if (margin.marginRate !== null) margin.status = coveredBillableRows === args.billableRows ? "ok" : "partial";
  else if (coveredBillableRows > 0 && margin.status !== "unavailable") margin.status = "partial";

  return {
    revenue: {
      deductionCoins: appliedDeductionCoins,
      refundCoins,
      netCoins: appliedDeductionCoins - refundCoins,
      heldReservationCoins,
      reconciliationCoins,
      nonFinalCounts,
    },
    margin,
    coveredBillableRows,
    billingLinkMissing: { ledgerWithoutCoinUsage, coinUsageWithoutLedger },
  };
}

function nullableText(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function buildFx(args: {
  policy: unknown;
  observation: AiCostMonitorFxObservation;
  coveredNetCoins: number;
  coveredCostUsd: number;
  coveredBillableRows: number;
  billableRows: number;
}): AiCostMonitorFx {
  const policy = args.policy && typeof args.policy === "object" && !Array.isArray(args.policy)
    ? args.policy as { fxKrwPerUsd?: { value?: unknown; reviewedAt?: unknown; source?: unknown; provisional?: unknown } | null }
    : {};
  const baselinePolicy = policy.fxKrwPerUsd;
  const baselineValue = nullableNumber(baselinePolicy?.value);
  const observedRate = args.observation.status === "ok" ? args.observation.rate : null;
  const marginAtObserved = computeMargin(
    { netCoins: args.coveredNetCoins, costUsd: args.coveredCostUsd },
    withFx(args.policy, observedRate),
  );
  if (marginAtObserved.marginRate !== null) {
    marginAtObserved.status = args.coveredBillableRows === args.billableRows ? "ok" : "partial";
  }

  return {
    baseline: {
      value: baselineValue,
      reviewedAt: nullableText(baselinePolicy?.reviewedAt),
      source: nullableText(baselinePolicy?.source),
      provisional: baselinePolicy?.provisional === true,
    },
    observed: args.observation,
    deltaRatio: baselineValue !== null && baselineValue > 0 && observedRate !== null
      ? observedRate / baselineValue - 1
      : null,
    marginAtObserved,
  };
}

function isoOrNull(value: Date | null) {
  return value instanceof Date && Number.isFinite(value.getTime()) ? value.toISOString() : null;
}

export function aggregateAiCostMonitorReport(input: AiCostMonitorAggregationInput): AiCostMonitorReportV1 {
  const groups = buildCallGroups(input.traceCounts, input.callLatencies);
  const callsByTraceClass = {
    billable: buildOverallCallStats(groups, "billable", input.classLatencies),
    shadow: buildOverallCallStats(groups, "shadow", input.classLatencies),
  };
  const costs = buildCosts(input.ledgerOperations);
  const revenueAndMargin = buildRevenueAndMargin({
    summaries: input.coinUsageSummaries,
    appliedEntries: input.appliedCoinUsageEntries,
    heldOperationIds: input.reservationOperationIds.held,
    reconciliationOperationIds: input.reservationOperationIds.reconciliation,
    ledgerOperations: input.ledgerOperations,
    costOperations: costs.operations,
    billableRows: costs.billableRows,
    pricingPolicy: input.pricingPolicy,
  });

  return {
    schemaVersion: 1,
    window: { preset: input.preset, from: input.from.toISOString(), to: input.to.toISOString() },
    generatedAt: input.generatedAt.toISOString(),
    providerCalls: { ...callsByTraceClass, groups },
    jobs: buildJobs(input.jobCounts),
    revenue: revenueAndMargin.revenue,
    cost: {
      actualCostUsd: costs.actualCostUsd,
      shadowOperatingCostUsd: costs.shadowOperatingCostUsd,
      unknownCostCount: costs.unknownCostCount,
      groups: costs.groups,
    },
    margin: revenueAndMargin.margin,
    fx: buildFx({
      policy: input.pricingPolicy,
      observation: input.fxObservation,
      coveredNetCoins: revenueAndMargin.margin.coveredNetCoins,
      coveredCostUsd: revenueAndMargin.margin.coveredCostUsd,
      coveredBillableRows: revenueAndMargin.coveredBillableRows,
      billableRows: costs.billableRows,
    }),
    dataQuality: {
      costCoverage: costs.totalRows > 0 ? costs.knownCostRows / costs.totalRows : null,
      billingLinkMissing: revenueAndMargin.billingLinkMissing,
      latestDocumentAt: {
        traces: isoOrNull(input.latestDocumentAt.traces),
        ledger: isoOrNull(input.latestDocumentAt.ledger),
        coinUsages: isoOrNull(input.latestDocumentAt.coinUsages),
      },
      lastAggregatedAt: input.generatedAt.toISOString(),
    },
    catalogProvenance: buildCatalogProvenance(),
  };
}
