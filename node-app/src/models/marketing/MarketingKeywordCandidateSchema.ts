import { Schema, type Document } from "mongoose";
import { MARKETING_CHANNELS, MARKETING_KEYWORD_STATUS } from "consts/marketing/queue";
import type { MarketingChannel, MarketingKeywordStatus } from "consts/marketing/queue";
import type { UnknownRecord } from "utils/common/typeUtils";

export interface IMarketingKeywordCandidateDocument extends Document {
  keywordId: string;
  universeId: string;
  jobId?: string;
  sourceAssetId?: string;
  keyword: string;
  channel?: MarketingChannel | "";
  language?: string;
  score: number;
  status: MarketingKeywordStatus;
  metrics?: UnknownRecord;
  meta?: UnknownRecord;
  createdAt: Date;
  updatedAt: Date;
}

export const MarketingKeywordCandidateSchema = new Schema<IMarketingKeywordCandidateDocument>(
  {
    keywordId: { type: String, required: true, unique: true, index: true },
    universeId: { type: String, required: true, index: true },
    jobId: { type: String, default: "", index: true },
    sourceAssetId: { type: String, default: "", index: true },
    keyword: { type: String, required: true, index: true },
    channel: { type: String, enum: ["", ...MARKETING_CHANNELS], default: "", index: true },
    language: { type: String, default: "ko", index: true },
    score: { type: Number, default: 0, index: true },
    status: { type: String, enum: MARKETING_KEYWORD_STATUS, required: true, default: "candidate", index: true },
    metrics: { type: Schema.Types.Mixed, default: {} },
    meta: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, collection: "marketing_keyword_candidates" },
);

MarketingKeywordCandidateSchema.index({ universeId: 1, keyword: 1, createdAt: -1 });
MarketingKeywordCandidateSchema.index({ universeId: 1, channel: 1, score: -1, createdAt: -1 });
