export const AI_BENCHMARK_VERSION = "r6-v1" as const;

export const AI_BENCHMARK_THRESHOLDS = {
  maxQualityRegression: 0.05,
  maxLatencyRegression: 0.2,
  minCostSaving: 0.15,
} as const;

export type AiBenchmarkCase = {
  caseId: string;
  service: string;
  taskType: string;
  sourceOperationId: string;
  inputDigest: string;
};

export type AiBenchmarkMetrics = {
  qualityScore: number;
  latencyMs: number;
  providerCostUsd: number | null;
};

export type AiRoutingBenchmarkVerdict = {
  pass: boolean;
  qualityRegression: number;
  latencyRegression: number;
  costSaving: number | null;
  reason: "pass" | "quality_regression" | "latency_regression" | "cost_not_lower" | "unknown_cost" | "invalid_metrics";
};

export type AiShadowComparison = {
  traceClass: "shadow";
  userResponse: string;
  userCoinCharged: number;
  baseline: { provider: string; modelName: string; traceClass: "billable" };
  candidate: { provider: string; modelName: string; traceClass: "shadow"; coinCharged: 0 };
};

function finiteNonNegative(value: number) {
  return Number.isFinite(value) && value >= 0;
}

export function evaluateRoutingCandidate(args: {
  baseline: AiBenchmarkMetrics;
  candidate: AiBenchmarkMetrics;
}): AiRoutingBenchmarkVerdict {
  const { baseline, candidate } = args;
  if (
    !finiteNonNegative(baseline.qualityScore) ||
    !finiteNonNegative(candidate.qualityScore) ||
    !finiteNonNegative(baseline.latencyMs) ||
    !finiteNonNegative(candidate.latencyMs) ||
    !(baseline.qualityScore > 0) ||
    !(baseline.latencyMs > 0) ||
    typeof baseline.providerCostUsd !== "number" ||
    typeof candidate.providerCostUsd !== "number" ||
    !finiteNonNegative(baseline.providerCostUsd) ||
    !finiteNonNegative(candidate.providerCostUsd)
  ) {
    return { pass: false, qualityRegression: 0, latencyRegression: 0, costSaving: null, reason: "invalid_metrics" };
  }

  const qualityRegression = Math.max(0, (baseline.qualityScore - candidate.qualityScore) / baseline.qualityScore);
  const latencyRegression = Math.max(0, (candidate.latencyMs - baseline.latencyMs) / baseline.latencyMs);
  const costSaving = baseline.providerCostUsd === 0
    ? 0
    : (baseline.providerCostUsd - candidate.providerCostUsd) / baseline.providerCostUsd;

  if (qualityRegression > AI_BENCHMARK_THRESHOLDS.maxQualityRegression) {
    return { pass: false, qualityRegression, latencyRegression, costSaving, reason: "quality_regression" };
  }
  if (latencyRegression > AI_BENCHMARK_THRESHOLDS.maxLatencyRegression) {
    return { pass: false, qualityRegression, latencyRegression, costSaving, reason: "latency_regression" };
  }
  if (costSaving < AI_BENCHMARK_THRESHOLDS.minCostSaving) {
    return { pass: false, qualityRegression, latencyRegression, costSaving, reason: "cost_not_lower" };
  }
  return { pass: true, qualityRegression, latencyRegression, costSaving, reason: "pass" };
}

export function buildShadowComparison(args: {
  baseline: { provider: string; modelName: string; output: string; coinCharged: number };
  candidate: { provider: string; modelName: string };
}): AiShadowComparison {
  return {
    traceClass: "shadow",
    userResponse: args.baseline.output,
    userCoinCharged: Math.max(0, Number(args.baseline.coinCharged) || 0),
    baseline: {
      provider: args.baseline.provider,
      modelName: args.baseline.modelName,
      traceClass: "billable",
    },
    candidate: {
      provider: args.candidate.provider,
      modelName: args.candidate.modelName,
      traceClass: "shadow",
      coinCharged: 0,
    },
  };
}

export function sanitizeBenchmarkCase(args: AiBenchmarkCase): AiBenchmarkCase {
  return {
    caseId: String(args.caseId).trim(),
    service: String(args.service).trim(),
    taskType: String(args.taskType).trim(),
    sourceOperationId: String(args.sourceOperationId).trim(),
    inputDigest: String(args.inputDigest).trim(),
  };
}
