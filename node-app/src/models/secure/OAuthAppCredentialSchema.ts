import { Schema, type Document } from "mongoose";

/**
 * @docHint
 * @purpose 플랫폼 공용 OAuth 앱 자격증명을 provider별 단일 암호화 문서로 보존
 * @process 통합 관리자 저장 → 서버 resolver 복호화 → OAuth/lifecycle 처리 → 감사 이력 보존
 * @domain security
 * @scope db_schema
 */

export const OAUTH_APP_CREDENTIAL_PROVIDERS = ["instagram", "threads", "google"] as const;
export type OAuthAppCredentialProvider = (typeof OAUTH_APP_CREDENTIAL_PROVIDERS)[number];

export interface IOAuthAppCredentialDocument extends Document {
  provider: OAuthAppCredentialProvider;
  clientIdEnc: string;
  clientSecretEnc: string;
  developerTokenEnc?: string;
  createdBy?: string;
  updatedBy?: string;
  auditEvents?: Array<{
    action: string;
    actor?: string;
    actorIp?: string;
    requestId?: string;
    changedFields?: string[];
    at: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

export const OAuthAppCredentialSchema = new Schema<IOAuthAppCredentialDocument>(
  {
    provider: { type: String, enum: OAUTH_APP_CREDENTIAL_PROVIDERS, required: true, unique: true, index: true },
    clientIdEnc: { type: String, required: true },
    clientSecretEnc: { type: String, required: true },
    developerTokenEnc: { type: String, default: "" },
    createdBy: { type: String },
    updatedBy: { type: String },
    auditEvents: {
      type: [
        {
          action: { type: String, required: true },
          actor: { type: String },
          actorIp: { type: String },
          requestId: { type: String },
          changedFields: [{ type: String }],
          at: { type: Date, required: true },
        },
      ],
      default: [],
      select: false,
    },
  },
  { timestamps: true, collection: "oauth_app_credentials" },
);
