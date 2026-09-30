import { Schema, type Document } from "mongoose";
import { MARKETING_CHANNELS, MARKETING_PERFORMANCE_ENTITY_TYPES } from "consts/marketing/queue";
import type { MarketingChannel, MarketingPerformanceEntityType } from "consts/marketing/queue";
import type { UnknownRecord } from "utils/common/typeUtils";

export interface IMarketingPerformanceDailyDocument extends Document {
  performanceId: string;
  universeId: string;
  channel: MarketingChannel;
  date: string;
  entityType: MarketingPerformanceEntityType;
  entityId: string;
  metrics?: UnknownRecord;
  meta?: UnknownRecord;
  createdAt: Date;
  updatedAt: Date;
}

export const MarketingPerformanceDailySchema = new Schema<IMarketingPerformanceDailyDocument>(
  {
    performanceId: { type: String, required: true, unique: true, index: true },
    universeId: { type: String, required: true, index: true },
    channel: { type: String, enum: MARKETING_CHANNELS, required: true, index: true },
    date: { type: String, required: true, index: true },
    entityType: { type: String, enum: MARKETING_PERFORMANCE_ENTITY_TYPES, required: true, default: "job", index: true },
    entityId: { type: String, required: true, index: true },
    metrics: { type: Schema.Types.Mixed, default: {} },
    meta: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, collection: "marketing_performance_daily" },
);

MarketingPerformanceDailySchema.index({ universeId: 1, channel: 1, date: -1 });
MarketingPerformanceDailySchema.index({ universeId: 1, entityType: 1, entityId: 1, date: -1 }, { unique: true });
