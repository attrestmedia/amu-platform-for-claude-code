import "server-only";
import { randomUUID } from "node:crypto";
import { MONGODB_BILLING_URL } from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import { CoinUsageSchema, type ICoinUsageDocument } from "models/payment/CoinUsageSchema";
import type { BillableProviderType } from "types/ai";
import type {
  CoinUsageEntryType,
  CoinUsageRecordState,
  IFixedUsage,
  ITokenUsageBreakdown,
} from "types/payment";
import type { UnknownRecord } from "utils/common/typeUtils";
import type { CoinLotDebit } from "types/payment/coinLots";
import { resolveCoinUsageAttribution } from "./coinUsageAttribution";

/**
 * @docHint
 * @purpose 지갑 변경 전에 코인 원장을 예약하고 멱등·상태 전이로 기록 누락 및 중복 차감 방지
 * @process operationId 확정 → prepared 원장 예약 → 기존 상태 판정 → applied/failed/reconciliation 상태 전이
 * @domain payment
 * @scope server-global
 */

type CoinUsageLedgerPayload = {
  uid: string;
  universeId?: string;
  app: string;
  provider: BillableProviderType;
  modelName: string;
  billingKey: string;
  coins: number;
  breakdown: UnknownRecord;
  usage?: ITokenUsageBreakdown;
  fixed?: IFixedUsage;
  meta?: Record<string, unknown>;
  entryType: CoinUsageEntryType;
};

type PreparedLedger = {
  id: string;
  operationId: string;
  alreadyApplied: boolean;
};

type LedgerError = Error & { errorCode?: string; status?: number; operationId?: string };

function ledgerError(message: string, errorCode: string, status: number, operationId: string) {
  return Object.assign(new Error(message), { errorCode, status, operationId }) as LedgerError;
}

function normalizeOperationId(payload: CoinUsageLedgerPayload) {
  const explicit = String(payload.meta?.operationId || payload.meta?.requestId || "").trim();
  return (explicit || randomUUID()).slice(0, 240);
}

function isDuplicateKeyError(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && Number(error.code) === 11000);
}

async function getCoinUsageModel() {
  return getModel<ICoinUsageDocument>(MONGODB_BILLING_URL, "CoinUsage", CoinUsageSchema, "coin_usages");
}

function assertSameOperation(existing: ICoinUsageDocument, payload: CoinUsageLedgerPayload, operationId: string) {
  if (
    existing.app !== payload.app ||
    existing.billingKey !== payload.billingKey ||
    Number(existing.coins) !== Number(payload.coins)
  ) {
    throw ledgerError(
      "같은 operationId에 서로 다른 과금 정보가 감지되었습니다.",
      "COIN_OPERATION_CONFLICT",
      409,
      operationId,
    );
  }
}

async function resolveExistingLedger(
  existing: ICoinUsageDocument,
  payload: CoinUsageLedgerPayload,
  operationId: string,
): Promise<PreparedLedger> {
  assertSameOperation(existing, payload, operationId);
  const id = String(existing._id);
  if (existing.state === "applied") return { id, operationId, alreadyApplied: true };
  // Lot/owner wallet writes are independently receipt-guarded. A crash can leave the
  // billing ledger prepared after either durable step, so the same operation must be replayable.
  if (
    (existing.state === "prepared" || existing.state === "reconciliation_required") &&
    process.env.PAYMENT_COIN_LOT_CUTOVER_VERIFIED === "true"
  ) {
    return { id, operationId, alreadyApplied: false };
  }
  // EL-203 — unknown_outcome은 재오픈하지 않는다. 자동 재호출이 곧 이중 청구다.
  if (existing.state === "unknown_outcome") {
    throw ledgerError(
      "이전 시도의 외부 처리 여부가 확인되지 않았습니다. 자동 재시도하지 않습니다.",
      "COIN_OPERATION_UNKNOWN_OUTCOME",
      409,
      operationId,
    );
  }
  if (existing.state === "failed" || existing.state === "compensated") {
    const CoinUsage = await getCoinUsageModel();
    const reopened = await CoinUsage.findOneAndUpdate(
      { _id: existing._id, state: existing.state },
      {
        $set: { state: "prepared", lastError: "" },
        $unset: { walletAppliedAt: 1, finalizedAt: 1 },
      },
      { new: true },
    );
    if (reopened) return { id, operationId, alreadyApplied: false };
  }
  throw ledgerError(
    "동일한 코인 작업이 처리 중이거나 재조정이 필요합니다.",
    "COIN_OPERATION_IN_PROGRESS",
    409,
    operationId,
  );
}

