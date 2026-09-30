import { Schema, type Document } from "mongoose";
import type { UserScopeType } from "types/ai";
import type { CoinLotCredit } from "types/payment/coinLots";

export const PAYMENT_OPERATION_TYPES = ["confirm", "cancel", "refund"] as const;
export type PaymentOperationType = (typeof PAYMENT_OPERATION_TYPES)[number];

export const PAYMENT_OPERATION_STATUSES = [
  "pending",
  "processing",
  "retry_wait",
  "succeeded",
  "failed",
  "manual_review",
] as const;
export type PaymentOperationStatus = (typeof PAYMENT_OPERATION_STATUSES)[number];

export const PAYMENT_OPERATION_STAGES = [
  "created",
  "wallet_committed",
  "lot_committed",
  "refund_decided",
  "pg_pending",
  "pg_succeeded",
  "wallet_pending",
  "wallet_succeeded",
  "completed",
  "manual_review",
] as const;
export type PaymentOperationStage = (typeof PAYMENT_OPERATION_STAGES)[number];

export interface IPaymentOperationDocument extends Document {
  operationKey: string;
  idempotencyKey: string;
  orderId: string;
  scope: UserScopeType;
  operation: PaymentOperationType;
  status: PaymentOperationStatus;
  stage: PaymentOperationStage;
  reasonCode?: string;
  coinLotCredits?: CoinLotCredit[];
  attempts: number;
  maxAttempts: number;
  nextAttemptAt?: Date;
  leaseOwner?: string;
  leaseUntil?: Date;
  providerStatus?: string;
  providerSummary?: Record<string, unknown>;
  lastError?: { code: string; retryable: boolean; occurredAt: Date };
  createdAt: Date;
  updatedAt: Date;
}

const PaymentOperationErrorSchema = new Schema(
  {
    code: { type: String, required: true },
    retryable: { type: Boolean, required: true },
    occurredAt: { type: Date, required: true },
  },
  { _id: false },
);

const PaymentOperationCoinLotCreditSchema = new Schema(
  {
    lotId: { type: String, required: true },
    ownerScope: { type: String, required: true, enum: ["user", "universe"] },
    ownerId: { type: String, required: true },
    bucket: {
      type: String,
      required: true,
      enum: ["membership", "purchase_bonus", "promo_bonus", "legacy_unattributed", "paid"],
    },
    coins: { type: Number, required: true, min: 0 },
    remainingCoins: { type: Number, required: true, min: 0 },
    grantedAt: { type: Date, required: true },
    purchasedAt: { type: Date },
    expiresAt: { type: Date },
    orderId: { type: String, required: true },
    status: { type: String, enum: ["active", "exhausted", "expired", "legacy_review"], required: true },
    policyVersion: { type: String, required: true },
    source: {
      type: String,
      required: true,
      enum: ["payment", "membership_grant", "admin_grant", "legacy_migration", "compensation"],
    },
    sourceOperationId: { type: String, required: true },
  },
  { _id: false },
);

export const PaymentOperationSchema = new Schema<IPaymentOperationDocument>(
  {
    operationKey: { type: String, required: true, trim: true },
    idempotencyKey: { type: String, required: true, trim: true },
    orderId: { type: String, required: true, index: true },
    scope: { type: String, required: true, enum: ["user", "universe"] },
    operation: { type: String, required: true, enum: PAYMENT_OPERATION_TYPES },
    status: { type: String, required: true, enum: PAYMENT_OPERATION_STATUSES, default: "pending" },
    stage: { type: String, required: true, enum: PAYMENT_OPERATION_STAGES, default: "created" },
    reasonCode: { type: String },
    coinLotCredits: { type: [PaymentOperationCoinLotCreditSchema], default: undefined, select: false },
    attempts: { type: Number, required: true, min: 0, default: 0 },
    maxAttempts: { type: Number, required: true, min: 1, default: 5 },
    nextAttemptAt: { type: Date },
    leaseOwner: { type: String },
    leaseUntil: { type: Date },
    providerStatus: { type: String },
    providerSummary: { type: Schema.Types.Mixed, select: false },
    lastError: { type: PaymentOperationErrorSchema, default: undefined },
  },
  { collection: "payment_operations", timestamps: true },
);

PaymentOperationSchema.index({ operationKey: 1 }, { unique: true, name: "payment_operation_key_unique" });
PaymentOperationSchema.index({ idempotencyKey: 1 }, { unique: true, name: "payment_operation_idempotency_unique" });
PaymentOperationSchema.index(
  { status: 1, nextAttemptAt: 1, leaseUntil: 1, createdAt: 1 },
  { name: "payment_operation_claim" },
);
