import type { CoinLotDebit } from "types/payment/coinLots";
import { coinLotAllocationTotal } from "./coinLotPolicy";

export type CoinCompensationPlan = {
  eventType: "coin_compensation";
  kind: "service_failure_compensation";
  operationId: string;
  sourceOperationId: string;
  reason: string;
  restore: CoinLotDebit[];
  coins: number;
};

/** Restores the original lot attribution; it never falls back to a generic wallet bucket. */
export function buildCoinCompensationPlan(input: {
  operationId: string;
  sourceOperationId: string;
  reason: string;
  coins?: number;
  originalDebit: readonly CoinLotDebit[] | null | undefined;
}): CoinCompensationPlan | { ok: false; errorCode: string; message: string } {
  if (!input.operationId.trim() || !input.sourceOperationId.trim()) {
    return { ok: false, errorCode: "COMPENSATION_ID_REQUIRED", message: "보상 작업 멱등 식별자가 없습니다." };
  }
  if (!input.originalDebit?.length) {
    return { ok: false, errorCode: "COMPENSATION_ORIGINAL_DEBIT_REQUIRED", message: "원래 차감 lot 귀속이 없어 보상을 자동 적용할 수 없습니다." };
  }
  const originalCoins = coinLotAllocationTotal(input.originalDebit);
  const requestedCoins = input.coins === undefined ? originalCoins : Number(input.coins);
  if (!Number.isSafeInteger(requestedCoins) || requestedCoins <= 0 || requestedCoins > originalCoins) {
    return { ok: false, errorCode: "COMPENSATION_AMOUNT_INVALID", message: "보상 코인이 원래 차감을 초과하거나 올바르지 않습니다." };
  }

  let remaining = requestedCoins;
  const restore: CoinLotDebit[] = [];
  for (const debit of [...input.originalDebit].reverse()) {
    if (remaining <= 0) break;
    const coins = Math.min(remaining, debit.coins);
    if (coins > 0) restore.push({ ...debit, coins });
    remaining -= coins;
  }
  return {
    eventType: "coin_compensation",
    kind: "service_failure_compensation",
    operationId: input.operationId,
    sourceOperationId: input.sourceOperationId,
    reason: input.reason,
    restore,
    coins: requestedCoins,
  };
}
