export const USER_PURPOSE_TYPES = ["subscription", "coin_pack"] as const;
export const PAYMENT_STATUS_TYPES = [
  "prepared",
  "confirming",
  "confirmed",
  "confirm_failed",
  "tax_reconciliation_failed",
  "wallet_reconciliation_failed",
  "cancel_pending",
  "canceled",
  "cancel_failed",
  "refund_pending",
  "refunded",
  "refund_failed",
  "manual_review",
  // 기존 문서 조회 호환용. 신규 쓰기에는 사용하지 않는다.
  "failed",
] as const;
