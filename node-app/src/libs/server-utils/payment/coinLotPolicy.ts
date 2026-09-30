import type {
  CoinLotBucket,
  CoinLotCredit,
  CoinLotDebit,
  CoinLotOwnerScope,
  CoinLotSnapshot,
} from "types/payment/coinLots";

export const COIN_LOT_POLICY_VERSION = "universe-coin-v1.2-2026-08";
const DAY_MS = 24 * 60 * 60 * 1000;

type LotReadiness = { lot: CoinLotSnapshot; usable: boolean; reason?: string; time?: number };

function asNonNegativeSafeInteger(value: unknown, field: string) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error(`${field}는 0 이상의 안전한 정수여야 합니다.`);
  }
  return number;
}

function toTime(value: Date | string | undefined, field: string) {
  if (!value) return undefined;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) throw new Error(`${field} 날짜가 올바르지 않습니다.`);
  return time;
}

function addYears(date: Date, years: number) {
  const result = new Date(date);
  result.setUTCFullYear(result.getUTCFullYear() + years);
  return result;
}

function normalizeNow(now?: Date | string) {
  const value = now ? new Date(now) : new Date();
  if (!Number.isFinite(value.getTime())) throw new Error("기준 시각이 올바르지 않습니다.");
  return value;
}

function validateBucketScope(bucket: CoinLotBucket, ownerScope: CoinLotOwnerScope) {
  if (bucket === "membership" && ownerScope !== "universe") {
    throw new Error("Membership lot은 유니버스 지갑에만 생성할 수 있습니다.");
  }
}

function readiness(lot: CoinLotSnapshot, ownerScope: CoinLotOwnerScope, now: Date): LotReadiness {
  validateBucketScope(lot.bucket, ownerScope);
  const coins = asNonNegativeSafeInteger(lot.coins, `${lot.lotId}.coins`);
  const remainingCoins = asNonNegativeSafeInteger(lot.remainingCoins, `${lot.lotId}.remainingCoins`);
  if (remainingCoins > coins) throw new Error(`${lot.lotId}의 잔여 코인이 원 코인을 초과합니다.`);
  if (!lot.lotId.trim()) throw new Error("lotId가 비어 있습니다.");
  if (lot.status === "exhausted" || remainingCoins === 0) return { lot, usable: false, reason: "exhausted" };
  if (lot.status === "expired") return { lot, usable: false, reason: "expired" };

  const grantedAt = toTime(lot.grantedAt, `${lot.lotId}.grantedAt`);
  const expiresAt = toTime(lot.expiresAt, `${lot.lotId}.expiresAt`);
  if (grantedAt === undefined) throw new Error(`${lot.lotId}.grantedAt가 없습니다.`);
  if ((lot.bucket === "paid" || lot.bucket === "purchase_bonus" || lot.bucket === "promo_bonus") && expiresAt === undefined) {
    return { lot, usable: false, reason: "missing_expiry", time: grantedAt };
  }
  if (expiresAt !== undefined && now.getTime() >= expiresAt) return { lot, usable: false, reason: "expired", time: expiresAt };
  return { lot, usable: true, time: grantedAt };
}

function compareByExpiryThenGranted(a: LotReadiness, b: LotReadiness) {
  const aExpiry = toTime(a.lot.expiresAt, `${a.lot.lotId}.expiresAt`) ?? Number.MAX_SAFE_INTEGER;
  const bExpiry = toTime(b.lot.expiresAt, `${b.lot.lotId}.expiresAt`) ?? Number.MAX_SAFE_INTEGER;
  return aExpiry - bExpiry || (a.time ?? 0) - (b.time ?? 0) || a.lot.lotId.localeCompare(b.lot.lotId);
}

function comparePaid(a: LotReadiness, b: LotReadiness) {
  const aPurchased = toTime(a.lot.purchasedAt, `${a.lot.lotId}.purchasedAt`) ?? a.time ?? 0;
  const bPurchased = toTime(b.lot.purchasedAt, `${b.lot.lotId}.purchasedAt`) ?? b.time ?? 0;
  return aPurchased - bPurchased || (a.time ?? 0) - (b.time ?? 0) || a.lot.lotId.localeCompare(b.lot.lotId);
}

