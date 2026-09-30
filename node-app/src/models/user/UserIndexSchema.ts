import mongoose, { Schema } from "mongoose";
import type { UserAccountType } from "consts/auth";
import type { EmailVerificationMethod } from "consts/auth";
import type { AccountStatus, AccountPolicyId, PolicyConsentMethod } from "consts/legal/accountPolicy";
import type { VoicePurposeConsentRecord } from "consts/legal/voiceDataConsent";
import { QWEN_MODEL_STUDIO_CONSENT_PURPOSE_IDS, VOICE_DATA_CONSENT_PURPOSE_ID } from "consts/legal/voiceDataConsent";

/**
 * @docHint
 * @purpose MongoDB 스키마 정의
 * @process 주요 필드(uid, userEmail, userEmailLower, accountType, provider, providerAccountId) 및 인덱스/기본값 선언
 * @domain user
 * @scope db_schema
 */

export interface IUserIndexDocument extends mongoose.Document {
  uid: string;
  userEmail: string;
  userEmailLower: string;
  accountType?: UserAccountType;
  accountStatus?: AccountStatus;
  deletionRequestedAt?: Date;
  identityHash?: string;
  policyConsents?: Array<{
    policyId: AccountPolicyId;
    version: string;
    agreedAt: Date;
    method: PolicyConsentMethod;
    provider?: string;
  }>;
  purposeConsents?: VoicePurposeConsentRecord[];
  providers?: Array<{
    provider: string;
    providerAccountId: string;
    uid: string;
    linkedAt: Date;
  }>;
  userInfo?: { name?: string; profileImageUrl?: string };
  /** 이메일 소유권 인증의 read projection. 정본은 WordPress user meta `_amu_email_verified`다. */
  emailVerification?: {
    verifiedEmailLower?: string;
    verifiedAt?: Date;
    method?: EmailVerificationMethod;
  };
  createdAt: Date;
  updatedAt: Date;
}

export const UserIndexSchema = new Schema<IUserIndexDocument>(
  {
    uid: { type: String, required: true, index: true },
    userEmail: { type: String, required: true },
    userEmailLower: { type: String, required: true, unique: true },
    accountType: { type: String },
    accountStatus: {
      type: String,
      enum: ["active", "deletion_pending", "deleted"],
      default: "active",
      index: true,
    },
    deletionRequestedAt: { type: Date },
    identityHash: { type: String, sparse: true, index: true },
    policyConsents: [
      new Schema(
        {
          policyId: { type: String, enum: ["terms", "privacy"], required: true },
          version: { type: String, required: true },
          agreedAt: { type: Date, required: true },
          method: {
            type: String,
            enum: [
              "magazine_signup",
              "magazine_social_signup",
              "platform_email_signup",
              "platform_social_signup",
              "policy_reconsent",
            ],
            required: true,
          },
          provider: { type: String },
        },
        { _id: false },
      ),
    ],
    purposeConsents: [
      new Schema(
        {
          purposeId: { type: String, enum: [VOICE_DATA_CONSENT_PURPOSE_ID, ...QWEN_MODEL_STUDIO_CONSENT_PURPOSE_IDS], required: true },
          version: { type: String, required: true },
          linkedPrivacyVersion: { type: String },
          agreedAt: { type: Date, required: true },
          method: {
            type: String,
            enum: ["purpose_consent", "purpose_reconsent"],
            required: true,
          },
          revokedAt: { type: Date },
        },
        { _id: false },
      ),
    ],
    providers: [
      new Schema(
        {
          provider: { type: String, required: true },
          providerAccountId: { type: String, required: true },
          uid: { type: String, required: true },
          linkedAt: { type: Date, default: Date.now },
        },
        { _id: false }
      ),
    ],
    userInfo: {
      name: { type: String },
      profileImageUrl: { type: String, default: "" },
    },
    emailVerification: {
      verifiedEmailLower: { type: String },
      verifiedAt: { type: Date },
      method: { type: String, enum: ["email_link", "google", "apple", "password_reset", "admin"] },
    },
  },
  {
    timestamps: true,
    strict: true, // 인덱스 컬렉션에는 불필요한 필드 저장하지 않음
  }
);
