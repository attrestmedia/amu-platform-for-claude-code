import mongoose, { type HydratedDocument } from "mongoose";

export const MARKETING_AD_EXECUTION_STATUS = ["creating", "paused_created", "active", "stopped", "failed"] as const;
export interface IMarketingAdExecution {
  executionId: string;
  universeId: string;
  draftId: string;
  provider: "naver_ads" | "google_ads";
  idempotencyKey: string;
  status: (typeof MARKETING_AD_EXECUTION_STATUS)[number];
  externalIds?: Record<string, string>;
  request?: Record<string, unknown>;
  response?: Record<string, unknown>;
  error?: string;
  executedBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}
export type IMarketingAdExecutionDocument = HydratedDocument<IMarketingAdExecution>;
export const MarketingAdExecutionSchema = new mongoose.Schema<IMarketingAdExecution>(
  {
    executionId: { type: String, required: true, unique: true, index: true },
    universeId: { type: String, required: true, index: true },
    draftId: { type: String, required: true, index: true },
    provider: { type: String, required: true, enum: ["naver_ads", "google_ads"] },
    idempotencyKey: { type: String, required: true, unique: true, index: true },
    status: { type: String, required: true, enum: MARKETING_AD_EXECUTION_STATUS, index: true },
    externalIds: { type: mongoose.Schema.Types.Mixed, default: undefined },
    request: { type: mongoose.Schema.Types.Mixed, default: undefined },
    response: { type: mongoose.Schema.Types.Mixed, default: undefined },
    error: { type: String },
    executedBy: { type: String },
  },
  { timestamps: true, collection: "marketing_ad_executions" },
);
MarketingAdExecutionSchema.index({ universeId: 1, createdAt: -1 });
