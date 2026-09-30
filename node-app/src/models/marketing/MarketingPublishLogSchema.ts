import { Schema, type Document } from "mongoose";
import { MARKETING_CHANNELS, MARKETING_PUBLISH_STATUS } from "consts/marketing/queue";
import type { MarketingChannel, MarketingPublishStatus } from "consts/marketing/queue";
import type { UnknownRecord } from "utils/common/typeUtils";

export interface IMarketingPublishLogDocument extends Document {
  publishLogId: string;
  universeId: string;
  jobId: string;
  stepId?: string;
  channel: MarketingChannel;
  status: MarketingPublishStatus;
  targetRef?: UnknownRecord;
  request?: UnknownRecord;
  response?: UnknownRecord;
  completedBy?: string;
  publishedAt?: Date | null;
  completedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const MarketingPublishLogSchema = new Schema<IMarketingPublishLogDocument>(
  {
    publishLogId: { type: String, required: true, unique: true, index: true },
    universeId: { type: String, required: true, index: true },
    jobId: { type: String, required: true, index: true },
    stepId: { type: String, default: "", index: true },
    channel: { type: String, enum: MARKETING_CHANNELS, required: true, index: true },
    status: { type: String, enum: MARKETING_PUBLISH_STATUS, required: true, default: "draft", index: true },
    targetRef: { type: Schema.Types.Mixed, default: {} },
    request: { type: Schema.Types.Mixed, default: {} },
    response: { type: Schema.Types.Mixed, default: {} },
    completedBy: { type: String, default: "" },
    publishedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "marketing_publish_logs" },
);

MarketingPublishLogSchema.index({ universeId: 1, channel: 1, createdAt: -1 });
MarketingPublishLogSchema.index({ universeId: 1, status: 1, createdAt: -1 });
MarketingPublishLogSchema.index({ jobId: 1, channel: 1, createdAt: -1 });
