import { Schema, type Document } from "mongoose";
import type { TextProviderType } from "types/ai";
import type { PromptGenType } from "types/app";
import type { UnknownRecord } from "utils/common/typeUtils";

export type ContentGenJobStatusType = "queued" | "running" | "success" | "failed" | "partial";
export type ContentDeletePolicyType = "soft" | "hard" | "detach";

export interface IContentGenJobDocument extends Document {
  jobId: string;
  scope: "user" | "universe";
  uid?: string;
  universeId?: string;
  createdBy?: string;
  provider: TextProviderType;
  modelName: string;
  request?: {
    kind?: string;
    clientRequestId?: string;
    claimToken?: string;
    templateKey?: string;
    templateTitle?: string;
    generationMode?: PromptGenType;
    promptBytes?: number;
    promptHash?: string;
    variables?: UnknownRecord;
    extraPrompt?: string;
    platform?: string;
    language?: string;
    length?: string;
    outputFormat?: string;
    n?: number;
    sourceService?: string;
    sourceSurface?: string;
  };
  billing?: {
    coins?: number;
    tokenUsage?: UnknownRecord;
    pricingKey?: string;
  };
  status: ContentGenJobStatusType;
  outputCount?: number;
  deletePolicy?: ContentDeletePolicyType;
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

export const ContentGenJobSchema = new Schema<IContentGenJobDocument>(
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
  { timestamps: true, collection: "content_gen_jobs" },
);

ContentGenJobSchema.index({ scope: 1, uid: 1, createdAt: -1 });
ContentGenJobSchema.index({ scope: 1, universeId: 1, createdAt: -1 });
ContentGenJobSchema.index({ "request.templateKey": 1, createdAt: -1 });
ContentGenJobSchema.index({ createdBy: 1, status: 1, "notification.readAt": 1, createdAt: -1 });
ContentGenJobSchema.index({ "request.clientRequestId": 1, createdAt: -1 });
// clientRequestId가 있는 동일 scope/소유자 요청은 하나의 Job만 만들 수 있어야 한다.
// 빈 clientRequestId는 기존 일반 사용자·queue 경로와 충돌하지 않도록 partial index에서 제외한다.
ContentGenJobSchema.index(
  { scope: 1, uid: 1, universeId: 1, "request.clientRequestId": 1 },
  {
    unique: true,
    partialFilterExpression: {
      "request.kind": "commerce-product-content",
      "request.clientRequestId": { $gt: "" },
    },
  },
);
