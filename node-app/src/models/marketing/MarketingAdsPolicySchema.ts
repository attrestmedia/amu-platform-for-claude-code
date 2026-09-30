import mongoose, { type HydratedDocument } from "mongoose";

export interface IMarketingAdsPolicy {
  universeId: string;
  executionEnabled: boolean;
  spendCap: { dailyAmount: number; monthlyAmount: number; currency: string };
  allowedLandingDomains: string[];
  advertisingCriteria: {
    objective: "awareness" | "traffic" | "leads" | "sales";
    targetAudience: string;
    offer: string;
    landingPage: string;
    requiredClaims: string[];
    prohibitedClaims: string[];
    requiredDisclosures: string[];
    measurementPlan: string;
    version: number;
  };
  autoStop: { enabled: boolean; maxCpa: number; minRoas: number; noConversionSpend: number; measurementStaleHours: number };
  updatedBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}
export type IMarketingAdsPolicyDocument = HydratedDocument<IMarketingAdsPolicy>;
export const MarketingAdsPolicySchema = new mongoose.Schema<IMarketingAdsPolicy>(
  {
    universeId: { type: String, required: true, unique: true, index: true },
    executionEnabled: { type: Boolean, default: false },
    spendCap: {
      dailyAmount: { type: Number, default: 0, min: 0 },
      monthlyAmount: { type: Number, default: 0, min: 0 },
      currency: { type: String, default: "KRW", trim: true, uppercase: true },
    },
    allowedLandingDomains: { type: [String], default: [] },
    advertisingCriteria: {
      objective: { type: String, enum: ["awareness", "traffic", "leads", "sales"], default: "traffic" },
      targetAudience: { type: String, default: "", maxlength: 1000 },
      offer: { type: String, default: "", maxlength: 1000 },
      landingPage: { type: String, default: "", maxlength: 1000 },
      requiredClaims: { type: [String], default: [] },
      prohibitedClaims: { type: [String], default: [] },
      requiredDisclosures: { type: [String], default: [] },
      measurementPlan: { type: String, default: "", maxlength: 2000 },
      version: { type: Number, default: 0, min: 0 },
    },
    autoStop: {
      enabled: { type: Boolean, default: false },
      maxCpa: { type: Number, default: 0, min: 0 },
      minRoas: { type: Number, default: 0, min: 0 },
      noConversionSpend: { type: Number, default: 0, min: 0 },
      measurementStaleHours: { type: Number, default: 24, min: 1, max: 168 },
    },
    updatedBy: { type: String, trim: true },
  },
  { timestamps: true, collection: "marketing_ads_policies" },
);