function orderedReadiness(lots: readonly CoinLotSnapshot[], ownerScope: CoinLotOwnerScope, now: Date) {
  const checked = lots.map((lot) => readiness(lot, ownerScope, now));
  const buckets: CoinLotBucket[] = ownerScope === "universe"
    ? ["membership", "purchase_bonus", "promo_bonus", "legacy_unattributed", "paid"]
    : ["purchase_bonus", "promo_bonus", "legacy_unattributed", "paid"];
  return buckets.flatMap((bucket) => {
    const sameBucket = checked.filter((item) => item.lot.bucket === bucket && item.usable);
    sameBucket.sort(bucket === "paid" ? comparePaid : compareByExpiryThenGranted);
    return sameBucket;
  });
}

export type CoinLotAllocationResult = {
  ok: boolean;
  needCoins: number;
  allocatedCoins: number;
  remainingCoins: number;
  debits: CoinLotDebit[];
  skipped: Array<{ lotId: string; reason: string }>;
  errorCode?: "COIN_INSUFFICIENT" | "LOT_POLICY_INVALID";
};

/** Pure, read-only allocation. It never mutates a lot or a wallet. */
export function allocateCoinLots(input: {
  ownerScope: CoinLotOwnerScope;
  lots: readonly CoinLotSnapshot[];
  needCoins: number;
  now?: Date | string;
}): CoinLotAllocationResult {
  const needCoins = asNonNegativeSafeInteger(input.needCoins, "needCoins");
  const now = normalizeNow(input.now);
  const checked = input.lots.map((lot) => readiness(lot, input.ownerScope, now));
  const ordered = orderedReadiness(input.lots, input.ownerScope, now);
  let remaining = needCoins;
  const debits: CoinLotDebit[] = [];
  for (const item of ordered) {
    if (remaining <= 0) break;
    const amount = Math.min(remaining, asNonNegativeSafeInteger(item.lot.remainingCoins, `${item.lot.lotId}.remainingCoins`));
    if (amount <= 0) continue;
    debits.push({ lotId: item.lot.lotId, bucket: item.lot.bucket, coins: amount });
    remaining -= amount;
  }
  const skipped = checked
    .filter((item) => !item.usable)
    .map((item) => ({ lotId: item.lot.lotId, reason: item.reason || "not_usable" }))
    .sort((a, b) => a.lotId.localeCompare(b.lotId));
  return {
    ok: remaining === 0,
    needCoins,
    allocatedCoins: needCoins - remaining,
    remainingCoins: remaining,
    debits,
    skipped,
    ...(remaining > 0 ? { errorCode: "COIN_INSUFFICIENT" as const } : {}),
  };
}

export type CoinLotCreditPlanInput = {
  ownerScope: CoinLotOwnerScope;
  ownerId: string;
  orderId: string;
  operationId?: string;
  purpose: "coin_pack" | "subscription";
  paidCoins?: number;
  bonusCoins?: number;
  creditedCoins?: number;
  membershipExpiresAt?: Date | string;
  grantedAt?: Date | string;
  policyVersion?: string;
};

function normalizedDate(value: Date | string | undefined, fallback: Date, field: string) {
  const result = value ? new Date(value) : fallback;
  if (!Number.isFinite(result.getTime())) throw new Error(`${field} 날짜가 올바르지 않습니다.`);
  return result;
}

function normalizedPositive(value: unknown, field: string) {
  const number = asNonNegativeSafeInteger(value, field);
  if (number <= 0) throw new Error(`${field}는 양의 정수여야 합니다.`);
  return number;
}

