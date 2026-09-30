import type { PaymentStatusType } from "types/payment";

export type PublicPaymentStatus =
  | "preparing"
  | "processing"
  | "completed"
  | "action_required"
  | "canceled"
  | "refund_processing"
  | "refunded"
  | "failed";

type PaymentStatusRule = {
  publicStatus: PublicPaymentStatus;
  label: string;
  action: "wait" | "contact_support" | "none";
};

export const PAYMENT_STATUS_PUBLIC_RULES: Readonly<Record<PaymentStatusType, PaymentStatusRule>> = {
  prepared: { publicStatus: "preparing", label: "결제 준비 중", action: "wait" },
  confirming: { publicStatus: "processing", label: "결제 처리 중", action: "wait" },
  confirmed: { publicStatus: "completed", label: "결제 완료", action: "none" },
  confirm_failed: { publicStatus: "failed", label: "결제 실패", action: "contact_support" },
  tax_reconciliation_failed: { publicStatus: "processing", label: "결제 확인 중", action: "wait" },
  wallet_reconciliation_failed: { publicStatus: "action_required", label: "지급 확인 중", action: "contact_support" },
  cancel_pending: { publicStatus: "processing", label: "결제 취소 처리 중", action: "wait" },
  canceled: { publicStatus: "canceled", label: "결제 취소 완료", action: "none" },
  cancel_failed: { publicStatus: "action_required", label: "결제 취소 확인 필요", action: "contact_support" },
  refund_pending: { publicStatus: "refund_processing", label: "환불 처리 중", action: "wait" },
  refunded: { publicStatus: "refunded", label: "환불 완료", action: "none" },
  refund_failed: { publicStatus: "action_required", label: "환불 확인 필요", action: "contact_support" },
  manual_review: { publicStatus: "action_required", label: "고객센터 확인 중", action: "contact_support" },
  failed: { publicStatus: "failed", label: "결제 실패", action: "contact_support" },
};

export function buildPublicPaymentStatus(input: {
  orderId: string;
  status: PaymentStatusType;
  stateVersion: number;
  updatedAt: Date | string;
  amount?: number;
  creditedCoins?: number;
}) {
  const orderId = String(input.orderId || "").trim();
  const updatedAt = new Date(input.updatedAt);
  if (!orderId || !Number.isSafeInteger(input.stateVersion) || input.stateVersion < 0 || !Number.isFinite(updatedAt.getTime())) {
    throw new Error("PAYMENT_PUBLIC_STATUS_INVALID");
  }
  if (input.amount !== undefined && (!Number.isSafeInteger(input.amount) || input.amount < 0)) throw new Error("PAYMENT_PUBLIC_AMOUNT_INVALID");
  if (input.creditedCoins !== undefined && (!Number.isSafeInteger(input.creditedCoins) || input.creditedCoins < 0)) throw new Error("PAYMENT_PUBLIC_COINS_INVALID");
  const rule = PAYMENT_STATUS_PUBLIC_RULES[input.status];
  return {
    orderId,
    publicStatus: rule.publicStatus,
    label: rule.label,
    action: rule.action,
    stateVersion: input.stateVersion,
    updatedAt: updatedAt.toISOString(),
    ...(input.amount === undefined ? {} : { amount: input.amount }),
    ...(input.creditedCoins === undefined ? {} : { creditedCoins: input.creditedCoins }),
  };
}

export type PaymentOperationalAlert = {
  severity: "warning" | "critical";
  code: "PAYMENT_MANUAL_REVIEW" | "PAYMENT_OPERATION_STALLED" | "PAYMENT_RETRY_EXHAUSTED";
  status: PaymentStatusType;
  ageMs: number;
};

export function evaluatePaymentOperationalAlert(input: {
  status: PaymentStatusType;
  stateChangedAt: Date | string;
  now?: Date | string;
  attempts?: number;
  maxAttempts?: number;
}): PaymentOperationalAlert | null {
  const changedAt = new Date(input.stateChangedAt);
  const now = input.now ? new Date(input.now) : new Date();
  if (!Number.isFinite(changedAt.getTime()) || !Number.isFinite(now.getTime())) throw new Error("PAYMENT_ALERT_TIME_INVALID");
  const ageMs = Math.max(0, now.getTime() - changedAt.getTime());
  if (input.status === "manual_review" || input.status === "cancel_failed" || input.status === "refund_failed") {
    return { severity: "critical", code: input.status === "manual_review" ? "PAYMENT_MANUAL_REVIEW" : "PAYMENT_RETRY_EXHAUSTED", status: input.status, ageMs };
  }
  const stalled = ["tax_reconciliation_failed", "wallet_reconciliation_failed", "cancel_pending", "refund_pending"].includes(input.status);
  if (input.maxAttempts && (input.attempts || 0) >= input.maxAttempts && stalled) {
    return { severity: "critical", code: "PAYMENT_RETRY_EXHAUSTED", status: input.status, ageMs };
  }
  if (stalled && ageMs >= 5 * 60 * 1000) {
    return { severity: "warning", code: "PAYMENT_OPERATION_STALLED", status: input.status, ageMs };
  }
  return null;
}

export type PaymentReconciliationInput = {
  orderId: string;
  status: PaymentStatusType;
  pgStatus: "approved" | "canceled" | "refunded" | "unknown";
  walletApplied: boolean;
  notificationQueued: boolean;
};

export function buildPaymentReconciliationReport(rows: readonly PaymentReconciliationInput[]) {
  const mismatches = rows.flatMap((row) => {
    const issues: string[] = [];
    if (row.status === "confirmed" && (!row.walletApplied || row.pgStatus !== "approved")) issues.push("PAYMENT_CONFIRMED_NOT_CONVERGED");
    if (row.status === "canceled" && row.pgStatus !== "canceled") issues.push("PAYMENT_CANCELED_PG_MISMATCH");
    if (row.status === "refunded" && row.pgStatus !== "refunded") issues.push("PAYMENT_REFUNDED_PG_MISMATCH");
    if (["confirmed", "canceled", "refunded", "manual_review"].includes(row.status) && !row.notificationQueued) issues.push("PAYMENT_NOTIFICATION_MISSING");
    return issues.map((code) => ({ orderId: row.orderId, code }));
  });
  return {
    checked: rows.length,
    mismatchCount: mismatches.length,
    passed: mismatches.length === 0,
    mismatches: mismatches.sort((a, b) => a.orderId.localeCompare(b.orderId) || a.code.localeCompare(b.code)),
  };
}
