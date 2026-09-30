import { Schema, type Document } from "mongoose";
import type { BillableProviderType } from "types/ai";
import { BILLABLE_PROVIDER_TYPES } from "consts/ai";
import type { UnknownRecord } from "utils/common/typeUtils";
import type {
  CoinUsageActivity,
  CoinUsageEntryType,
  CoinUsagePurpose,
  CoinUsageRecordState,
  CoinUsageSource,
} from "types/payment";

/**
 * @docHint
 * @purpose MongoDB 스키마 정의
 * @process 주요 필드(uid, universeId, app, provider, modelName, billingKey) 및 인덱스/기본값 선언
 * @domain billing
 * @scope db_schema
 */

export interface ICoinUsageDocument extends Document {
  uid: string; // 사용자 아아디
  universeId?: string; // 유니버스 아이디
  app: string; // 'npc_chat' | 'commerce_ai' | 'summarizer' 등
  provider: BillableProviderType;
  modelName: string; // 원본 모델명
  billingKey: string; // 정규화된 키
  coins: number; // 차감된 총 코인
  breakdown: UnknownRecord; // 계산 상세
  usage?: UnknownRecord; // 원본 usage
  fixed?: UnknownRecord; // 원본 fixed
  meta?: UnknownRecord; // personaId, route 등
  activity?: CoinUsageActivity;
  purpose?: CoinUsagePurpose;
  source?: CoinUsageSource;
  attributionVersion?: number;
  operationId?: string;
  entryType?: CoinUsageEntryType;
  state?: CoinUsageRecordState;
  walletAppliedAt?: Date;
  finalizedAt?: Date;
  lastError?: string;
  createdAt: Date;
  updatedAt?: Date;
}

export const CoinUsageSchema = new Schema<ICoinUsageDocument>(
  {
    uid: { type: String, index: true, required: true },
    universeId: { type: String, index: true },
    app: { type: String, required: true },
    provider: { type: String, enum: BILLABLE_PROVIDER_TYPES, required: true },
    modelName: { type: String, required: true },
    billingKey: { type: String, required: true },
    coins: { type: Number, required: true },
    breakdown: { type: Schema.Types.Mixed },
    usage: { type: Schema.Types.Mixed },
    fixed: { type: Schema.Types.Mixed },
    meta: { type: Schema.Types.Mixed },
    activity: { type: String, index: true },
    purpose: { type: String, index: true },
    source: { type: String, index: true },
    attributionVersion: { type: Number, default: 1 },
    operationId: { type: String },
    entryType: { type: String, enum: ["deduction", "refund", "compensation", "zero"] },
    state: {
      type: String,
      enum: ["prepared", "applied", "failed", "compensated", "reconciliation_required", "unknown_outcome"],
      index: true,
    },
    walletAppliedAt: { type: Date },
    finalizedAt: { type: Date },
    lastError: { type: String },
  },
  { timestamps: true, collection: "coin_usages" }
);

CoinUsageSchema.index({ uid: 1, createdAt: -1 });
CoinUsageSchema.index({ uid: 1, purpose: 1, createdAt: -1 });
CoinUsageSchema.index({ universeId: 1, createdAt: -1 });
CoinUsageSchema.index(
  { uid: 1, operationId: 1, entryType: 1 },
  {
    unique: true,
    partialFilterExpression: {
      operationId: { $type: "string" },
      entryType: { $type: "string" },
    },
  },
);
