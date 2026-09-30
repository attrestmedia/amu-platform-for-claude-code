export type AiCostTraceHealthInput = {
  expectedObservations: number;
  observedObservations: number;
  storageFailures?: number;
};

export type AiCostTraceHealthResult = {
  ok: boolean;
  expectedObservations: number;
  observedObservations: number;
  missingObservations: number;
  storageFailures: number;
  alertCode: "AI_COST_TRACE_MISSING" | "AI_COST_TRACE_WRITE_FAILED" | null;
};

export function evaluateAiCostTraceHealth(args: AiCostTraceHealthInput): AiCostTraceHealthResult {
  const expectedObservations = Math.max(0, Math.floor(Number(args.expectedObservations) || 0));
  const observedObservations = Math.max(0, Math.floor(Number(args.observedObservations) || 0));
  const storageFailures = Math.max(0, Math.floor(Number(args.storageFailures) || 0));
  const missingObservations = Math.max(0, expectedObservations - observedObservations);

  return {
    ok: missingObservations === 0 && storageFailures === 0,
    expectedObservations,
    observedObservations,
    missingObservations,
    storageFailures,
    alertCode:
      storageFailures > 0
        ? "AI_COST_TRACE_WRITE_FAILED"
        : missingObservations > 0
          ? "AI_COST_TRACE_MISSING"
          : null,
  };
}
