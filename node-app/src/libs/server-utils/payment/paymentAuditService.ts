import "server-only";

import type { Model } from "mongoose";
import type { IPaymentAuditDocument } from "models/payment";
import type { PaymentStatusType } from "types/payment";
import { logger } from "utils/log";

export function buildPaymentAuditEventId(input: { orderId: string; stateVersion: number; toStatus: PaymentStatusType }): string {
  return `payment:${String(input.orderId).trim()}:state:${Math.max(0, Math.floor(input.stateVersion))}:${input.toStatus}`;
}

export async function recordPaymentAuditOnce(
  model: Model<IPaymentAuditDocument>,
  input: {
    eventId?: string;
    orderId: string;
    scope: "user" | "universe";
    stateVersion: number;
    fromStatus?: PaymentStatusType;
    toStatus: PaymentStatusType;
    operation: "confirm" | "cancel" | "refund" | "reconcile" | "manual_review";
    reasonCode?: string;
    requestId?: string;
    safeSummary?: IPaymentAuditDocument["safeSummary"];
  },
): Promise<boolean> {
  try {
    await model.create({
      ...input,
      eventId: input.eventId || buildPaymentAuditEventId(input),
      createdAt: new Date(),
    });
    return true;
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error && error.code === 11000
      ? "PAYMENT_AUDIT_DUPLICATE"
      : "PAYMENT_AUDIT_WRITE_FAILED";
    if (code !== "PAYMENT_AUDIT_DUPLICATE") logger.error("[payment-audit] write failed", { code });
    return false;
  }
}