export async function prepareCoinUsageLedger(payload: CoinUsageLedgerPayload): Promise<PreparedLedger> {
  const CoinUsage = await getCoinUsageModel();
  const operationId = normalizeOperationId(payload);
  const existing = await CoinUsage.findOne({ uid: payload.uid, operationId, entryType: payload.entryType });
  if (existing) return resolveExistingLedger(existing, payload, operationId);

  const attribution = resolveCoinUsageAttribution({
    app: payload.app,
    billingKey: payload.billingKey,
    meta: payload.meta,
    source: payload.meta?.source,
  });
  try {
    const created = await CoinUsage.create({
      ...payload,
      ...attribution,
      operationId,
      state: "prepared",
      meta: { ...(payload.meta || {}), operationId },
    });
    return { id: String(created._id), operationId, alreadyApplied: false };
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    const raced = await CoinUsage.findOne({ uid: payload.uid, operationId, entryType: payload.entryType });
    if (!raced) throw error;
    return resolveExistingLedger(raced, payload, operationId);
  }
}

export async function markCoinUsageLedgerApplied(
  id: string,
  walletDebit?: { bonusCoins?: number; membershipCoins?: number; chargedCoins?: number },
  lotDebits?: readonly CoinLotDebit[],
) {
  const CoinUsage = await getCoinUsageModel();
  const appliedAt = new Date();
  const set: Record<string, unknown> = {
    state: "applied",
    walletAppliedAt: appliedAt,
    finalizedAt: appliedAt,
    lastError: "",
  };
  if (walletDebit) set["meta.walletDebit"] = walletDebit;
  if (lotDebits) set["meta.lotDebits"] = lotDebits;
  const updated = await CoinUsage.findOneAndUpdate(
    // A receipt-guarded lot/wallet replay may start from reconciliation_required.
    // Finalization is the only legal forward transition after both durable receipts
    // have been re-observed, so accept both non-terminal states here.
    { _id: id, state: { $in: ["prepared", "reconciliation_required"] } },
    { $set: set },
    { new: true },
  );
  if (updated) return updated;

  const current = await CoinUsage.findById(id);
  if (current?.state === "applied") return current;
  throw ledgerError(
    "지갑 변경 후 코인 원장 확정에 실패했습니다.",
    "COIN_LEDGER_FINALIZE_FAILED",
    503,
    String(current?.operationId || ""),
  );
}

export async function getAppliedCoinUsageLotDebits(uid: string, operationId: string) {
  if (!operationId) return null;
  const CoinUsage = await getCoinUsageModel();
  const row = await CoinUsage.findOne(
    { uid, operationId, entryType: "deduction", state: "applied" },
    { "meta.lotDebits": 1 },
  ).lean();
  const raw = row?.meta?.lotDebits;
  if (!Array.isArray(raw)) return null;
  const result: CoinLotDebit[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const debit = item as Record<string, unknown>;
    if (
      typeof debit.lotId !== "string" ||
      typeof debit.bucket !== "string" ||
      !Number.isSafeInteger(debit.coins) ||
      Number(debit.coins) <= 0
    ) return null;
    result.push({ lotId: debit.lotId, bucket: debit.bucket as CoinLotDebit["bucket"], coins: Number(debit.coins) });
  }
  return result;
}

export async function getAppliedCoinUsageWalletDebit(uid: string, operationId: string) {
  if (!operationId) return null;
  const CoinUsage = await getCoinUsageModel();
  const row = await CoinUsage.findOne(
    { uid, operationId, entryType: "deduction", state: "applied" },
    { "meta.walletDebit": 1 },
  ).lean();
  const raw = row?.meta?.walletDebit;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const debit = raw as Record<string, unknown>;
  return {
    bonusCoins: Math.max(0, Number(debit.bonusCoins || 0)),
    membershipCoins: Math.max(0, Number(debit.membershipCoins || 0)),
    chargedCoins: Math.max(0, Number(debit.chargedCoins || 0)),
  };
}

async function setLedgerState(id: string, state: CoinUsageRecordState, error: unknown) {
  const CoinUsage = await getCoinUsageModel();
  const message = error instanceof Error ? error.message : String(error || "");
  // EL-203 — unknown_outcome은 failed/reconciliation_required로 **덮어쓸 수 없다**.
  // 덮어쓰이면 resolveExistingLedger의 재오픈 분기를 타서 자동 재청구가 살아난다(ADR-EL-001 D6 위반).
  // 라우트가 안쪽 catch에서 unknown_outcome을 찍고 바깥 공통 핸들러가 failed를 찍는 구조에서 실제로 발생한다.
  await CoinUsage.updateOne(
    { _id: id, state: { $nin: ["applied", "unknown_outcome"] } },
    { $set: { state, lastError: message.slice(0, 500), finalizedAt: new Date() } },
  );
}

export async function markCoinUsageLedgerFailed(id: string, error: unknown) {
  await setLedgerState(id, "failed", error);
}

export async function markCoinUsageLedgerReconciliationRequired(id: string, error: unknown) {
  await setLedgerState(id, "reconciliation_required", error);
}

/**
 * EL-203 — provider 처리 여부 불명으로 격리한다.
 * 예약을 해제하지도 청구하지도 않는다. 이 상태의 원장은 재오픈되지 않는다(resolveExistingLedger 참조).
 */
export async function markCoinUsageLedgerUnknownOutcome(id: string, error: unknown) {
  await setLedgerState(id, "unknown_outcome", error);
}
