import { Schema } from "mongoose";
import {
  AI_COST_TRACE_RESULT_STATUSES,
  AI_COST_TRACE_ROLES,
  type AiCostTraceFallback,
  type AiCostTraceMetadata,
  type AiCostTraceProviderCost,
  type AiCostTraceResultStatusType,
  type AiCostTraceRoleType,
  type AiCostTraceTokenUsage,
} from "types/ai";

export interface IAiCostTraceDocument {
  traceId: string;
  rootTraceId: string;
  parentTraceId?: string | null;
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
  providerCost: AiCostTraceProviderCost | null;
  coinCharged: number;
  resultStatus: AiCostTraceResultStatusType;
  errorCode?: string;
  metadata?: AiCostTraceMetadata;
  startedAt: Date;
  completedAt?: Date | null;
  durationMs?: number | null;
  createdAt: Date;
  updatedAt: Date;
}

const AiCostTraceTokenUsageSchema = new Schema<AiCostTraceTokenUsage>(
  {
    input: { type: Number, required: true, min: 0, default: 0 },
    output: { type: Number, required: true, min: 0, default: 0 },
    total: { type: Number, required: true, min: 0, default: 0 },
  },
  { _id: false, strict: true },
);

const AiCostTraceFallbackSchema = new Schema<AiCostTraceFallback>(
  {
    provider: { type: String, required: true, trim: true },
    model: { type: String, required: true, trim: true },
    reason: { type: String, required: true, trim: true },
  },
  { _id: false, strict: true },
);

const AiCostTraceProviderCostSchema = new Schema<AiCostTraceProviderCost>(
  {
    amount: { type: Number, min: 0, default: null },
    currency: { type: String, required: true, trim: true, uppercase: true, default: "USD" },
    source: { type: String, enum: ["provider", "catalog", "unavailable"], required: true, default: "unavailable" },
    rateRevision: { type: String, default: "" },
    verifiedAt: { type: String, default: "" },
  },
  { _id: false, strict: true },
);

const AiCostTraceMetadataSchema = new Schema<AiCostTraceMetadata>(
  {
    jobId: { type: String, trim: true, default: "" },
    operationId: { type: String, trim: true, default: "" },
    sourceService: { type: String, trim: true, default: "" },
    sourceSurface: { type: String, trim: true, default: "" },
    traceClass: { type: String, enum: ["billable", "shadow"], default: "billable" },
    costTraceRootId: { type: String, trim: true, default: "" },
    costTraceChildId: { type: String, trim: true, default: "" },
    decisionPointId: { type: String, trim: true },
    stateDigest: { type: String, trim: true },
    questionSetVersion: { type: String, trim: true },
    returnedModel: { type: String, trim: true },
  },
  { _id: false, strict: true },
);

export const AiCostTraceSchema = new Schema<IAiCostTraceDocument>(
  {
    traceId: { type: String, required: true, unique: true, index: true, trim: true },
    rootTraceId: { type: String, required: true, index: true, trim: true },
    parentTraceId: { type: String, default: null, index: true, trim: true },
    traceRole: { type: String, enum: AI_COST_TRACE_ROLES, required: true, index: true },
    service: { type: String, required: true, index: true, trim: true },
    workflow: { type: String, required: true, index: true, trim: true },
    workflowRunId: { type: String, required: true, index: true, trim: true },
    taskType: { type: String, required: true, index: true, trim: true },
    provider: { type: String, required: true, index: true, trim: true, lowercase: true },
    model: { type: String, required: true, index: true, trim: true },
    tokens: { type: AiCostTraceTokenUsageSchema, required: true },
    retries: { type: Number, required: true, min: 0, default: 0 },
    fallbacks: { type: [AiCostTraceFallbackSchema], default: [] },
    providerCost: { type: AiCostTraceProviderCostSchema, default: null },
    coinCharged: { type: Number, required: true, min: 0, default: 0 },
    resultStatus: { type: String, enum: AI_COST_TRACE_RESULT_STATUSES, required: true, index: true },
    errorCode: { type: String, default: "", trim: true },
    metadata: { type: AiCostTraceMetadataSchema, default: undefined },
    startedAt: { type: Date, required: true, index: true },
    completedAt: { type: Date, default: null },
    durationMs: { type: Number, min: 0, default: null },
  },
  { timestamps: true, collection: "ai_cost_traces" },
);

AiCostTraceSchema.index({ workflow: 1, workflowRunId: 1, createdAt: -1 });
AiCostTraceSchema.index({ service: 1, taskType: 1, createdAt: -1 });
AiCostTraceSchema.index({ rootTraceId: 1, traceRole: 1, createdAt: 1 });
