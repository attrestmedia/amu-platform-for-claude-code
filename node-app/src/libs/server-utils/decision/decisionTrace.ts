import "server-only";
import {
  buildAiCostTraceCompletion,
  buildAiCostTraceDraft,
  createAiCostTraceId,
  type AiCostTraceCompletion,
  type AiCostTraceDraft,
} from "libs/server-utils/ai/aiCostTraceContract";
import { logger } from "utils/log";
import type { DecisionPoint } from "types/decision/decision";

export const DECISION_TRACE_WORKFLOW = "ai-decision-v1";

export function buildDecisionTraceDraft(args: {
  point: DecisionPoint;
  stateDigest: string;
  model: string;
  service: string;
}): AiCostTraceDraft {
  const traceId = createAiCostTraceId();
  return buildAiCostTraceDraft({
    traceId,
    traceRole: "provider_call",
    service: args.service,
    workflow: DECISION_TRACE_WORKFLOW,
    workflowRunId: traceId,
    taskType: `decision.${args.point.primitive}`,
    provider: "typesafe",
    model: args.model,
    metadata: {
      traceClass: "shadow",
      decisionPointId: args.point.id,
      stateDigest: args.stateDigest,
      questionSetVersion: args.point.questionSetVersion,
    },
  });
}

export function buildDecisionTraceCompletion(args: {
  startedAt: Date;
  ok: boolean;
  returnedModel: string | null;
  inputTokens: number;
  errorCode?: string;
}): AiCostTraceCompletion {
  const inputTokens = Number.isFinite(args.inputTokens) ? Math.max(0, args.inputTokens) : 0;
  return buildAiCostTraceCompletion({
    startedAt: args.startedAt,
    resultStatus: args.ok ? "success" : "failed",
    ...(args.returnedModel !== null ? { model: args.returnedModel } : {}),
    tokens: { input: inputTokens, output: 0 },
    providerCost: { amount: null, currency: "USD", source: "unavailable" },
    coinCharged: 0,
    ...(!args.ok && args.errorCode ? { errorCode: args.errorCode } : {}),
  });
}

export async function recordDecisionTrace(args: {
  draft: AiCostTraceDraft;
  completion: AiCostTraceCompletion;
  returnedModel: string | null;
}): Promise<void> {
  if (args.returnedModel !== null) {
    args.draft.metadata = { ...args.draft.metadata, returnedModel: args.returnedModel };
  }

  try {
    const { completeAiCostTrace, createAiCostTrace } = await import("libs/database/ai");
    await createAiCostTrace(args.draft);
    await completeAiCostTrace({ traceId: args.draft.traceId, completion: args.completion });
  } catch {
    try {
      logger.server.warn({ failure: "decision_trace_record_failed" });
    } catch {
      // Trace observation is best-effort and cannot change the decision result.
    }
  }
}
