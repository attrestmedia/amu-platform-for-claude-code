import crypto from "crypto";
import type {
  AiCostTraceFallback,
  AiCostTraceMetadata,
  AiCostTraceProviderCost,
  AiCostTraceResultStatusType,
  AiCostTraceRoleType,
  AiCostTraceTokenUsage,
} from "types/ai";

export const AI_COST_TRACE_WORKFLOW = "gen-studio-content-queue-v1";
export const AI_COST_TRACE_TASK_TYPE = "text_generation";

export type AiCostTraceDraft = {
  traceId: string;
  rootTraceId: string;
  parentTraceId: string | null;
  traceRole: AiCostTraceRoleType;
  service: string;
  workflow: string;
  workflowRunId: string;
  taskType: string;
  provider: string;
  model: string;
  tokens: AiCostTraceTokenUsage;
  retries: number;
  fallbacks: AiCostTraceFallback[];
  providerCost: AiCostTraceProviderCost;
  coinCharged: number;
  resultStatus: AiCostTraceResultStatusType;
  metadata?: AiCostTraceMetadata;
  startedAt: Date;
};

export type AiCostTraceCompletion = {
  provider?: string;
  model?: string;
  tokens?: Partial<AiCostTraceTokenUsage>;
  retries?: number;
  fallbacks?: AiCostTraceFallback[];
  providerCost?: AiCostTraceProviderCost | null;
  coinCharged?: number;
  resultStatus: Exclude<AiCostTraceResultStatusType, "started">;
  errorCode?: string;
  completedAt: Date;
  durationMs: number;
};

export const EMPTY_AI_COST_TRACE_TOKENS: AiCostTraceTokenUsage = { input: 0, output: 0, total: 0 };

export function createAiCostTraceId() {
  return `trace_${crypto.randomUUID().replace(/-/g, "")}`;
}

export function normalizeAiCostTraceTokens(tokens?: Partial<AiCostTraceTokenUsage> | null): AiCostTraceTokenUsage {
  const input = Math.max(0, Number(tokens?.input || 0));
  const output = Math.max(0, Number(tokens?.output || 0));
  const total = Math.max(0, Number(tokens?.total || input + output));
  return { input, output, total };
}

export function buildAiCostTraceDraft(args: {
  traceId?: string;
  rootTraceId?: string;
  parentTraceId?: string | null;
  traceRole: AiCostTraceRoleType;
  service: string;
  workflow?: string;
  workflowRunId: string;
  taskType?: string;
  provider: string;
  model: string;
  metadata?: AiCostTraceMetadata;
  startedAt?: Date;
}): AiCostTraceDraft {
  const traceId = String(args.traceId || createAiCostTraceId()).trim();
  const rootTraceId = String(args.rootTraceId || traceId).trim();
  return {
    traceId,
    rootTraceId,
    parentTraceId: args.parentTraceId || null,
    traceRole: args.traceRole,
    service: String(args.service || "unknown").trim() || "unknown",
    workflow: String(args.workflow || AI_COST_TRACE_WORKFLOW).trim() || AI_COST_TRACE_WORKFLOW,
    workflowRunId: String(args.workflowRunId || traceId).trim() || traceId,
    taskType: String(args.taskType || AI_COST_TRACE_TASK_TYPE).trim() || AI_COST_TRACE_TASK_TYPE,
    provider: String(args.provider || "unknown").trim().toLowerCase() || "unknown",
    model: String(args.model || "unknown").trim() || "unknown",
    tokens: { ...EMPTY_AI_COST_TRACE_TOKENS },
    retries: 0,
    fallbacks: [],
    providerCost: { amount: null, currency: "USD", source: "unavailable" },
    coinCharged: 0,
    resultStatus: "started",
    ...(args.metadata ? { metadata: args.metadata } : {}),
    startedAt: args.startedAt || new Date(),
  };
}

export function buildAiCostTraceCompletion(args: {
  startedAt: Date;
  resultStatus: Exclude<AiCostTraceResultStatusType, "started">;
  provider?: string;
  model?: string;
  tokens?: Partial<AiCostTraceTokenUsage>;
  retries?: number;
  fallbacks?: AiCostTraceFallback[];
  providerCost?: AiCostTraceProviderCost | null;
  coinCharged?: number;
  errorCode?: string;
  completedAt?: Date;
}): AiCostTraceCompletion {
  const completedAt = args.completedAt || new Date();
  return {
    ...(args.provider ? { provider: args.provider.trim().toLowerCase() } : {}),
    ...(args.model ? { model: args.model.trim() } : {}),
    ...(args.tokens ? { tokens: normalizeAiCostTraceTokens(args.tokens) } : {}),
    retries: Math.max(0, Number(args.retries || 0)),
    fallbacks: args.fallbacks || [],
    ...(args.providerCost !== undefined ? { providerCost: args.providerCost } : {}),
    coinCharged: Math.max(0, Number(args.coinCharged || 0)),
    resultStatus: args.resultStatus,
    ...(args.errorCode ? { errorCode: String(args.errorCode).trim() } : {}),
    completedAt,
    durationMs: Math.max(0, completedAt.getTime() - args.startedAt.getTime()),
  };
}
