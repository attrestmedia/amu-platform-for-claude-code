import { Schema, Document } from "mongoose";

/**
 * @docHint
 * @purpose LinkedIn 개인 프로필 OAuth 토큰 저장 스키마
 * @process universe별 member token 암호문/만료시각/범위 저장
 * @domain security
 * @scope db_schema
 */

export interface ILinkedInMemberTokenDocument extends Document {
  universeId: string;
  memberId: string;
  memberUrn: string;
  displayName?: string;
  accessTokenEnc: string;
  refreshTokenEnc?: string;
  scope: string[];
  expiresAt?: Date | null;
  refreshTokenExpiresAt?: Date | null;
  createdBy?: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const LinkedInMemberTokenSchema = new Schema<ILinkedInMemberTokenDocument>(
  {
    universeId: { type: String, required: true, index: true },
    memberId: { type: String, required: true, index: true },
    memberUrn: { type: String, required: true },
    displayName: { type: String, default: "" },
    accessTokenEnc: { type: String, required: true },
    refreshTokenEnc: { type: String, default: "" },
    scope: { type: [String], default: [] },
    expiresAt: { type: Date, default: null, index: true },
    refreshTokenExpiresAt: { type: Date, default: null },
    createdBy: { type: String },
    updatedBy: { type: String },
  },
  { timestamps: true },
);

LinkedInMemberTokenSchema.index({ universeId: 1, memberId: 1 }, { unique: true });
LinkedInMemberTokenSchema.index({ universeId: 1, updatedAt: -1 });
