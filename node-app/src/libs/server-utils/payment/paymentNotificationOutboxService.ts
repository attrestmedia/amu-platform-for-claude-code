import "server-only";

import type { Model } from "mongoose";
import type { IPaymentNotificationOutboxDocument } from "models/payment";
import { logger } from "utils/log";
import { buildPaymentNotificationOutboxInput } from "./paymentNotificationContract";

export async function recordPaymentNotificationOutboxOnce(
  model: Model<IPaymentNotificationOutboxDocument>,
  input: {
    eventId: string;
    messageId: string;
    orderId: string;
    scope: "user" | "universe";
    event: IPaymentNotificationOutboxDocument["event"];
    stateVersion: number;
    accepted: boolean;
  },
): Promise<boolean> {
  try {
    const expected = buildPaymentNotificationOutboxInput(input);
    if (expected.eventId !== input.eventId || expected.messageId !== input.messageId) {
      logger.error("[payment-outbox] deterministic message contract mismatch", {
        code: "PAYMENT_NOTIFICATION_ID_MISMATCH",
        orderId: input.orderId,
        event: input.event,
        stateVersion: input.stateVersion,
      });
      return false;
    }
    await model.create({
      ...input,
      status: input.accepted ? "pending" : "failed",
      attempts: 0,
    });
    return true;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === 11000) return false;
    logger.error("[payment-outbox] write failed", { code: "PAYMENT_NOTIFICATION_OUTBOX_WRITE_FAILED" });
    return false;
  }
}
