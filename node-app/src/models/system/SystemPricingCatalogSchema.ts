import { Schema, Document } from "mongoose";

export interface ISystemPricingCatalogDocument extends Document {
  billingKey: string;
  provider: string;
  modelName: string;
  variant?: string;
  modality?: "text" | "audio" | "image" | "video";
  tokensPerCoin?: {
    input: number;
    output: number;
  } | null;
  fixedCost?: {
    perSecond?: number;
    perMinute?: number;
    perImage?: number;
    perVideo?: number;
    perThousandCharacters?: number;
    perCredit?: number;
  } | null;
  effectiveFrom?: Date | null;
  effectiveTo?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const PricingTokenPerCoinSchema = new Schema(
  {
    input: { type: Number, default: 0, min: 0 },
    output: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const PricingFixedCostSchema = new Schema(
  {
    perSecond: { type: Number, min: 0 },
    perMinute: { type: Number, min: 0 },
    perImage: { type: Number, min: 0 },
    perVideo: { type: Number, min: 0 },
    // EL-203 — speech 문자/크레딧 과금 단위
    perThousandCharacters: { type: Number, min: 0 },
    perCredit: { type: Number, min: 0 },
  },
  { _id: false },
);

export const SystemPricingCatalogSchema = new Schema<ISystemPricingCatalogDocument>(
  {
    billingKey: { type: String, required: true, unique: true, index: true, trim: true },
    provider: { type: String, required: true, index: true, trim: true, lowercase: true },
    modelName: { type: String, required: true, index: true, trim: true },
    variant: { type: String, default: "", trim: true },
    modality: { type: String, enum: ["text", "audio", "image", "video"], default: undefined, index: true },
    tokensPerCoin: { type: PricingTokenPerCoinSchema, default: null },
    fixedCost: { type: PricingFixedCostSchema, default: null },
    effectiveFrom: { type: Date, default: null, index: true },
    effectiveTo: { type: Date, default: null, index: true },
  },
  { timestamps: true },
);
