import "server-only";

import type { PaymentStatusType } from "types/payment";

export const PAYMENT_TERMINAL_STATUSES = ["canceled", "refunded"] as const;
export type PaymentTerminalStatus = (typeof PAYMENT_TERMINAL_STATUSES)[number];

export const PAYMENT_STATE_TRANSITIONS: Readonly<Record<Exclude<PaymentStatusType, "failed">, readonly PaymentStatusType[]>> = {
  prepared: ["confirming", "confirm_failed", "manual_review"],
  confirming: [
    "confirmed",
    "confirm_failed",
    "tax_reconciliation_failed",
    "wallet_reconciliation_failed",
    "manual_review",
  ],
  confirmed: ["cancel_pending", "refund_pending", "manual_review"],
  confirm_failed: [],
  tax_reconciliation_failed: ["cancel_pending", "manual_review"],
  wallet_reconciliation_failed: ["confirmed", "cancel_pending", "manual_review"],
  cancel_pending: ["canceled", "cancel_failed", "manual_review"],
  canceled: [],
  cancel_failed: ["cancel_pending", "manual_review", "canceled"],
  refund_pending: ["refunded", "refund_failed", "manual_review"],
  refunded: [],
  refund_failed: ["refund_pending", "manual_review", "refunded"],
  manual_review: [
    "confirmed",
    "cancel_pending",
    "canceled",
    "refund_pending",
    "refunded",
    "manual_review",
  ],
};

export function canTransitionPaymentState(from: PaymentStatusType, to: PaymentStatusType): boolean {
  if (from === "failed") return false;
  return PAYMENT_STATE_TRANSITIONS[from].includes(to);
}

export function assertPaymentStateTransition(from: PaymentStatusType, to: PaymentStatusType): void {
  if (!canTransitionPaymentState(from, to)) {
    throw Object.assign(new Error(`결제 상태 전이가 허용되지 않습니다: ${from} → ${to}`), {
      status: 409,
      errorCode: "PAYMENT_STATE_CONFLICT",
    });
  }
}

export function isPaymentTerminalStatus(status: PaymentStatusType): status is PaymentTerminalStatus {
  return (PAYMENT_TERMINAL_STATUSES as readonly string[]).includes(status);
}

export type PaymentOperation = "confirm" | "cancel" | "refund";

export function buildPaymentIdempotencyKey(orderId: string, operation: PaymentOperation, operationId?: string): string {
  const normalizedOrderId = String(orderId || "").trim();
  const normalizedOperationId = String(operationId || "").trim();
  if (!normalizedOrderId || !operation) {
    throw Object.assign(new Error("결제 멱등키 구성값이 없습니다."), { status: 400, errorCode: "PAYMENT_IDEMPOTENCY_CONFLICT" });
  }
  return `payment:${normalizedOrderId}:${operation}:${normalizedOperationId || "default"}`;
}

export type PaymentPublicError = {
  ok: false;
  error: {
    code: string;
    message: string;
    retryable: boolean;
  };
  requestId: string;
  payment?: {
    orderId: string;
    status: PaymentStatusType;
  };
};

export function buildPaymentPublicError(input: {
  code: string;
  message: string;
  retryable: boolean;
  requestId: string;
  orderId?: string;
  status?: PaymentStatusType;
}): PaymentPublicError {
  return {
    ok: false,
    error: { code: input.code, message: input.message, retryable: input.retryable },
    requestId: input.requestId,
    ...(input.orderId && input.status ? { payment: { orderId: input.orderId, status: input.status } } : {}),
  };
}
