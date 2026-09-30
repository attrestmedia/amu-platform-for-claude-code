export const AI_COST_TRACE_ROLES = ["workflow", "provider_call"] as const;
export type AiCostTraceRoleType = (typeof AI_COST_TRACE_ROLES)[number];

export const AI_COST_TRACE_RESULT_STATUSES = ["started", "success", "partial", "failed", "skipped"] as const;
export type AiCostTraceResultStatusType = (typeof AI_COST_TRACE_RESULT_STATUSES)[number];

export type AiCostTraceTokenUsage = {
  input: number;
  output: number;
  total: number;
};

export type AiCostTraceFallback = {
  provider: string;
  model: string;
  reason: string;
};

export type AiCostTraceProviderCost = {
  amount: number | null;
  currency: string;
  source: "provider" | "catalog" | "unavailable";
  rateRevision?: string;
  verifiedAt?: string;
};

export type AiCostTraceFixedUsage = {
  seconds?: number;
  minutes?: number;
  images?: number;
  videos?: number;
  texts?: number;
  characters?: number;
  credits?: number;
};

export type AiCostTraceModalityType = "text" | "image" | "video" | "audio";

export type AiCostTraceMetadata = {
  jobId?: string;
  operationId?: string;
  sourceService?: string;
  sourceSurface?: string;
  traceClass?: "billable" | "shadow";
  costTraceRootId?: string;
  costTraceChildId?: string;
  decisionPointId?: string;
  stateDigest?: string;
  questionSetVersion?: string;
  returnedModel?: string;
};
