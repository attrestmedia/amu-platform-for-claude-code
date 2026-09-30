import { Schema, type Document } from "mongoose";

export interface ISignupBonusCampaignDocument extends Document {
  campaignId: string;
  grantedCount: number;
  maxRecipients: number;
  coinsPerGrant: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ISignupBonusGrantDocument extends Document {
  campaignId: string;
  uid: string;
  sequence: number;
  coins: number;
  appliedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const SignupBonusCampaignSchema = new Schema<ISignupBonusCampaignDocument>(
  {
    campaignId: { type: String, required: true, unique: true, index: true },
    grantedCount: { type: Number, required: true, default: 0, min: 0 },
    maxRecipients: { type: Number, required: true, min: 1 },
    coinsPerGrant: { type: Number, required: true, min: 1 },
  },
  { timestamps: true, collection: "signup_bonus_campaigns" },
);

export const SignupBonusGrantSchema = new Schema<ISignupBonusGrantDocument>(
  {
    campaignId: { type: String, required: true, index: true },
    uid: { type: String, required: true, index: true },
    sequence: { type: Number, required: true, min: 1 },
    coins: { type: Number, required: true, min: 1 },
    appliedAt: { type: Date, required: true },
  },
  { timestamps: true, collection: "signup_bonus_grants" },
);

SignupBonusGrantSchema.index({ campaignId: 1, uid: 1 }, { unique: true });
SignupBonusGrantSchema.index({ campaignId: 1, sequence: 1 }, { unique: true });
