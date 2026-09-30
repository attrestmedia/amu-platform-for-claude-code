import { Schema, type Document } from "mongoose";
import { PLATFORM_CREDENTIAL_ENVIRONMENTS, type PlatformCredentialEnvironment } from "types/secure/platformCredentials";

/**
 * @docHint
 * @purpose 플랫폼 자격증명 변경 이력을 append-only 문서로 저장
 * @process 액션·actor·버전·결과만 기록하고 secret 원문은 저장하지 않음
 * @domain security
 * @scope db_schema
 */

export interface IPlatformCredentialAuditDocument extends Document {
  credentialKey: string;
  environment: PlatformCredentialEnvironment;
  action: "create" | "migrate" | "verify" | "activate" | "disable";
  version?: number;
  previousVersion?: number;
  migrationId?: string;
  actor?: string;
  actorIp?: string;
  requestId?: string;
  result: "success" | "failure";
  code?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const PlatformCredentialAuditSchema = new Schema<IPlatformCredentialAuditDocument>(
  {
    credentialKey: { type: String, required: true, index: true },
    environment: { type: String, enum: PLATFORM_CREDENTIAL_ENVIRONMENTS, required: true, index: true },
    action: { type: String, enum: ["create", "migrate", "verify", "activate", "disable"], required: true },
    version: { type: Number },
    previousVersion: { type: Number },
    migrationId: { type: String, trim: true, immutable: true },
    actor: { type: String },
    actorIp: { type: String },
    requestId: { type: String },
    result: { type: String, enum: ["success", "failure"], required: true },
    code: { type: String },
  },
  { timestamps: true },
);

PlatformCredentialAuditSchema.index({ environment: 1, credentialKey: 1, createdAt: -1 });
PlatformCredentialAuditSchema.index(
  { environment: 1, credentialKey: 1, migrationId: 1 },
  { unique: true, partialFilterExpression: { migrationId: { $exists: true } }, name: "platform_credential_audit_migration_unique" },
);
