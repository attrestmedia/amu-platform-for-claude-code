import "server-only";

import type { PaymentRefundRequestStatus } from "models/payment";
import type { CoinRefundDecision } from "./coinRefundPolicy";

export const PAYMENT_REFUND_TRANSITIONS: Readonly<Record<PaymentRefundRequestStatus, readonly PaymentRefundRequestStatus[]>> = {
  requested: ["manual_review", "approved", "rejected"],
  manual_review: ["approved", "rejected", "manual_review"],
  approved: ["pg_pending", "manual_review"],
  rejected: [],
  pg_pending: ["pg_succeeded", "manual_review", "failed"],
  pg_succeeded: ["wallet_pending", "manual_review"],
  wallet_pending: ["refunded", "manual_review", "failed"],
  refunded: [],
  failed: ["manual_review"],
};

export function isPaymentRefundRequestEnabled(env: Record<string, string | undefined> = process.env) {
  return env.PAYMENT_REFUND_REQUEST_ENABLED === "true";
}

export function isPaymentCoinLotCutoverVerified(env: Record<string, string | undefined> = process.env) {
  return env.PAYMENT_COIN_LOT_CUTOVER_VERIFIED === "true";
}

// Billing DB transaction에서 Payment/refund request/operation/full-unused lot reservation을 원자적으로 생성한다.
// 외부 실행은 아래 compile-time 계약과 세 환경 게이트가 모두 true일 때만 열린다.
const PAYMENT_REFUND_RESERVATION_IMPLEMENTED = true;
export function isPaymentRefundReservationVerified(env: Record<string, string | undefined> = process.env) {
  return PAYMENT_REFUND_RESERVATION_IMPLEMENTED && env.PAYMENT_REFUND_RESERVATION_VERIFIED === "true";
}

export function isPaymentRefundExecutionEnabled(env: Record<string, string | undefined> = process.env) {
  return isPaymentRefundRequestEnabled(env) &&
    env.PAYMENT_REFUND_EXECUTION_ENABLED === "true" &&
    isPaymentCoinLotCutoverVerified(env) &&
    isPaymentRefundReservationVerified(env);
}

export function assertPaymentRefundTransition(from: PaymentRefundRequestStatus, to: PaymentRefundRequestStatus) {
  if (!PAYMENT_REFUND_TRANSITIONS[from].includes(to)) {
    throw Object.assign(new Error(`환불 상태 전이가 허용되지 않습니다: ${from} → ${to}`), {
      status: 409,
      errorCode: "PAYMENT_REFUND_STATE_CONFLICT",
    });
  }
}

export type PaymentRefundRequestPlan = {
  status: "requested" | "manual_review";
  reasonCode: string;
  refundAmount?: number;
  refundablePaidCoins: number;
  reclaimBonusCoins: number;
  lotIds: string[];
  externalExecutionAllowed: false;
};

/** 요청 단계는 서버 판정 snapshot만 만든다. Toss/Wallet 호출은 execution flag와 별도 승인 전까지 금지한다. */
export function buildPaymentRefundRequestPlan(decision: CoinRefundDecision): PaymentRefundRequestPlan {
  const autoCandidate = decision.decision === "auto_refund" &&
    decision.requiresPgOperation &&
    decision.requiresWalletReversal &&
    decision.refundAmount !== null &&
    decision.matchedLotIds.length > 0;
  return {
    status: autoCandidate ? "requested" : "manual_review",
    reasonCode: autoCandidate ? decision.reasonCode :
      decision.matchedLotIds.length === 0 ? "REFUND_LOT_ATTRIBUTION_REQUIRED" : decision.reasonCode,
    ...(decision.refundAmount === null ? {} : { refundAmount: decision.refundAmount }),
    refundablePaidCoins: decision.refundablePaidCoins,
    reclaimBonusCoins: decision.reclaimBonusCoins,
    lotIds: [...decision.matchedLotIds].sort(),
    externalExecutionAllowed: false,
  };
}
