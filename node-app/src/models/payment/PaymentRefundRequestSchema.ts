import { Schema, type Document } from "mongoose";
import type { UserScopeType } from "types/ai";

export const PAYMENT_REFUND_REQUEST_STATUSES = [
  "requested",
  "manual_review",
  "approved",
  "rejected",
  "pg_pending",
  "pg_succeeded",
  "wallet_pending",
  "refunded",
  "failed",
] as const;
export type PaymentRefundRequestStatus = (typeof PAYMENT_REFUND_REQUEST_STATUSES)[number];

export interface IPaymentRefundRequestDocument extends Document {
  requestId: string;
  operationId: string;
  idempotencyKey: string;
  orderId: string;
  scope: UserScopeType;
  requesterUid: string;
  status: PaymentRefundRequestStatus;
  reasonCode: string;
  approvedByUid?: string;
  approvedAt?: Date;
  pgCompletedAt?: Date;
  walletCompletedAt?: Date;
  refundAmount?: number;
  refundablePaidCoins: number;
  reclaimBonusCoins: number;
  lotIds?: string[];
  reservedLots?: Array<{ lotId: string; bucket: string; coins: number; remainingCoins: number }>;
  reservationState: "reserved" | "pg_succeeded" | "released" | "refunded" | "not_required";
  stateVersion: number;
  leaseOwner?: string;
  leaseUntil?: Date;
  lastError?: { code: string; retryable: boolean; occurredAt: Date };
  createdAt: Date;
  updatedAt: Date;
}

const PaymentRefundErrorSchema = new Schema(
  {
    code: { type: String, required: true },
    retryable: { type: Boolean, required: true },
    occurredAt: { type: Date, required: true },
  },
  { _id: false },
);

export const PaymentRefundRequestSchema = new Schema<IPaymentRefundRequestDocument>(
  {
    requestId: { type: String, required: true, trim: true },
    operationId: { type: String, required: true, trim: true },
    idempotencyKey: { type: String, required: true, trim: true },
    orderId: { type: String, required: true, trim: true },
    scope: { type: String, required: true, enum: ["user", "universe"] },
    requesterUid: { type: String, required: true, select: false },
    status: { type: String, required: true, enum: PAYMENT_REFUND_REQUEST_STATUSES, default: "requested" },
    reasonCode: { type: String, required: true },
    approvedByUid: { type: String, select: false },
    approvedAt: { type: Date },
    pgCompletedAt: { type: Date },
    walletCompletedAt: { type: Date },
    refundAmount: { type: Number, min: 0 },
    refundablePaidCoins: { type: Number, required: true, min: 0 },
    reclaimBonusCoins: { type: Number, required: true, min: 0 },
    lotIds: { type: [String], default: undefined, select: false },
    reservedLots: {
      type: [new Schema(
        {
          lotId: { type: String, required: true },
          bucket: { type: String, required: true },
          coins: { type: Number, required: true, min: 0 },
          remainingCoins: { type: Number, required: true, min: 0 },
        },
        { _id: false },
      )],
      default: undefined,
      select: false,
    },
    reservationState: {
      type: String,
      required: true,
      enum: ["reserved", "pg_succeeded", "released", "refunded", "not_required"],
      default: "not_required",
    },
    stateVersion: { type: Number, required: true, min: 0, default: 0 },
    leaseOwner: { type: String },
    leaseUntil: { type: Date },
    lastError: { type: PaymentRefundErrorSchema, default: undefined },
  },
  { collection: "payment_refund_requests", timestamps: true },
);

PaymentRefundRequestSchema.index({ requestId: 1 }, { unique: true, name: "payment_refund_request_id_unique" });
PaymentRefundRequestSchema.index({ operationId: 1 }, { unique: true, name: "payment_refund_operation_id_unique" });
PaymentRefundRequestSchema.index({ idempotencyKey: 1 }, { unique: true, name: "payment_refund_idempotency_unique" });
PaymentRefundRequestSchema.index(
  { status: 1, leaseUntil: 1, updatedAt: 1 },
  { name: "payment_refund_claim" },
);
