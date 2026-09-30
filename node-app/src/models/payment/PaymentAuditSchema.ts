import { Schema, type Document } from "mongoose";
import type { UserScopeType } from "types/ai";
import type { PaymentStatusType } from "types/payment";
import { PAYMENT_STATUS_TYPES } from "consts/payment";

export interface IPaymentAuditDocument extends Document {
  eventId: string;
  orderId: string;
  scope: UserScopeType;
  stateVersion: number;
  fromStatus?: PaymentStatusType;
  toStatus: PaymentStatusType;
  operation: "confirm" | "cancel" | "refund" | "reconcile" | "manual_review";
  reasonCode?: string;
  requestId?: string;
  safeSummary?: {
    totalAmount?: number;
    suppliedAmount?: number;
    vat?: number;
    taxFreeAmount?: number;
    balanceAmount?: number;
  };
  createdAt: Date;
}

const SafeSummarySchema = new Schema<NonNullable<IPaymentAuditDocument["safeSummary"]>>(
  {
    totalAmount: { type: Number },
    suppliedAmount: { type: Number },
    vat: { type: Number },
    taxFreeAmount: { type: Number },
    balanceAmount: { type: Number },
  },
  { _id: false },
);

export const PaymentAuditSchema = new Schema<IPaymentAuditDocument>(
  {
    eventId: { type: String, required: true, trim: true },
    orderId: { type: String, required: true, index: true },
    scope: { type: String, required: true, enum: ["user", "universe"] },
    stateVersion: { type: Number, required: true, min: 0 },
    fromStatus: { type: String, enum: PAYMENT_STATUS_TYPES },
    toStatus: { type: String, required: true, enum: PAYMENT_STATUS_TYPES },
    operation: { type: String, required: true, enum: ["confirm", "cancel", "refund", "reconcile", "manual_review"] },
    reasonCode: { type: String },
    requestId: { type: String, select: false },
    safeSummary: { type: SafeSummarySchema, default: undefined },
    createdAt: { type: Date, required: true, default: () => new Date() },
  },
  { collection: "payment_audits", timestamps: false },
);

PaymentAuditSchema.index({ eventId: 1 }, { unique: true, name: "payment_audit_event_id_unique" });
PaymentAuditSchema.index({ orderId: 1, stateVersion: 1 }, { unique: true, name: "payment_audit_order_state_unique" });
PaymentAuditSchema.index({ createdAt: -1 }, { name: "payment_audit_created_at" });
