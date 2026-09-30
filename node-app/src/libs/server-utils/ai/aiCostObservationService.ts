import "server-only";
import type { AiCostTraceModalityType, AiCostTraceResultStatusType } from "types/ai";
import type { IFixedUsage, ITokenUsageBreakdown } from "types/payment";
import { createAiCostLedger, createAiCostTrace, completeAiCostTrace } from "libs/database/ai";
import {
  buildAiCostTraceCompletion,
  buildAiCostTraceDraft,
} from "libs/server-utils/ai/aiCostTraceContract";
import { calculateProviderCogs } from "consts/ai/providerCost";
import { logger } from "utils/log";

type BillingResult = {
  ok: boolean;
  coins?: number;
  operationId?: string;
  errorCode?: string;
};

type ObservationArgs = {
  provider: string;
  modelName: string;
  modality?: AiCostTraceModalityType;
  variant?: string;
  usage?: ITokenUsageBreakdown;
  fixed?: IFixedUsage;
  meta?: Record<string, unknown>;
  result: BillingResult;
};

function text(value: unknown) {
  return String(value || "").trim();
}

function resolveService(meta?: Record<string, unknown>) {
  const source = text(meta?.sourceService);
  if (source) return source;
  return text(meta?.route).split("/")[0] || "unknown";
}

function resolveModality(args: ObservationArgs): AiCostTraceModalityType {
  if (args.modality) return args.modality;
  if (args.fixed?.images) return "image";
  if (args.fixed?.videos) return "video";
  if (args.fixed?.seconds || args.fixed?.minutes || args.fixed?.characters) return "audio";
  return "text";
}

function resolveTokens(args: ObservationArgs) {
  const textUsage = args.usage?.text;
  return {
    input: Math.max(0, Number(textUsage?.input || 0)),
    output: Math.max(0, Number(textUsage?.output || 0)),
    total: Math.max(0, Number(textUsage?.input || 0) + Number(textUsage?.output || 0)),
  };
}

function resolveResultStatus(result: BillingResult): Exclude<AiCostTraceResultStatusType, "started"> {
  return result.ok ? "success" : "failed";
}

export async function recordAiCostObservation(args: ObservationArgs) {
  const meta = args.meta || {};
  const traceClass = meta.traceClass === "shadow" ? "shadow" : "billable";
  const operationId = text(args.result.operationId || meta.operationId) || `billing:${Date.now()}`;
  const rootTraceId = text(meta.costTraceRootId);
  const childTraceId = text(meta.costTraceChildId);
  const startedAt = new Date();
  const cogs = calculateProviderCogs({
    provider: args.provider,
    modelName: args.modelName,
    variant: args.variant,
    usage: args.usage,
    fixed: args.fixed,
  });
  let observedRootTraceId = rootTraceId;
  let observedChildTraceId = childTraceId;
  const status = resolveResultStatus(args.result);

  try {
    if (!observedRootTraceId) {
      const root = buildAiCostTraceDraft({
        traceRole: "workflow",
        service: resolveService(meta),
        workflow: "ai-billing-v1",
        workflowRunId: operationId,
        taskType: `${resolveModality(args)}_billing`,
        provider: args.provider,
        model: args.modelName,
        metadata: {
          operationId,
          sourceService: resolveService(meta),
          ...(text(meta.sourceSurface) ? { sourceSurface: text(meta.sourceSurface) } : {}),
          traceClass,
        },
        startedAt,
      });
      observedRootTraceId = root.traceId;
      await createAiCostTrace(root);
      const child = buildAiCostTraceDraft({
        traceRole: "provider_call",
        rootTraceId: root.traceId,
        parentTraceId: root.traceId,
        service: resolveService(meta),
        workflow: "ai-billing-v1",
        workflowRunId: operationId,
        taskType: `${resolveModality(args)}_billing`,
        provider: args.provider,
        model: args.modelName,
        metadata: { operationId, sourceService: resolveService(meta), traceClass },
        startedAt,
      });
      observedChildTraceId = child.traceId;
      await createAiCostTrace(child);
      await completeAiCostTrace({
        traceId: child.traceId,
        completion: buildAiCostTraceCompletion({
          startedAt,
          provider: args.provider,
          model: args.modelName,
          tokens: resolveTokens(args),
          providerCost: cogs,
          resultStatus: status,
          errorCode: text(args.result.errorCode),
          completedAt: new Date(),
        }),
      });
    }

    if (observedRootTraceId) {
      await completeAiCostTrace({
        traceId: observedRootTraceId,
        completion: buildAiCostTraceCompletion({
          startedAt,
          provider: args.provider,
          model: args.modelName,
          tokens: resolveTokens(args),
          providerCost: cogs,
          coinCharged: traceClass === "shadow" ? 0 : Math.max(0, Number(args.result.coins || 0)),
          resultStatus: status,
          errorCode: text(args.result.errorCode),
          completedAt: new Date(),
        }),
      });
    }

    await createAiCostLedger({
      traceId: observedChildTraceId || observedRootTraceId || `trace_missing_${operationId}`,
      rootTraceId: observedRootTraceId || observedChildTraceId || `trace_missing_${operationId}`,
      operationId,
      service: resolveService(meta),
      workflow: traceClass === "shadow" ? "ai-shadow-v1" : "ai-billing-v1",
      taskType: `${resolveModality(args)}_billing`,
      provider: args.provider,
      model: args.modelName,
      modality: resolveModality(args),
      ...(args.variant ? { variant: args.variant } : {}),
      tokens: resolveTokens(args),
      fixed: args.fixed || {},
      providerCost: cogs,
      coinCharge: {
        coins: traceClass === "shadow" ? 0 : Math.max(0, Number(args.result.coins || 0)),
        operationId: text(args.result.operationId),
        state: traceClass === "shadow" ? "none" : args.result.ok ? "applied" : "failed",
      },
      resultStatus: status,
      source: traceClass,
    });
  } catch (error) {
    // 관측 원장은 생성·과금 결과를 바꾸지 않는다. 저장 실패는 별도 로그로 남긴다.
    logger.error("[AI_COST_TRACE_ALERT] observation write failed", {
      alertCode: "AI_COST_TRACE_WRITE_FAILED",
      operationId,
      error,
    });
  }
}
