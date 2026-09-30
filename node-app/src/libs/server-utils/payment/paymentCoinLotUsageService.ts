import "server-only";

import type { Model } from "mongoose";
import { MONGODB_BILLING_URL } from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import { CoinLotSchema, type ICoinLotDocument } from "models/payment";
import type { CoinLotDebit, CoinLotOwnerScope, CoinLotSnapshot } from "types/payment/coinLots";
import { allocateCoinLots, coinLotAllocationTotal, reconstructCoinLotOperationDebits } from "./coinLotPolicy";
import { buildCoinCompensationPlan } from "./coinCompensationPolicy";

const ACTIVE_REFUND_RESERVATIONS = ["reserved", "pg_succeeded"] as const;

type StoredLot = CoinLotSnapshot & {
  debitReceipts?: Array<{ operationId: string; sequence: number; coins: number; appliedAt: Date }>;
  compensationReceipts?: Array<{ operationId: string; sourceOperationId: string; sequence: number; coins: number; appliedAt: Date }>;
};

function assertPositiveOperation(operationId: string, coins: number) {
  if (!operationId.trim() || !Number.isSafeInteger(coins) || coins <= 0) {
    throw Object.assign(new Error("코인 lot 작업 입력이 올바르지 않습니다."), { errorCode: "COIN_LOT_INPUT_INVALID" });
  }
}

/**
 * Read-only provider preflight using the same reservation and expiry policy as
 * the committing debit path. It intentionally does not claim lots; the later
 * debit CAS remains authoritative when concurrent usage races the provider call.
 */
export async function previewCoinLotDebit(input: {
  ownerScope: CoinLotOwnerScope;
  ownerId: string;
  coins: number;
  now?: Date;
  model?: Model<ICoinLotDocument>;
}) {
  assertPositiveOperation("coin-lot-preview", input.coins);
  const model = input.model || await getModel<ICoinLotDocument>(MONGODB_BILLING_URL, "CoinLot", CoinLotSchema, "coin_lots");
  const lots = await model.find({
    ownerScope: input.ownerScope,
    ownerId: input.ownerId,
    status: "active",
    remainingCoins: { $gt: 0 },
    refundReservationState: { $nin: ACTIVE_REFUND_RESERVATIONS },
  }).lean<StoredLot[]>();
  return allocateCoinLots({
    ownerScope: input.ownerScope,
    lots,
    needCoins: input.coins,
    now: input.now || new Date(),
  });
}

/** Billing DB transaction: deterministic allocation plus exact remainingCoins CAS. */
export async function applyCoinLotDebitOnce(input: {
  ownerScope: CoinLotOwnerScope;
  ownerId: string;
  operationId: string;
  coins: number;
  now?: Date;
  model?: Model<ICoinLotDocument>;
}) {
  assertPositiveOperation(input.operationId, input.coins);
  const model = input.model || await getModel<ICoinLotDocument>(MONGODB_BILLING_URL, "CoinLot", CoinLotSchema, "coin_lots");
  const session = await model.db.startSession();
  let result: { debits: CoinLotDebit[]; alreadyApplied: boolean } | undefined;
  try {
    await session.withTransaction(async () => {
      const ownerFilter = { ownerScope: input.ownerScope, ownerId: input.ownerId };
      const replayLots = await model.find(
        { ...ownerFilter, "debitReceipts.operationId": input.operationId },
        { lotId: 1, bucket: 1, debitReceipts: 1 },
      ).session(session).lean<StoredLot[]>();
      const replayDebits = reconstructCoinLotOperationDebits(replayLots, input.operationId);
      if (replayDebits.length) {
        if (coinLotAllocationTotal(replayDebits) !== input.coins) {
          throw Object.assign(new Error("동일 lot 차감 operation의 금액이 충돌합니다."), { errorCode: "COIN_OPERATION_CONFLICT" });
        }
        result = { debits: replayDebits, alreadyApplied: true };
        return;
      }

      const lots = await model.find({
        ...ownerFilter,
        status: "active",
        remainingCoins: { $gt: 0 },
        refundReservationState: { $nin: ACTIVE_REFUND_RESERVATIONS },
      }).session(session).lean<StoredLot[]>();
      const allocation = allocateCoinLots({
        ownerScope: input.ownerScope,
        lots,
        needCoins: input.coins,
        now: input.now || new Date(),
      });
      if (!allocation.ok) {
        throw Object.assign(new Error("사용 가능한 코인 lot이 부족합니다."), { errorCode: allocation.errorCode || "COIN_INSUFFICIENT" });
      }

      const appliedAt = input.now || new Date();
      for (const [sequence, debit] of allocation.debits.entries()) {
        const snapshot = lots.find((lot) => lot.lotId === debit.lotId);
        if (!snapshot) throw new Error(`코인 lot snapshot이 없습니다: ${debit.lotId}`);
        if ((snapshot.debitReceipts || []).length >= 512) {
          throw Object.assign(new Error(`코인 lot 차감 receipt 용량이 가득 찼습니다: ${debit.lotId}`), {
            errorCode: "COIN_LOT_RECEIPT_CAPACITY",
          });
        }
        const nextRemaining = Number(snapshot.remainingCoins) - debit.coins;
        const updated = await model.updateOne(
          {
            ...ownerFilter,
            lotId: debit.lotId,
            status: "active",
            remainingCoins: snapshot.remainingCoins,
            "debitReceipts.operationId": { $ne: input.operationId },
            "debitReceipts.511": { $exists: false },
            refundReservationState: { $nin: ACTIVE_REFUND_RESERVATIONS },
          },
          {
            $inc: { remainingCoins: -debit.coins },
            $set: { status: nextRemaining === 0 ? "exhausted" : "active" },
            $push: { debitReceipts: { operationId: input.operationId, sequence, coins: debit.coins, appliedAt } },
          },
          { session },
        );
        if ((updated.modifiedCount || 0) !== 1) {
          throw Object.assign(new Error(`코인 lot 동시 차감 충돌: ${debit.lotId}`), { errorCode: "COIN_LOT_CAS_CONFLICT" });
        }
      }
      result = { debits: allocation.debits, alreadyApplied: false };
    });
    if (!result) throw new Error("코인 lot 차감 transaction 결과가 없습니다.");
    return result;
  } finally {
    await session.endSession();
  }
}

