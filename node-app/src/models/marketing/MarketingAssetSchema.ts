import { Schema, type Document } from "mongoose";
import { MARKETING_ASSET_STATE, MARKETING_CHANNELS } from "consts/marketing/queue";
import type { MarketingAssetState, MarketingChannel } from "consts/marketing/queue";
import type { UnknownRecord } from "utils/common/typeUtils";

export interface IMarketingAssetDocument extends Document {
  assetId: string;
  jobId: string;
  stepId?: string;
  universeId: string;
  kind: string;
  channel?: MarketingChannel | "";
  title?: string;
  mimeType?: string;
  state: MarketingAssetState;
  content?: UnknownRecord;
  meta?: UnknownRecord;
  createdAt: Date;
  updatedAt: Date;
}

export const MarketingAssetSchema = new Schema<IMarketingAssetDocument>(
  {
    assetId: { type: String, required: true, unique: true, index: true },
    jobId: { type: String, required: true, index: true },
    stepId: { type: String, default: "", index: true },
    universeId: { type: String, required: true, index: true },
    kind: { type: String, required: true, index: true },
    channel: { type: String, enum: ["", ...MARKETING_CHANNELS], default: "", index: true },
    title: { type: String, default: "" },
    mimeType: { type: String, default: "" },
    state: { type: String, enum: MARKETING_ASSET_STATE, required: true, default: "active", index: true },
    content: { type: Schema.Types.Mixed, default: {} },
    meta: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, collection: "marketing_assets" },
);

MarketingAssetSchema.index({ jobId: 1, createdAt: -1 });
MarketingAssetSchema.index({ universeId: 1, kind: 1, createdAt: -1 });
MarketingAssetSchema.index({ universeId: 1, channel: 1, state: 1, createdAt: -1 });
MarketingAssetSchema.index({ universeId: 1, kind: 1, state: 1, createdAt: -1, assetId: -1 });
MarketingAssetSchema.index({
  universeId: 1,
  kind: 1,
  state: 1,
  "content.retentionMode": 1,
  "content.expiresAt": 1,
});
MarketingAssetSchema.index({ "content.marketingUploadAssetIds": 1, state: 1, jobId: 1 });
