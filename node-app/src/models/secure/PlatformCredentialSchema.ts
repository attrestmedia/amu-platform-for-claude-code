import { Schema, type Document } from "mongoose";
import {
  PLATFORM_CREDENTIAL_CATEGORIES,
  PLATFORM_CREDENTIAL_ENVIRONMENTS,
  PLATFORM_CREDENTIAL_STATUSES,
  PLATFORM_CREDENTIAL_VERIFICATION_STATUSES,
  type PlatformCredentialCategory,
  type PlatformCredentialEnvironment,
  type PlatformCredentialStatus,
  type PlatformCredentialVerificationStatus,
} from "types/secure/platformCredentials";

/**
 * @docHint
 * @purpose 플랫폼 전역 자격증명의 암호화 버전과 활성 상태 저장
 * @process credentialKey/environment/version별 암호문과 검증·활성 상태 선언
 * @domain security
 * @scope db_schema
 */

export interface IPlatformCredentialDocument extends Document {
  credentialKey: string;
  environment: PlatformCredentialEnvironment;
  category: PlatformCredentialCategory;
  provider: string;
  encryptedPayload: string;
  configuredFields: string[];
  schemaVersion: number;
  encryptionKeyVersion: string;
  version: number;
  migrationId?: string;
  migrationClaimId?: string;
  migratedFromVersion?: number;
  status: PlatformCredentialStatus;
  lastVerificationStatus: PlatformCredentialVerificationStatus;
  lastVerificationCode?: string;
  lastVerifiedAt?: Date;
  activatedAt?: Date;
  disabledAt?: Date;
  createdBy?: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const PlatformCredentialSchema = new Schema<IPlatformCredentialDocument>(
  {
    credentialKey: { type: String, required: true, index: true },
    environment: { type: String, enum: PLATFORM_CREDENTIAL_ENVIRONMENTS, required: true, index: true },
    category: { type: String, enum: PLATFORM_CREDENTIAL_CATEGORIES, required: true },
    provider: { type: String, required: true },
    encryptedPayload: { type: String, required: true, select: false },
    configuredFields: [{ type: String, required: true }],
    schemaVersion: { type: Number, required: true, default: 1 },
    encryptionKeyVersion: { type: String, required: true, default: "v1" },
    version: { type: Number, required: true, min: 1 },
    migrationId: { type: String, trim: true, immutable: true },
    migrationClaimId: { type: String, trim: true },
    migratedFromVersion: { type: Number, min: 1, immutable: true },
    status: { type: String, enum: PLATFORM_CREDENTIAL_STATUSES, required: true, default: "pending" },
    lastVerificationStatus: {
      type: String,
      enum: PLATFORM_CREDENTIAL_VERIFICATION_STATUSES,
      required: true,
      default: "unverified",
    },
    lastVerificationCode: { type: String },
    lastVerifiedAt: { type: Date },
    activatedAt: { type: Date },
    disabledAt: { type: Date },
    createdBy: { type: String },
    updatedBy: { type: String },
  },
  { timestamps: true },
);

PlatformCredentialSchema.index({ environment: 1, credentialKey: 1, version: 1 }, { unique: true });
PlatformCredentialSchema.index(
  { environment: 1, credentialKey: 1, migrationId: 1 },
  { unique: true, partialFilterExpression: { migrationId: { $exists: true } }, name: "platform_credential_migration_unique" },
);
PlatformCredentialSchema.index(
  { environment: 1, credentialKey: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: "active" } },
);
