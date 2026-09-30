import type { UserScopeType } from "types/ai";

export const PAYMENT_NOTIFICATION_EVENTS = [
  "payment.confirmed",
  "payment.reconciliation_failed",
  "payment.canceled",
  "payment.refunded",
  "payment.manual_review",
] as const;

export type PaymentNotificationEvent = (typeof PAYMENT_NOTIFICATION_EVENTS)[number];
export type PaymentNotificationTemplateKey = PaymentNotificationEvent;

export function buildPaymentNotificationMessageId(input: {
  orderId: string;
  event: PaymentNotificationEvent;
  stateVersion: number;
}) {
  const orderId = String(input.orderId || "").trim();
  const stateVersion = Number(input.stateVersion);
  if (!orderId || !PAYMENT_NOTIFICATION_EVENTS.includes(input.event) || !Number.isSafeInteger(stateVersion) || stateVersion < 0) {
    throw new Error("PAYMENT_NOTIFICATION_ID_INVALID");
  }
  return `payment:${orderId}:${input.event}:${stateVersion}`;
}

export function buildPaymentNotificationOutboxInput(input: {
  orderId: string;
  scope: UserScopeType;
  event: PaymentNotificationEvent;
  stateVersion: number;
}) {
  const messageId = buildPaymentNotificationMessageId(input);
  return {
    eventId: messageId,
    messageId,
    orderId: String(input.orderId).trim(),
    scope: input.scope,
    event: input.event,
    stateVersion: input.stateVersion,
  };
}

export type PaymentCustomerNotificationInput = {
  orderId: string;
  scope: UserScopeType;
  event: PaymentNotificationEvent;
  stateVersion: number;
  occurredAt: Date | string;
  amount?: number;
  recipientEmail: string;
  supportUrl: string;
  locale?: "ko" | "en";
};

export function buildPaymentCustomerNotificationContract(input: PaymentCustomerNotificationInput) {
  const orderId = String(input.orderId || "").trim();
  const recipientEmail = String(input.recipientEmail || "").trim();
  const supportUrl = String(input.supportUrl || "").trim();
  const occurredAt = new Date(input.occurredAt);
  if (!orderId || !recipientEmail || !supportUrl || !Number.isFinite(occurredAt.getTime())) {
    throw new Error("PAYMENT_NOTIFICATION_PUBLIC_PAYLOAD_INVALID");
  }
  if (input.amount !== undefined && (!Number.isSafeInteger(input.amount) || input.amount < 0)) {
    throw new Error("PAYMENT_NOTIFICATION_AMOUNT_INVALID");
  }
  if ((input.event === "payment.canceled" || input.event === "payment.refunded") && input.amount === undefined) {
    throw new Error("PAYMENT_NOTIFICATION_AMOUNT_REQUIRED");
  }
  return {
    messageId: buildPaymentNotificationMessageId(input),
    category: "transactional" as const,
    templateKey: input.event,
    locale: input.locale || "ko",
    recipientEmail,
    publicPayload: {
      orderId,
      scope: input.scope,
      event: input.event,
      stateVersion: input.stateVersion,
      occurredAt: occurredAt.toISOString(),
      ...(input.amount === undefined ? {} : { amount: input.amount }),
    },
  };
}

export function assertPaymentNotificationSafeSummary(value: Record<string, unknown>) {
  const forbidden = ["paymentKey", "recipientEmail", "email", "raw", "response", "uid", "universeId"];
  const leaked = forbidden.find((key) => key in value);
  if (leaked) throw new Error(`PAYMENT_NOTIFICATION_SENSITIVE_FIELD:${leaked}`);
  return value;
}
