import { Schema, type Document } from "mongoose";
import type { CredentialProviderType } from "types/thirdparty/providers";
import { CredentialProviderEnums } from "types/thirdparty/providers";
import type { UnknownRecord } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose MongoDB 스키마 정의
 * @process 주요 필드(universeId, provider, clientIdEnc, clientSecretEnc, createdBy, updatedBy) 및 인덱스/기본값 선언
 * @domain security
 * @scope db_schema
 */

export interface ICredentialDocument extends Document {
  universeId: string;
  provider: CredentialProviderType;
  clientIdEnc: string; // 암호문
  clientSecretEnc: string; // 암호문
  createdBy?: string; // 이메일 등
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
  extras?: UnknownRecord;
}

export const CredentialSchema = new Schema<ICredentialDocument>(
  {
    universeId: { type: String, required: true, index: true },
    provider: { type: String, enum: CredentialProviderEnums, required: true },
    clientIdEnc: { type: String, required: true },
    clientSecretEnc: { type: String, required: true },
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
    extras: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true } // 컬렉션명은 연결 시점에 지정
);

CredentialSchema.index({ universeId: 1, provider: 1 }, { unique: true });
