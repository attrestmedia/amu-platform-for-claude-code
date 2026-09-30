import type { CoinLotBucket, CoinLotSnapshot } from "types/payment/coinLots";
import { DAY_MS } from "./coinLotPolicy";

type RefundOrder = {
  orderId: string;
  purpose: "coin_pack" | "subscription";
  purchasedAt: Date | string;
  amount: number;
  paidCoins: number;
  bonusCoins: number;
};

export type CoinRefundDecision = {
  decision: "auto_refund" | "manual_review" | "deny";
  reasonCode: string;
  orderId: string;
  fullyUnused: boolean;
  refundablePaidCoins: number;
  reclaimBonusCoins: number;
  refundAmount: number | null;
  matchedLotIds: string[];
  requiresWalletReversal: boolean;
  requiresPgOperation: boolean;
};

function integer(value: unknown, field: string) {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) throw new Error(`${field}는 0 이상의 안전한 정수여야 합니다.`);
  return result;
}

function date(value: Date | string, field: string) {
  const result = new Date(value);
  if (!Number.isFinite(result.getTime())) throw new Error(`${field} 날짜가 올바르지 않습니다.`);
  return result;
}

function sameOrder(lot: CoinLotSnapshot, orderId: string) {
  return lot.orderId === orderId;
}

/**
 * Calculates wallet-side quantities only. It deliberately does not call Toss or mutate a wallet.
 * Partial refund amount is left for an approved tax/PG policy when no exact formula is supplied.
 */
export function calculateCoinRefundDecision(input: { order: RefundOrder; lots: readonly CoinLotSnapshot[]; now?: Date | string }): CoinRefundDecision {
  const order = input.order;
  const purchasedAt = date(order.purchasedAt, "purchasedAt");
  const now = input.now ? date(input.now, "now") : new Date();
  const ageMs = now.getTime() - purchasedAt.getTime();
  const paidCoins = integer(order.paidCoins, "paidCoins");
  const bonusCoins = integer(order.bonusCoins, "bonusCoins");
  const orderLots = input.lots.filter((lot) => sameOrder(lot, order.orderId));
  const paidLots = orderLots.filter((lot) => lot.bucket === "paid");
  const bonusLots = orderLots.filter((lot) => lot.bucket === "purchase_bonus" || lot.bucket === "promo_bonus");
  const membershipLots = orderLots.filter((lot) => lot.bucket === "membership");
  const originalTotal = paidCoins + bonusCoins;
  const remainingPaid = paidLots.reduce((sum, lot) => sum + integer(lot.remainingCoins, `${lot.lotId}.remainingCoins`), 0);
  const remainingBonus = bonusLots.reduce((sum, lot) => sum + integer(lot.remainingCoins, `${lot.lotId}.remainingCoins`), 0);
  const remainingMembership = membershipLots.reduce((sum, lot) => sum + integer(lot.remainingCoins, `${lot.lotId}.remainingCoins`), 0);
  const matchedRemaining = remainingPaid + remainingBonus + remainingMembership;
  const fullyUnused = matchedRemaining === originalTotal && originalTotal > 0;
  const matchedLotIds = orderLots.map((lot) => lot.lotId).sort();
  const base: Omit<CoinRefundDecision, "decision" | "reasonCode"> = {
    orderId: order.orderId,
    fullyUnused,
    refundablePaidCoins: 0,
    reclaimBonusCoins: 0,
    refundAmount: null,
    matchedLotIds,
    requiresWalletReversal: false,
    requiresPgOperation: false,
  };

  if (order.purpose === "subscription" || membershipLots.length > 0) {
    if (fullyUnused && ageMs >= 0 && ageMs <= 7 * DAY_MS) {
      return { ...base, decision: "auto_refund", reasonCode: "MEMBERSHIP_FULL_UNUSED_7D", refundablePaidCoins: paidCoins, reclaimBonusCoins: bonusCoins, refundAmount: order.amount, requiresWalletReversal: true, requiresPgOperation: true };
    }
    return { ...base, decision: "manual_review", reasonCode: fullyUnused ? "MEMBERSHIP_AFTER_7D_PRORATA" : "MEMBERSHIP_USED_OR_PERIOD_REVIEW" };
  }

  if (orderLots.length === 0 || paidLots.length === 0 || (paidCoins > 0 && remainingPaid > paidCoins) || (bonusCoins > 0 && remainingBonus > bonusCoins)) {
    return { ...base, decision: "manual_review", reasonCode: "REFUND_LOT_ATTRIBUTION_REQUIRED" };
  }
  if (ageMs < 0 || ageMs > 365 * DAY_MS) return { ...base, decision: "deny", reasonCode: "REFUND_OUTSIDE_ONE_YEAR" };
  if (fullyUnused) {
    return { ...base, decision: "auto_refund", reasonCode: ageMs <= 7 * DAY_MS ? "FULL_UNUSED_7D" : "FULL_UNUSED_ONE_YEAR", refundablePaidCoins: remainingPaid, reclaimBonusCoins: remainingBonus, refundAmount: order.amount, requiresWalletReversal: true, requiresPgOperation: true };
  }
  if (remainingBonus > 0 && remainingBonus < bonusCoins) {
    return { ...base, decision: "manual_review", reasonCode: "PARTIAL_BONUS_ATTRIBUTION_REVIEW" };
  }
  return { ...base, decision: "manual_review", reasonCode: "PARTIAL_PAID_REFUND_TAX_PG_REVIEW", refundablePaidCoins: remainingPaid, reclaimBonusCoins: remainingBonus };
}

export function isCashRefundEligibleBucket(bucket: CoinLotBucket) {
  return bucket === "paid";
}
