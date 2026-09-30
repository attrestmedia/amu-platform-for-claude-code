import mongoose, { type HydratedDocument } from "mongoose";

export const MARKETING_PROMO_SLOTS = [
  "article_inline",
  "article_end",
  "home_hero",
  "home_after_featured",
  "home_footer_cta",
  "list_inline_3",
  "list_sidebar_sticky",
] as const;
export type MarketingPromoSlot = (typeof MARKETING_PROMO_SLOTS)[number];

export const MARKETING_PROMO_STATUSES = ["draft", "review", "active", "paused", "closed"] as const;
export type MarketingPromoStatus = (typeof MARKETING_PROMO_STATUSES)[number];

export const MARKETING_PROMO_AXES = ["genstudio", "tutors", "play", "branding"] as const;
export type MarketingPromoAxis = (typeof MARKETING_PROMO_AXES)[number];

export interface IMarketingPromoCreative {
  creativeId: string;
  universeId: string;
  campaignId: string;
  status: MarketingPromoStatus;
  axis: MarketingPromoAxis;
  variant: "A" | "B";
  slotIds: MarketingPromoSlot[];
  targeting: {
    includeCategories: string[];
    excludeCategories: string[];
    tags: string[];
    templateKeys: string[];
  };
  creative: {
    headline: string;
    body: string;
    ctaLabel: string;
    landingUrl: string;
    imageAssetId?: string;
    imageUrl?: string;
    imageWidth?: number;
    imageHeight?: number;
    templateKey?: string;
    label: string;
  };
  period: { startsAt?: Date; endsAt?: Date };
  review: {
    level: "L2" | "L3";
    issues: string[];
    requestedAt?: Date;
    approvedAt?: Date;
    approvedBy?: string;
  };
  createdBy?: string;
  updatedBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type IMarketingPromoCreativeDocument = HydratedDocument<IMarketingPromoCreative>;

export const MarketingPromoCreativeSchema = new mongoose.Schema<IMarketingPromoCreative>(
  {
    creativeId: { type: String, required: true, unique: true, index: true },
    universeId: { type: String, required: true, index: true },
    campaignId: { type: String, required: true, trim: true, index: true },
    status: { type: String, required: true, enum: MARKETING_PROMO_STATUSES, default: "draft", index: true },
    axis: { type: String, required: true, enum: MARKETING_PROMO_AXES, default: "genstudio" },
    variant: { type: String, required: true, enum: ["A", "B"], default: "A" },
    slotIds: [{ type: String, enum: MARKETING_PROMO_SLOTS, required: true }],
    targeting: { type: mongoose.Schema.Types.Mixed, required: true },
    creative: { type: mongoose.Schema.Types.Mixed, required: true },
    period: { type: mongoose.Schema.Types.Mixed, default: {} },
    review: { type: mongoose.Schema.Types.Mixed, required: true },
    createdBy: { type: String, trim: true },
    updatedBy: { type: String, trim: true },
  },
  { timestamps: true, collection: "marketing_promo_creatives" },
);

MarketingPromoCreativeSchema.index({ universeId: 1, status: 1, "period.startsAt": 1, "period.endsAt": 1 });
MarketingPromoCreativeSchema.index({ universeId: 1, slotIds: 1, status: 1, updatedAt: -1 });
