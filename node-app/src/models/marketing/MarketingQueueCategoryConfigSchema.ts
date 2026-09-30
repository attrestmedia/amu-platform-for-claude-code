import { Schema, Document } from "mongoose";
import { MARKETING_CHANNELS, MARKETING_JOB_PRIORITY } from "consts/marketing/queue";
import type { MarketingChannel, MarketingJobPriority } from "consts/marketing/queue";

export interface IMarketingQueueCategoryConfigDocument extends Document {
  configId: string;
  universeId: string;
  queueCategory: string;
  label?: string;
  enabled: boolean;
  defaultBatchSize: number;
  maxConcurrency?: number;
  defaultPriority: MarketingJobPriority;
  priorityWeight?: number;
  defaultContentTemplateKey?: string;
  defaultImageTemplateKey?: string;
  defaultGenerationMode?: "server_worker" | "local_agent";
  defaultModelProvider?: string;
  defaultModelName?: string;
  defaultReviewMode?: string;
  instructionText?: string;
  siteUrl?: string;
  allowedChannels?: MarketingChannel[];
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const MarketingQueueCategoryConfigSchema = new Schema<IMarketingQueueCategoryConfigDocument>(
  {
    configId: { type: String, required: true, unique: true, index: true },
    universeId: { type: String, required: true, index: true },
    queueCategory: { type: String, required: true, default: "general", index: true },
    label: { type: String, default: "" },
    enabled: { type: Boolean, default: true, index: true },
    defaultBatchSize: { type: Number, default: 1, min: 1, max: 50 },
    maxConcurrency: { type: Number, default: 1, min: 1, max: 20 },
    defaultPriority: { type: String, enum: MARKETING_JOB_PRIORITY, default: "normal", index: true },
    priorityWeight: { type: Number, default: 100 },
    defaultContentTemplateKey: { type: String, default: "" },
    defaultImageTemplateKey: { type: String, default: "" },
    defaultGenerationMode: { type: String, enum: ["server_worker", "local_agent"], default: "server_worker" },
    defaultModelProvider: { type: String, default: "" },
    defaultModelName: { type: String, default: "" },
    defaultReviewMode: { type: String, default: "review_required" },
    instructionText: { type: String, default: "" },
    siteUrl: { type: String, default: "" },
    allowedChannels: { type: [String], enum: MARKETING_CHANNELS, default: ["naver_blog"] },
    updatedBy: { type: String, default: "" },
  },
  { timestamps: true, collection: "marketing_queue_category_configs" },
);

MarketingQueueCategoryConfigSchema.index({ universeId: 1, queueCategory: 1 }, { unique: true });
MarketingQueueCategoryConfigSchema.index({ universeId: 1, enabled: 1, updatedAt: -1 });
