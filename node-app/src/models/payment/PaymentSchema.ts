import { Schema, type Document, type Model, model, models } from "mongoose";
import type { UserScopeType } from "types/ai";
import type { UserPurposeType, PaymentStatusType } from "types/payment";
import { USER_SCOPE_TYPES } from "consts/ai";
import { USER_PURPOSE_TYPES, PAYMENT_STATUS_TYPES } from "consts/payment";
import type { UnknownRecord } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose MongoDB 스키마 정의
 * @process 주요 필드(scope, orderId, amount, currency, status, paymentKey) 및 인덱스/기본값 선언
 * @domain payment
 * @scope db_schema
 */

export interface IPaymentBaseDocument extends Document {
  scope: UserScopeType;
  orderId: string;
  amount: number;
  suppliedAmount?: number;
  vat?: number;
  taxFreeAmount?: number;
  taxTreatment?: "vat_at_charge" | "vat_at_redemption" | "non_taxable_charge";
  taxPolicyVersion?: string;
  paidCoins?: number;
  bonusCoins?: number;
  policyVersion?: string;
  policyAcceptedAt?: Date;
  currency: "KRW";
  status: PaymentStatusType;
  /** PG credential is internal-only and must never be returned in an API envelope or log. */
  paymentKey?: string;
  /** Legacy raw response is read-only compatibility data; new writes use pgSummary. */
  raw?: UnknownRecord;
  pgSummary?: {
    status?: string;
    method?: string;
    totalAmount?: number;
    suppliedAmount?: number;
    vat?: number;
    taxFreeAmount?: number;
    balanceAmount?: number;
    transactionKeyHash?: string;
    observedAt?: Date;
  };
  reconciliation?: {
    status: "pending" | "passed" | "failed";
    code?: string;
    reason?: string;
    expected?: UnknownRecord;
    actual?: UnknownRecord;
    checkedAt?: Date;
  };
  stateVersion?: number;
  confirmAttempts?: number;
  cancelAttempts?: number;
  refundAttempts?: number;
  leaseOperation?: "confirm" | "cancel" | "refund";
  leaseOwner?: string;
  leaseUntil?: Date;
  nextAttemptAt?: Date;
  lastError?: {
    code: string;
    retryable: boolean;
    occurredAt: Date;
  };
  stateChangedAt?: Date;
  applied?: boolean;
  appliedAt?: Date;
  applying?: boolean;
  applyingAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const PaymentBaseSchema = new Schema<IPaymentBaseDocument>(
  {
    scope: { type: String, enum: USER_SCOPE_TYPES, required: true },
    orderId: { type: String, index: true, unique: true },
    amount: { type: Number, required: true },
    suppliedAmount: { type: Number },
    vat: { type: Number },
    taxFreeAmount: { type: Number },
    taxTreatment: { type: String, enum: ["vat_at_charge", "vat_at_redemption", "non_taxable_charge"] },
    taxPolicyVersion: { type: String },
    paidCoins: { type: Number },
    bonusCoins: { type: Number },
    policyVersion: { type: String },
    policyAcceptedAt: { type: Date },
    currency: { type: String, default: "KRW" },
    status: { type: String, enum: PAYMENT_STATUS_TYPES, default: "prepared" },
    paymentKey: { type: String, select: false },
    raw: { type: Schema.Types.Mixed, select: false },
    pgSummary: {
      type: new Schema(
        {
          status: { type: String },
          method: { type: String },
          totalAmount: { type: Number },
          suppliedAmount: { type: Number },
          vat: { type: Number },
          taxFreeAmount: { type: Number },
          balanceAmount: { type: Number },
          transactionKeyHash: { type: String },
          observedAt: { type: Date },
        },
        { _id: false },
      ),
      default: undefined,
      select: false,
    },
    reconciliation: {
      type: new Schema(
        {
          status: { type: String, enum: ["pending", "passed", "failed"] },
          code: { type: String },
          reason: { type: String },
          expected: { type: Schema.Types.Mixed },
          actual: { type: Schema.Types.Mixed },
          checkedAt: { type: Date },
        },
        { _id: false },
      ),
      default: undefined,
      select: false,
    },
    stateVersion: { type: Number, required: true, default: 0, min: 0 },
    confirmAttempts: { type: Number, required: true, default: 0, min: 0 },
    cancelAttempts: { type: Number, required: true, default: 0, min: 0 },
    refundAttempts: { type: Number, required: true, default: 0, min: 0 },
    leaseOperation: { type: String, enum: ["confirm", "cancel", "refund"] },
    leaseOwner: { type: String },
    leaseUntil: { type: Date },
    nextAttemptAt: { type: Date },
    lastError: {
      type: new Schema(
        {
          code: { type: String, required: true },
          retryable: { type: Boolean, required: true },
          occurredAt: { type: Date, required: true },
        },
        { _id: false },
      ),
      default: undefined,
    },
    stateChangedAt: { type: Date },
    applied: { type: Boolean, default: false },
    appliedAt: { type: Date },
    applying: { type: Boolean, default: false },
    applyingAt: { type: Date },
  },
  { timestamps: true, collection: "payments", discriminatorKey: "scope" }
);
PaymentBaseSchema.index({ status: 1, applied: 1 });
PaymentBaseSchema.index({ orderId: 1, applied: 1, applying: 1, applyingAt: 1 });
PaymentBaseSchema.index({ status: 1, leaseUntil: 1, stateChangedAt: 1 });

export const PaymentBaseModel = models.PaymentBase || model<IPaymentBaseDocument>("PaymentBase", PaymentBaseSchema);

// 유저 결제
export interface IUserPaymentDocument extends IPaymentBaseDocument {
  scope: "user";
  uid: string;
  purpose: UserPurposeType;
  stageCount?: number;
  packAmount?: number;
  customAmount?: number;
}
const UserPaymentSchema = new Schema<IUserPaymentDocument>({
  uid: { type: String, index: true, required: true },
  purpose: { type: String, enum: USER_PURPOSE_TYPES, required: true },
  stageCount: { type: Number },
  packAmount: { type: Number },
  customAmount: { type: Number },
});
UserPaymentSchema.index({ uid: 1, status: 1, applied: 1 });

export const UserPaymentModel =
  (PaymentBaseModel.discriminators?.user as Model<IUserPaymentDocument> | undefined) ||
  PaymentBaseModel.discriminator<IUserPaymentDocument>("user", UserPaymentSchema);

// 커머스
export interface IUniversePaymentDocument extends IPaymentBaseDocument {
  scope: "universe";
  universeId: string;
  adminUid: string; // 결제/충전 수행자(어드민/에디터)
  purpose: UserPurposeType; // 확장 대비, 기본은 coin_pack
  packAmount?: number;
  customAmount?: number;
  stageCount?: number; // 유니버스 구독 옵션
  creditedCoins?: number;
  periodStartsAt?: Date;
  periodEndsAt?: Date;
  renewableAt?: Date;
  renewalMode?: "immediate" | "scheduled";
}
const UniversePaymentSchema = new Schema<IUniversePaymentDocument>({
  universeId: { type: String, index: true, required: true },
  adminUid: { type: String, index: true, required: true },
  purpose: { type: String, enum: USER_PURPOSE_TYPES, default: "coin_pack" },
  packAmount: { type: Number },
  customAmount: { type: Number },
  stageCount: { type: Number },
  creditedCoins: { type: Number },
  periodStartsAt: { type: Date },
  periodEndsAt: { type: Date },
  renewableAt: { type: Date },
  renewalMode: { type: String, enum: ["immediate", "scheduled"] },
});
UniversePaymentSchema.index({ universeId: 1, status: 1, applied: 1 });

export const UniversePaymentModel =
  (PaymentBaseModel.discriminators?.universe as Model<IUniversePaymentDocument> | undefined) ||
  PaymentBaseModel.discriminator<IUniversePaymentDocument>("universe", UniversePaymentSchema);
export const PaymentSchema = UserPaymentSchema;
