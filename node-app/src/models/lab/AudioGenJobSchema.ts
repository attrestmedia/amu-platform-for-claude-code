import { Schema, type Document } from "mongoose";

export const AUDIO_GEN_JOB_STATUS_TYPES = [
  "queued",
  "running",
  "success",
  "failed",
  "cancelled",
  "unknown_outcome",
] as const;
export type AudioGenJobStatusType = (typeof AUDIO_GEN_JOB_STATUS_TYPES)[number];
export type AudioGenJobDeletePolicyType = "soft" | "hard" | "detach";

export interface IAudioGenJobDocument extends Document {
  jobId: string;
  scope: "user" | "universe";
  uid: string;
  universeId?: string;
  createdBy?: string;
  provider: string;
  modelName: string;
  clientRequestId: string;
  requestHash: string;
  request: Record<string, unknown>;
  sourceRevision: string;
  sourceHash: string;
  manifestHash: string;
  segmentCount: number;
  status: AudioGenJobStatusType;
  billing: {
    pricingRevision?: string;
    estimatedCoins?: number;
    reservedCoins?: number;
    reservedCharacters?: number;
    completedCharacters?: number;
    generatedCharacters?: number;
    settledCharacters?: number;
    actualCoins?: number;
    refundedCoins?: number;
    reserveOperationId?: string;
    settlementOperationId?: string;
    settlementOperationIds?: string[];
    reservationCycle?: number;
    reconciliationRequired?: boolean;
  };
  assets: string[];
  completedSegments: number[];
  error?: { code?: string; message?: string };
  startedAt?: Date | null;
  completedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const AudioGenJobSchema = new Schema<IAudioGenJobDocument>(
  {
    jobId: { type: String, required: true, unique: true, index: true },
    scope: { type: String, enum: ["user", "universe"], required: true, index: true },
    uid: { type: String, required: true, index: true },
    universeId: { type: String, default: "", index: true },
    createdBy: { type: String, default: "", index: true },
    provider: { type: String, required: true, index: true },
    modelName: { type: String, required: true, index: true },
    clientRequestId: { type: String, required: true, index: true },
    requestHash: { type: String, required: true, index: true },
    request: { type: Schema.Types.Mixed, required: true, default: {} },
    sourceRevision: { type: String, required: true, index: true },
    sourceHash: { type: String, required: true, index: true },
    manifestHash: { type: String, required: true, index: true },
    segmentCount: { type: Number, required: true, min: 1 },
    status: { type: String, enum: AUDIO_GEN_JOB_STATUS_TYPES, required: true, default: "queued", index: true },
    billing: { type: Schema.Types.Mixed, required: true, default: {} },
    assets: { type: [String], default: [] },
    completedSegments: { type: [Number], default: [] },
    error: { type: Schema.Types.Mixed, default: null },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "audio_gen_jobs" },
);

AudioGenJobSchema.index(
  { uid: 1, clientRequestId: 1 },
  { unique: true, partialFilterExpression: { clientRequestId: { $gt: "" } } },
);
AudioGenJobSchema.index({ uid: 1, status: 1, createdAt: -1 });
AudioGenJobSchema.index({ status: 1, updatedAt: 1 });
