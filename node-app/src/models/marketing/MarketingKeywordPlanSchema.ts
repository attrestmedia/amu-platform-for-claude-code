import mongoose, { type HydratedDocument } from "mongoose";

export const MARKETING_KEYWORD_PLAN_STATUS = ["draft", "approved", "archived", "superseded"] as const;
export type MarketingKeywordPlanStatus = (typeof MARKETING_KEYWORD_PLAN_STATUS)[number];
export type MarketingKeywordPlanProvider = "naver_ads" | "google_ads" | "both";

export interface IMarketingKeywordPlan {
  planId: string;
  universeId: string;
  campaignId: string;
  provider: MarketingKeywordPlanProvider;
  status: MarketingKeywordPlanStatus;
  lineage: Record<string, unknown>;
  source: Record<string, unknown>;
  output: Record<string, unknown>;
  approval?: { approvedBy?: string; approvedAt?: Date; approvalId?: string };
  createdBy?: string;
  updatedBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type IMarketingKeywordPlanDocument = HydratedDocument<IMarketingKeywordPlan>;

export const MarketingKeywordPlanSchema = new mongoose.Schema<IMarketingKeywordPlan>(
  {
    planId: { type: String, required: true, unique: true, index: true },
    universeId: { type: String, required: true, index: true },
    campaignId: { type: String, required: true, index: true },
    provider: { type: String, required: true, enum: ["naver_ads", "google_ads", "both"] },
    status: { type: String, required: true, enum: MARKETING_KEYWORD_PLAN_STATUS, default: "draft", index: true },
    lineage: { type: mongoose.Schema.Types.Mixed, required: true },
    source: { type: mongoose.Schema.Types.Mixed, required: true },
    output: { type: mongoose.Schema.Types.Mixed, required: true },
    approval: { type: mongoose.Schema.Types.Mixed, default: undefined },
    createdBy: { type: String, trim: true },
    updatedBy: { type: String, trim: true },
  },
  { timestamps: true, collection: "marketing_keyword_plans" },
);

MarketingKeywordPlanSchema.index({ universeId: 1, createdAt: -1 });
MarketingKeywordPlanSchema.index({ universeId: 1, campaignId: 1, status: 1 });
