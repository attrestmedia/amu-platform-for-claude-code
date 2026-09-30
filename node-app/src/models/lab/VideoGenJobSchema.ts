import { Schema, type Document } from "mongoose";

export type VideoGenJobStatusType = "queued" | "running" | "success" | "partial" | "failed" | "expired" | "cancelled";

export interface IVideoGenJobDocument extends Document {
  jobId: string;
  scope: "user" | "universe";
  uid: string;
  universeId?: string;
  createdBy?: string;
  provider: string;
  modelName: string;
  providerRequestId?: string;
  clientRequestId?: string;
  request: Record<string, unknown>;
  status: VideoGenJobStatusType;
  requestedDurationSeconds: number;
  actualDurationSeconds?: number;
  estimatedCoins: number;
  actualCoins?: number;
  pricingRevision: string;
  billing: {
    reserveOperationId?: string;
    settlementOperationId?: string;
    reservedCoins?: number;
    settledCoins?: number;
    refundedCoins?: number;
    reconciliationRequired?: boolean;
  };
  assets?: string[];
  error?: { code?: string; message?: string };
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const VideoGenJobSchema = new Schema<IVideoGenJobDocument>(
  {
    jobId: { type: String, required: true, unique: true, index: true },
    scope: { type: String, enum: ["user", "universe"], required: true, index: true },
    uid: { type: String, required: true, index: true },
    universeId: { type: String, default: "", index: true },
    createdBy: { type: String, default: "", index: true },
    provider: { type: String, required: true, index: true },
    modelName: { type: String, required: true, index: true },
    providerRequestId: { type: String, default: "", index: true },
    clientRequestId: { type: String, default: "", index: true },
    request: { type: Schema.Types.Mixed, required: true, default: {} },
    status: {
      type: String,
      enum: ["queued", "running", "success", "partial", "failed", "expired", "cancelled"],
      required: true,
      default: "queued",
      index: true,
    },
    requestedDurationSeconds: { type: Number, required: true, min: 1 },
    actualDurationSeconds: { type: Number, min: 0, default: null },
    estimatedCoins: { type: Number, required: true, min: 0 },
    actualCoins: { type: Number, min: 0, default: null },
    pricingRevision: { type: String, required: true, index: true },
    billing: { type: Schema.Types.Mixed, required: true, default: {} },
    assets: { type: [String], default: [] },
    error: { type: Schema.Types.Mixed, default: null },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "video_gen_jobs" },
);

VideoGenJobSchema.index({ uid: 1, createdAt: -1 });
VideoGenJobSchema.index({ uid: 1, clientRequestId: 1, createdAt: -1 });
VideoGenJobSchema.index({ status: 1, createdAt: 1 });