/** Builds future lot documents from a payment snapshot without writing to MongoDB. */
export function buildCoinLotCreditPlan(input: CoinLotCreditPlanInput): CoinLotCredit[] {
  if (!input.ownerId.trim() || !input.orderId.trim()) throw new Error("lot 귀속 식별자가 없습니다.");
  const grantedAt = normalizedDate(input.grantedAt, new Date(), "grantedAt");
  const policyVersion = input.policyVersion || COIN_LOT_POLICY_VERSION;
  const operationId = input.operationId || input.orderId;
  const paidCoins = input.paidCoins === undefined ? undefined : asNonNegativeSafeInteger(input.paidCoins, "paidCoins");
  const bonusCoins = input.bonusCoins === undefined ? undefined : asNonNegativeSafeInteger(input.bonusCoins, "bonusCoins");
  const lots: CoinLotCredit[] = [];
  const addLot = (bucket: CoinLotBucket, coins: number, expiresAt: Date, source: CoinLotCredit["source"]) => {
    validateBucketScope(bucket, input.ownerScope);
    lots.push({
      lotId: `${input.ownerScope}:${input.ownerId}:${input.orderId}:${bucket}`,
      ownerScope: input.ownerScope,
      ownerId: input.ownerId,
      bucket,
      coins,
      remainingCoins: coins,
      grantedAt,
      purchasedAt: grantedAt,
      expiresAt,
      orderId: input.orderId,
      status: "active",
      policyVersion,
      source,
      sourceOperationId: operationId,
    });
  };

  if (input.purpose === "coin_pack") {
    if (input.ownerScope === "universe" && input.ownerId.trim() === "") throw new Error("유니버스 lot 귀속이 없습니다.");
    if (paidCoins === undefined || bonusCoins === undefined) throw new Error("신규 coin_pack은 paidCoins/bonusCoins 스냅샷이 필요합니다.");
    addLot("paid", normalizedPositive(paidCoins, "paidCoins"), addYears(grantedAt, 5), "payment");
    if (bonusCoins > 0) addLot("purchase_bonus", bonusCoins, addYears(grantedAt, 1), "payment");
    return lots;
  }

  if (input.ownerScope === "user") throw new Error("개인 subscription 판매는 현재 비활성입니다.");
  if (paidCoins === undefined || bonusCoins === undefined) {
    throw new Error("Membership 신규 주문은 paidCoins/bonusCoins 스냅샷이 필요합니다.");
  }
  const membershipExpiresAt = normalizedDate(input.membershipExpiresAt, new Date(NaN), "membershipExpiresAt");
  // Membership scalar wallet은 지급 총액을 하나의 기간 잔액으로 관리하므로 추가 지급도 같은 만료 lot에 포함한다.
  addLot("membership", normalizedPositive(paidCoins + bonusCoins, "creditedCoins"), membershipExpiresAt, "payment");
  if (input.creditedCoins !== undefined && paidCoins + bonusCoins !== normalizedPositive(input.creditedCoins, "creditedCoins")) {
    throw new Error("Membership creditedCoins와 paidCoins/bonusCoins가 일치하지 않습니다.");
  }
  return lots;
}

export function coinLotAllocationTotal(debits: readonly CoinLotDebit[]) {
  return debits.reduce((total, debit) => total + asNonNegativeSafeInteger(debit.coins, `${debit.lotId}.coins`), 0);
}

export function reconstructCoinLotOperationDebits(
  lots: ReadonlyArray<Pick<CoinLotSnapshot, "lotId" | "bucket"> & {
    debitReceipts?: ReadonlyArray<{ operationId: string; sequence: number; coins: number }>;
  }>,
  operationId: string,
) {
  const receipts = lots.flatMap((lot) => (lot.debitReceipts || [])
    .filter((receipt) => receipt.operationId === operationId)
    .map((receipt) => ({
      sequence: Number(receipt.sequence),
      debit: { lotId: lot.lotId, bucket: lot.bucket, coins: Number(receipt.coins) },
    })));
  receipts.sort((left, right) => left.sequence - right.sequence);
  if (receipts.some((receipt, index) => !Number.isSafeInteger(receipt.sequence) || receipt.sequence !== index)) {
    throw Object.assign(new Error("lot 차감 receipt 순서를 검증할 수 없습니다."), {
      errorCode: "COIN_OPERATION_RECEIPT_SEQUENCE_INVALID",
    });
  }
  return receipts.map((receipt) => receipt.debit);
}

export function walletDebitFromLots(ownerScope: CoinLotOwnerScope, debits: readonly CoinLotDebit[]) {
  return debits.reduce((total, debit) => {
    if (ownerScope === "universe") {
      if (debit.bucket === "membership") total.membershipCoins += debit.coins;
      else total.chargedCoins += debit.coins;
    } else if (debit.bucket === "promo_bonus") {
      total.bonusCoins += debit.coins;
    } else {
      total.chargedCoins += debit.coins;
    }
    return total;
  }, { bonusCoins: 0, membershipCoins: 0, chargedCoins: 0 });
}

export { DAY_MS };
