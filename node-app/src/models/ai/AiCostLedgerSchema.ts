import { Schema } from "mongoose";
import type {
  AiCostTraceFixedUsage,
  AiCostTraceModalityType,
  AiCostTraceProviderCost,
  AiCostTraceResultStatusType,
  AiCostTraceTokenUsage,
} from "types/ai";

export const AI_COST_LEDGER_SOURCE_TYPES = ["billable", "shadow"] as const;
export type AiCostLedgerSourceType = (typeof AI_COST_LEDGER_SOURCE_TYPES)[number];

export interface IAiCostLedgerDocument {
  ledgerId: string;
  traceId: string;
  rootTraceId: string;
  operationId: string;
  service: string;
  workflow: string;
  taskType: string;
  provider: string;
  model: string;
  modality: AiCostTraceModalityType;
  variant?: string;
  tokens: AiCostTraceTokenUsage;
  fixed: AiCostTraceFixedUsage;
  providerCost: AiCostTraceProviderCost;
  coinCharge: {
    coins: number;
    operationId: string;
    state: "applied" | "failed" | "unknown_outcome" | "none";
  };
  resultStatus: AiCostTraceResultStatusType;
  source: AiCostLedgerSourceType;
  createdAt: Date;
  updatedAt: Date;
}

const TokenUsageSchema = new Schema<AiCostTraceTokenUsage>(
  {
    input: { type: Number, required: true, min: 0, default: 0 },
    output: { type: Number, required: true, min: 0, default: 0 },
    total: { type: Number, required: true, min: 0, default: 0 },
  },
  { _id: false, strict: true },
);

const FixedUsageSchema = new Schema<AiCostTraceFixedUsage>(
  {
    seconds: { type: Number, min: 0 },
    minutes: { type: Number, min: 0 },
    images: { type: Number, min: 0 },
    videos: { type: Number, min: 0 },
    texts: { type: Number, min: 0 },
    characters: { type: Number, min: 0 },
    credits: { type: Number, min: 0 },
  },
  { _id: false, strict: true },
);

const ProviderCostSchema = new Schema<AiCostTraceProviderCost>(
  {
    amount: { type: Number, min: 0, default: null },
    currency: { type: String, required: true, uppercase: true, default: "USD" },
    source: { type: String, enum: ["provider", "catalog", "unavailable"], required: true },
    rateRevision: { type: String, default: "" },
    verifiedAt: { type: String, default: "" },
  },
  { _id: false, strict: true },
);

export const AiCostLedgerSchema = new Schema<IAiCostLedgerDocument>(
  {
    ledgerId: { type: String, required: true, unique: true, index: true, trim: true },
    traceId: { type: String, required: true, unique: true, index: true, trim: true },
    rootTraceId: { type: String, required: true, index: true, trim: true },
    operationId: { type: String, required: true, index: true, trim: true },
    service: { type: String, required: true, index: true, trim: true },
    workflow: { type: String, required: true, index: true, trim: true },
    taskType: { type: String, required: true, index: true, trim: true },
    provider: { type: String, required: true, index: true, lowercase: true, trim: true },
    model: { type: String, required: true, index: true, trim: true },
    modality: { type: String, enum: ["text", "image", "video", "audio"], required: true, index: true },
    variant: { type: String, default: "", trim: true },
    tokens: { type: TokenUsageSchema, required: true },
    fixed: { type: FixedUsageSchema, required: true, default: {} },
    providerCost: { type: ProviderCostSchema, required: true },
    coinCharge: {
      coins: { type: Number, required: true, min: 0, default: 0 },
      operationId: { type: String, default: "", trim: true },
      state: { type: String, enum: ["applied", "failed", "unknown_outcome", "none"], required: true },
    },
    resultStatus: { type: String, enum: ["started", "success", "partial", "failed", "skipped"], required: true },
    source: { type: String, enum: AI_COST_LEDGER_SOURCE_TYPES, required: true, default: "billable" },
  },
  { timestamps: true, collection: "ai_cost_ledger" },
);

AiCostLedgerSchema.index({ service: 1, taskType: 1, createdAt: -1 });
AiCostLedgerSchema.index({ provider: 1, model: 1, createdAt: -1 });
