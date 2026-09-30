import type { CoinLotBucket, CoinLotOwnerScope } from "types/payment/coinLots";
import { COIN_LOT_POLICY_VERSION } from "./coinLotPolicy";

export type LegacyChargedEvidence = {
  orderId: string;
  remainingCoins: number;
  purchasedAt?: Date | string;
  evidenceType: "payment_snapshot" | "usage_ledger" | "support_review";
  verified: boolean;
};

export type LegacyWalletDryRunInput = {
  ownerScope: CoinLotOwnerScope;
  ownerId: string;
  chargedCoins: number;
  evidence?: readonly LegacyChargedEvidence[];
  policyVersion?: string;
};

export type LegacyWalletDryRunReport = {
  mode: "dry_run";
  ownerScope: CoinLotOwnerScope;
  ownerId: string;
  policyVersion: string;
  beforeChargedCoins: number;
  attributablePaidCoins: number;
  legacyUnattributedCoins: number;
  accountedCoins: number;
  conservationPassed: boolean;
  autoClassifiedUnknown: number;
  manualReview: Array<{ code: string; orderId?: string; coins?: number; message: string }>;
  candidates: Array<{
    lotId: string;
    bucket: "paid" | "legacy_unattributed";
    orderId?: string;
    remainingCoins: number;
    action: "candidate" | "manual_review";
  }>;
};

function nonNegativeInteger(value: unknown, field: string) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error(`${field}는 0 이상의 안전한 정수여야 합니다.`);
  return number;
}

function sortEvidence(a: LegacyChargedEvidence, b: LegacyChargedEvidence) {
  return a.orderId.localeCompare(b.orderId);
}

/**
 * Legacy charged balances are never silently promoted to paid lots. Only verified,
 * order-scoped evidence can produce a paid candidate; the residual stays legacy.
 */
export function buildLegacyWalletDryRun(input: LegacyWalletDryRunInput): LegacyWalletDryRunReport {
  const chargedCoins = nonNegativeInteger(input.chargedCoins, "chargedCoins");
  const evidence = [...(input.evidence || [])].sort(sortEvidence);
  const manualReview: LegacyWalletDryRunReport["manualReview"] = [];
  const candidates: LegacyWalletDryRunReport["candidates"] = [];
  let attributablePaidCoins = 0;
  const seenOrderIds = new Set<string>();

  for (const item of evidence) {
    const coins = nonNegativeInteger(item.remainingCoins, `${item.orderId}.remainingCoins`);
    if (seenOrderIds.has(item.orderId)) {
      manualReview.push({ code: "LEGACY_DUPLICATE_EVIDENCE", orderId: item.orderId, coins, message: "동일 주문 증빙이 중복되어 자동 귀속하지 않습니다." });
      continue;
    }
    seenOrderIds.add(item.orderId);
    if (!item.orderId.trim() || !item.verified || !["payment_snapshot", "usage_ledger"].includes(item.evidenceType)) {
      manualReview.push({ code: "LEGACY_EVIDENCE_NOT_VERIFIED", orderId: item.orderId, coins, message: "주문·원장 증빙을 자동 귀속할 수 없습니다." });
      continue;
    }
    if (coins === 0) continue;
    attributablePaidCoins += coins;
    candidates.push({
      lotId: `${input.ownerScope}:${input.ownerId}:${item.orderId}:paid`,
      bucket: "paid",
      orderId: item.orderId,
      remainingCoins: coins,
      action: "candidate",
    });
  }

  if (attributablePaidCoins > chargedCoins) {
    manualReview.push({
      code: "LEGACY_EVIDENCE_EXCEEDS_BALANCE",
      coins: attributablePaidCoins - chargedCoins,
      message: "증빙 잔액 합계가 현행 charged 잔액을 초과하여 자동 적용하지 않습니다.",
    });
    attributablePaidCoins = 0;
    candidates.splice(0, candidates.length);
  }

  const legacyUnattributedCoins = chargedCoins - attributablePaidCoins;
  if (legacyUnattributedCoins > 0) {
    candidates.push({
      lotId: `${input.ownerScope}:${input.ownerId}:legacy-unattributed`,
      bucket: "legacy_unattributed",
      remainingCoins: legacyUnattributedCoins,
      action: "manual_review",
    });
    manualReview.push({
      code: "LEGACY_UNATTRIBUTED_BALANCE",
      coins: legacyUnattributedCoins,
      message: "출처 불명 잔액은 Legacy Unattributed로만 보존하고 자동 환불·Paid 승격하지 않습니다.",
    });
  }

  const accountedCoins = attributablePaidCoins + legacyUnattributedCoins;
  return {
    mode: "dry_run",
    ownerScope: input.ownerScope,
    ownerId: input.ownerId,
    policyVersion: input.policyVersion || COIN_LOT_POLICY_VERSION,
    beforeChargedCoins: chargedCoins,
    attributablePaidCoins,
    legacyUnattributedCoins,
    accountedCoins,
    conservationPassed: accountedCoins === chargedCoins,
    autoClassifiedUnknown: 0,
    manualReview,
    candidates,
  };
}

export function isLegacyBucket(bucket: CoinLotBucket) {
  return bucket === "legacy_unattributed";
}
