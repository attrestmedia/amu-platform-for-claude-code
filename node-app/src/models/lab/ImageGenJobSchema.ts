import { Schema, type Document } from "mongoose";
import type { ImageProviderType } from "types/ai";
import type { PromptGenType, StudioGenerationSourceServiceType } from "types/app";
import type { UnknownRecord } from "utils/common/typeUtils";

export type ImageGenJobStatusType = "queued" | "running" | "success" | "failed" | "partial";
export type ImageDeletePolicyType = "soft" | "hard" | "detach";

export interface IImageGenJobDocument extends Document {
  jobId: string;
  scope: "user" | "universe";
  uid?: string;
  universeId?: string;
  createdBy?: string;
  provider: ImageProviderType;
  modelName: string;
  request?: {
    templateKey?: string;
    generationMode?: PromptGenType;
    sourceService?: StudioGenerationSourceServiceType;
    sourceSurface?: string;
    promptBytes?: number;
    promptHash?: string;
    variables?: UnknownRecord;
    extraPrompt?: string;
    negative?: string;
    aspectRatio?: string;
    size?: string;
    n?: number;
    baseImages?: Array<{
      index?: number;
      mimeType?: string;
      bytes?: number;
      sha256?: string;
    }>;
  };
  billing?: {
    coins?: number;
    tokenUsage?: UnknownRecord;
    pricingKey?: string;
  };
  status: ImageGenJobStatusType;
  outputCount?: number;
  deletePolicy?: ImageDeletePolicyType;
  error?: {
    code?: string;
    message?: string;
  };
  notification?: {
    readAt?: Date | null;
  };
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const ImageGenJobSchema = new Schema<IImageGenJobDocument>(
  {
    jobId: { type: String, required: true, unique: true, index: true },
    scope: { type: String, enum: ["user", "universe"], required: true, index: true },
    uid: { type: String, index: true, default: "" },
    universeId: { type: String, index: true, default: "" },
    createdBy: { type: String, index: true, default: "" },
    provider: { type: String, required: true, index: true },
    modelName: { type: String, required: true, index: true },
    request: { type: Schema.Types.Mixed, default: {} },
    billing: { type: Schema.Types.Mixed, default: {} },
    status: {
      type: String,
      enum: ["queued", "running", "success", "failed", "partial"],
      required: true,
      index: true,
      default: "queued",
    },
    outputCount: { type: Number, default: 0 },
    deletePolicy: { type: String, enum: ["soft", "hard", "detach"], default: "soft" },
    error: { type: Schema.Types.Mixed, default: null },
    notification: {
      readAt: { type: Date, default: null, index: true },
    },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "image_gen_jobs" },
);

ImageGenJobSchema.index({ scope: 1, uid: 1, createdAt: -1 });
ImageGenJobSchema.index({ scope: 1, universeId: 1, createdAt: -1 });
ImageGenJobSchema.index({ "request.templateKey": 1, createdAt: -1 });
ImageGenJobSchema.index({ createdBy: 1, status: 1, "notification.readAt": 1, createdAt: -1 });
ImageGenJobSchema.index({ "request.clientRequestId": 1, createdAt: -1 });
