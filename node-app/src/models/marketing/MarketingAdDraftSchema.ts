import mongoose, { type HydratedDocument } from "mongoose";

export const MARKETING_AD_DRAFT_STATUS = ["draft", "approved", "executing", "paused_created", "failed", "archived"] as const;
export interface IMarketingAdDraft {
  draftId: string;
  universeId: string;
  provider: "naver_ads" | "google_ads";
  status: (typeof MARKETING_AD_DRAFT_STATUS)[number];
  idempotencyKey: string;
  name: string;
  landingUrl: string;
  campaign: { name: string; dailyBudget: number };
  adGroup: { name: string; defaultBid: number };
  creative: { headlines: string[]; descriptions: string[]; finalUrl: string };
  keywords: Array<{ text: string; matchType: "BROAD" | "PHRASE" | "EXACT"; bid?: number }>;
  spendCap: { dailyAmount: number; monthlyAmount: number; currency: string };
  keywordPlanId?: string;
  campaignId?: string;
  lineage?: Record<string, unknown>;
  approval?: { approvedBy?: string; approvedAt?: Date; approvalId?: string };
  validation?: { valid: boolean; issues: string[]; checkedAt: Date };
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}
export type IMarketingAdDraftDocument = HydratedDocument<IMarketingAdDraft>;
export const MarketingAdDraftSchema = new mongoose.Schema<IMarketingAdDraft>(
  {
    draftId: { type: String, required: true, unique: true, index: true },
    universeId: { type: String, required: true, index: true },
    provider: { type: String, required: true, enum: ["naver_ads", "google_ads"] },
    status: { type: String, required: true, enum: MARKETING_AD_DRAFT_STATUS, default: "draft", index: true },
    idempotencyKey: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    landingUrl: { type: String, required: true, trim: true },
    campaign: { type: mongoose.Schema.Types.Mixed, required: true },
    adGroup: { type: mongoose.Schema.Types.Mixed, required: true },
    creative: { type: mongoose.Schema.Types.Mixed, required: true },
    keywords: { type: mongoose.Schema.Types.Mixed, default: [] },
    spendCap: { type: mongoose.Schema.Types.Mixed, required: true },
    keywordPlanId: { type: String, trim: true, index: true },
    campaignId: { type: String, trim: true, index: true },
    lineage: { type: mongoose.Schema.Types.Mixed, default: undefined },
    approval: { type: mongoose.Schema.Types.Mixed, default: undefined },
    validation: { type: mongoose.Schema.Types.Mixed, default: undefined },
    createdBy: { type: String, trim: true },
  },
  { timestamps: true, collection: "marketing_ad_drafts" },
);
MarketingAdDraftSchema.index({ universeId: 1, createdAt: -1 });