/** Restores only the exact source lot debits, in reverse order, with a durable receipt. */
export async function applyCoinLotCompensationOnce(input: {
  ownerScope: CoinLotOwnerScope;
  ownerId: string;
  operationId: string;
  sourceOperationId: string;
  coins: number;
  originalDebits: readonly CoinLotDebit[];
  reason: string;
  now?: Date;
  model?: Model<ICoinLotDocument>;
}) {
  assertPositiveOperation(input.operationId, input.coins);
  const plan = buildCoinCompensationPlan({
    operationId: input.operationId,
    sourceOperationId: input.sourceOperationId,
    reason: input.reason,
    coins: input.coins,
    originalDebit: input.originalDebits,
  });
  if ("ok" in plan) throw Object.assign(new Error(plan.message), { errorCode: plan.errorCode });
  const model = input.model || await getModel<ICoinLotDocument>(MONGODB_BILLING_URL, "CoinLot", CoinLotSchema, "coin_lots");
  const session = await model.db.startSession();
  try {
    await session.withTransaction(async () => {
      const ownerFilter = { ownerScope: input.ownerScope, ownerId: input.ownerId };
      const replayCount = await model.countDocuments({
        ...ownerFilter,
        "compensationReceipts.operationId": input.operationId,
      }).session(session);
      if (replayCount === plan.restore.length) return;
      if (replayCount !== 0) throw new Error("부분 적용된 lot 보상 receipt가 감지되었습니다.");

      for (const [sequence, restore] of plan.restore.entries()) {
        const lot = await model.findOne({ ...ownerFilter, lotId: restore.lotId }).session(session).lean<StoredLot>();
        const sourceDebited = (lot?.debitReceipts || [])
          .filter((receipt) => receipt.operationId === input.sourceOperationId)
          .reduce((sum, receipt) => sum + Number(receipt.coins), 0);
        if (!lot || sourceDebited < restore.coins || Number(lot.remainingCoins) + restore.coins > Number(lot.coins)) {
          throw Object.assign(new Error(`원 차감 lot을 정확히 복구할 수 없습니다: ${restore.lotId}`), { errorCode: "COMPENSATION_LOT_CONFLICT" });
        }
        if ((lot.compensationReceipts || []).length >= 512) {
          throw Object.assign(new Error(`코인 lot 보상 receipt 용량이 가득 찼습니다: ${restore.lotId}`), {
            errorCode: "COIN_LOT_COMPENSATION_RECEIPT_CAPACITY",
          });
        }
        const updated = await model.updateOne(
          {
            ...ownerFilter,
            lotId: restore.lotId,
            remainingCoins: lot.remainingCoins,
            "compensationReceipts.operationId": { $ne: input.operationId },
            "compensationReceipts.511": { $exists: false },
          },
          {
            $inc: { remainingCoins: restore.coins },
            $set: { status: "active" },
            $push: {
              compensationReceipts: {
                operationId: input.operationId,
                sourceOperationId: input.sourceOperationId,
                sequence,
                coins: restore.coins,
                appliedAt: input.now || new Date(),
              },
            },
          },
          { session },
        );
        if ((updated.modifiedCount || 0) !== 1) throw new Error(`코인 lot 보상 CAS 충돌: ${restore.lotId}`);
      }
    });
    return { restore: plan.restore, alreadyApplied: false };
  } finally {
    await session.endSession();
  }
}
