import { Schema, type Document } from "mongoose";

/**
 * @docHint
 * @purpose 사용자/유니버스 단위 OAuth 연결(토큰) 저장 스키마
 * @process provider별 사용자 OAuth 동의로 발급된 access/refresh 토큰을 암호문으로 저장하고 연결 상태를 관리
 * @domain security
 * @scope db_schema
 */

export type OAuthConnectionProvider =
  | "instagram"
  | "threads"
  | "google_analytics"
  | "google_ads";

export type OAuthConnectionStatus =
  | "connected"
  | "selection_required"
  | "reauth_required"
  | "permission_missing"
  | "disconnected";

export interface IOAuthConnectionDocument extends Document {
  ownerType: "user" | "universe";
  ownerId: string; // uid 또는 universeId
  provider: OAuthConnectionProvider;
  providerAccountId: string; // IG user id, GA property, ad account id 등
  displayName?: string;
  accessTokenEnc: string;
  refreshTokenEnc?: string;
  scope: string[];
  tokenType?: string;
  expiresAt?: Date | null;
  refreshTokenExpiresAt?: Date | null;
  connectionStatus: OAuthConnectionStatus;
  isActive: boolean;
  selectedResourceId?: string;
  selectedResourceName?: string;
  selectedResourceType?: string;
  managerResourceId?: string;
  connectedByProviderUserId?: string;
  lastValidatedAt?: Date | null;
  lastValidationError?: string;
  createdBy?: string;
  updatedBy?: string;
  auditEvents?: Array<{
    action: string;
    actor?: string;
    at: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

export const OAuthConnectionSchema = new Schema<IOAuthConnectionDocument>(
  {
    ownerType: { type: String, enum: ["user", "universe"], required: true, index: true },
    ownerId: { type: String, required: true, index: true },
    provider: { type: String, required: true, index: true },
    providerAccountId: { type: String, required: true },
    displayName: { type: String, default: "" },
    accessTokenEnc: { type: String, required: true },
    refreshTokenEnc: { type: String, default: "" },
    scope: { type: [String], default: [] },
    tokenType: { type: String, default: "" },
    expiresAt: { type: Date, default: null, index: true },
    refreshTokenExpiresAt: { type: Date, default: null },
    connectionStatus: {
      type: String,
      enum: ["connected", "selection_required", "reauth_required", "permission_missing", "disconnected"],
      default: "connected",
      index: true,
    },
    isActive: { type: Boolean, default: false, index: true },
    selectedResourceId: { type: String, default: "" },
    selectedResourceName: { type: String, default: "" },
    selectedResourceType: { type: String, default: "" },
    managerResourceId: { type: String, default: "" },
    connectedByProviderUserId: { type: String, default: "" },
    lastValidatedAt: { type: Date, default: null },
    lastValidationError: { type: String, default: "" },
    createdBy: { type: String },
    updatedBy: { type: String },
    auditEvents: {
      type: [
        {
          action: { type: String, required: true },
          actor: { type: String },
          at: { type: Date, required: true },
        },
      ],
      default: [],
      select: false,
    },
  },
  { timestamps: true },
);

// 소유자·provider·계정 단위로 유일 (한 계정이 복수 광고계정을 연결하는 케이스 허용)
OAuthConnectionSchema.index(
  { ownerType: 1, ownerId: 1, provider: 1, providerAccountId: 1 },
  { unique: true },
);
OAuthConnectionSchema.index({ ownerType: 1, ownerId: 1, provider: 1, updatedAt: -1 });
OAuthConnectionSchema.index(
  { ownerType: 1, ownerId: 1, provider: 1, isActive: 1 },
  { unique: true, partialFilterExpression: { isActive: true } },
);
