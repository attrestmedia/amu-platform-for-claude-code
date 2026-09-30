import { Schema, type Document } from "mongoose";
import { MARKETING_CHANNELS, MARKETING_STEP_STATUS, MARKETING_STEP_TYPES } from "consts/marketing/queue";
import type { MarketingChannel, MarketingStepStatus, MarketingStepType } from "consts/marketing/queue";
import type { UnknownRecord } from "utils/common/typeUtils";

export interface IMarketingJobStepDocument extends Document {
  stepId: string;
  jobId: string;
  universeId: string;
  stepKey: MarketingStepType;
  status: MarketingStepStatus;
  channel?: MarketingChannel | "";
  attempt: number;
  workerId?: string;
  leaseExpiresAt?: Date | null;
  inputRef?: UnknownRecord;
  outputRef?: UnknownRecord;
  meta?: UnknownRecord;
  lastError?: UnknownRecord | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const MarketingJobStepSchema = new Schema<IMarketingJobStepDocument>(
  {
    stepId: { type: String, required: true, unique: true, index: true },
    jobId: { type: String, required: true, index: true },
    universeId: { type: String, required: true, index: true },
    stepKey: { type: String, enum: MARKETING_STEP_TYPES, required: true, index: true },
    status: { type: String, enum: MARKETING_STEP_STATUS, required: true, default: "queued", index: true },
    channel: { type: String, enum: ["", ...MARKETING_CHANNELS], default: "", index: true },
    attempt: { type: Number, default: 0, index: true },
    workerId: { type: String, default: "" },
    leaseExpiresAt: { type: Date, default: null, index: true },
    inputRef: { type: Schema.Types.Mixed, default: {} },
    outputRef: { type: Schema.Types.Mixed, default: {} },
    meta: { type: Schema.Types.Mixed, default: {} },
    lastError: { type: Schema.Types.Mixed, default: null },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "marketing_job_steps" },
);

MarketingJobStepSchema.index({ jobId: 1, createdAt: 1 });
MarketingJobStepSchema.index({ universeId: 1, status: 1, createdAt: -1 });
MarketingJobStepSchema.index({ universeId: 1, channel: 1, status: 1, createdAt: -1 });
MarketingJobStepSchema.index({ universeId: 1, status: 1, channel: 1, "meta.scheduledPublishAt": 1 });
