import { Schema, type Document } from "mongoose";
import type { UserScopeType } from "types/ai";

export const PAYMENT_NOTIFICATION_OUTBOX_STATUSES = ["pending", "processing", "sent", "failed"] as const;
export type PaymentNotificationOutboxStatus = (typeof PAYMENT_NOTIFICATION_OUTBOX_STATUSES)[number];

export interface IPaymentNotificationOutboxDocument extends Document {
  eventId: string;
  messageId: string;
  orderId: string;
  scope: UserScopeType;
  event: "payment.confirmed" | "payment.reconciliation_failed" | "payment.canceled" | "payment.refunded" | "payment.manual_review";
  stateVersion: number;
  status: PaymentNotificationOutboxStatus;
  attempts: number;
  nextAttemptAt?: Date;
  leaseOwner?: string;
  leaseUntil?: Date;
  lastError?: { code: string; retryable: boolean; occurredAt: Date };
  createdAt: Date;
  updatedAt: Date;
}

export const PaymentNotificationOutboxSchema = new Schema<IPaymentNotificationOutboxDocument>(
  {
    eventId: { type: String, required: true, trim: true },
    messageId: { type: String, required: true, trim: true },
    orderId: { type: String, required: true, index: true },
    scope: { type: String, required: true, enum: ["user", "universe"] },
    event: {
      type: String,
      required: true,
      enum: ["payment.confirmed", "payment.reconciliation_failed", "payment.canceled", "payment.refunded", "payment.manual_review"],
    },
    stateVersion: { type: Number, required: true, min: 0 },
    status: { type: String, required: true, enum: PAYMENT_NOTIFICATION_OUTBOX_STATUSES, default: "pending" },
    attempts: { type: Number, required: true, min: 0, default: 0 },
    nextAttemptAt: { type: Date },
    leaseOwner: { type: String },
    leaseUntil: { type: Date },
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
  },
  { collection: "payment_notification_outbox", timestamps: true },
);

PaymentNotificationOutboxSchema.index({ eventId: 1 }, { unique: true, name: "payment_outbox_event_id_unique" });
PaymentNotificationOutboxSchema.index({ messageId: 1 }, { unique: true, name: "payment_outbox_message_id_unique" });
PaymentNotificationOutboxSchema.index(
  { status: 1, nextAttemptAt: 1, leaseUntil: 1, createdAt: 1 },
  { name: "payment_outbox_claim" },
);
