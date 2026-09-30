import "server-only";

import type { Model } from "mongoose";
import type { ICoinLotDocument, IPaymentOperationDocument } from "models/payment";
import type { CoinLotCredit } from "types/payment/coinLots";
import { buildCoinLotCreditPlan } from "./coinLotPolicy";
import { buildPaymentIdempotencyKey } from "./paymentStateService";

type UpdateResult = { matchedCount?: number; modifiedCount?: number };
type OwnerWalletModel = {
  updateOne(filter: Record<string, unknown>, update: Record<string, unknown>): PromiseLike<UpdateResult>;
  exists(filter: Record<string, unknown>): PromiseLike<unknown>;
};

export type PaymentCoinLotCreditInput = {
  orderId: string;
  scope: "user" | "universe";
  ownerId: string;
  purpose: "coin_pack" | "subscription";
  paidCoins: number;
  bonusCoins: number;
  creditedCoins: number;
  membershipExpiresAt?: Date;
  policyVersion?: string;
  grantedAt: Date;
};

type WalletReceipt = {
  operationId: string;
  orderId: string;
  purpose: "coin_pack" | "subscription";
  creditedCoins: number;
  appliedAt: Date;
};

export function buildPaymentCoinLotCreditOperationId(orderId: string) {
  return buildPaymentIdempotencyKey(orderId, "confirm", "coin-lot-credit");
}

function assertCreditInput(input: PaymentCoinLotCreditInput) {
  if (!input.orderId.trim() || !input.ownerId.trim()) throw new Error("결제 lot 귀속 식별자가 없습니다.");
  for (const [field, value] of [
    ["paidCoins", input.paidCoins],
    ["bonusCoins", input.bonusCoins],
    ["creditedCoins", input.creditedCoins],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${field} 스냅샷이 올바르지 않습니다.`);
  }
  if (input.paidCoins + input.bonusCoins !== input.creditedCoins || input.creditedCoins <= 0) {
    throw new Error("결제 coin 스냅샷 합계가 일치하지 않습니다.");
  }
}

function sameCredit(left: CoinLotCredit, right: CoinLotCredit) {
  return left.lotId === right.lotId &&
    left.ownerScope === right.ownerScope &&
    left.ownerId === right.ownerId &&
    left.bucket === right.bucket &&
    left.coins === right.coins &&
    left.remainingCoins === right.remainingCoins &&
    left.orderId === right.orderId &&
    left.policyVersion === right.policyVersion &&
    left.source === right.source &&
    left.sourceOperationId === right.sourceOperationId &&
    new Date(left.grantedAt).getTime() === new Date(right.grantedAt).getTime() &&
    new Date(left.expiresAt || 0).getTime() === new Date(right.expiresAt || 0).getTime();
}

export function buildPaymentCoinLotCredits(input: PaymentCoinLotCreditInput) {
  assertCreditInput(input);
  const operationId = buildPaymentCoinLotCreditOperationId(input.orderId);
  const credits = buildCoinLotCreditPlan({
    ownerScope: input.scope,
    ownerId: input.ownerId,
    orderId: input.orderId,
    operationId,
    purpose: input.purpose,
    paidCoins: input.paidCoins,
    bonusCoins: input.bonusCoins,
    creditedCoins: input.creditedCoins,
    membershipExpiresAt: input.membershipExpiresAt,
    policyVersion: input.policyVersion,
    grantedAt: input.grantedAt,
  });
  return { operationId, credits };
}

export async function preparePaymentCoinLotCreditOperation(
  operationModel: Model<IPaymentOperationDocument>,
  input: PaymentCoinLotCreditInput,
) {
  const { operationId, credits } = buildPaymentCoinLotCredits(input);
  const operation = await operationModel.findOneAndUpdate(
    { operationKey: operationId },
    {
      $setOnInsert: {
        operationKey: operationId,
        idempotencyKey: operationId,
        orderId: input.orderId,
        scope: input.scope,
        operation: "confirm",
        status: "pending",
        stage: "created",
        attempts: 0,
        maxAttempts: 5,
        coinLotCredits: credits,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).select("+coinLotCredits");
  if (!operation) throw new Error("결제 lot operation을 준비하지 못했습니다.");
  const recorded = operation.coinLotCredits || [];
  if (operation.orderId !== input.orderId || operation.scope !== input.scope || recorded.length !== credits.length ||
    !credits.every((credit) => recorded.some((row) => sameCredit(row, credit)))) {
    await operationModel.updateOne(
      { operationKey: operationId },
      { $set: { status: "manual_review", stage: "manual_review", reasonCode: "COIN_LOT_OPERATION_SNAPSHOT_MISMATCH" } },
    );
    throw new Error("결제 lot operation 스냅샷이 기존 기록과 일치하지 않습니다.");
  }
  if (["failed", "manual_review"].includes(operation.status) || operation.stage === "manual_review") {
    throw new Error("결제 lot operation은 수동 검토가 필요합니다.");
  }
  return { operationId, credits, status: operation.status, stage: operation.stage };
}

async function applyWalletReceiptOnce(input: {
  model: OwnerWalletModel;
  ownerFilter: Record<string, unknown>;
  receipt: WalletReceipt;
  update: Record<string, unknown>;
}) {
  const replayFilter = {
    ...input.ownerFilter,
    "wallet.paymentReceipts.operationId": input.receipt.operationId,
  };
  if (await input.model.exists(replayFilter)) return "already_applied" as const;
  const result = await input.model.updateOne(
    {
      ...input.ownerFilter,
      "wallet.paymentReceipts.operationId": { $ne: input.receipt.operationId },
      "wallet.paymentReceipts.511": { $exists: false },
    },
    {
      ...input.update,
      $push: { "wallet.paymentReceipts": input.receipt },
    },
  );
  if ((result.modifiedCount || 0) === 1) return "applied" as const;
  const replay = await input.model.exists(replayFilter);
  if (replay) return "already_applied" as const;
  const saturated = await input.model.exists({
    ...input.ownerFilter,
    "wallet.paymentReceipts.511": { $exists: true },
  });
  if (saturated) throw new Error("COIN_WALLET_PAYMENT_RECEIPT_CAPACITY");
  throw new Error("결제 지갑 operation 대상을 찾지 못했습니다.");
}

export async function applyUserWalletCreditOnce(input: {
  model: OwnerWalletModel;
  uid: string;
  operationId: string;
  orderId: string;
  purpose: "coin_pack" | "subscription";
  creditedCoins: number;
  appliedAt: Date;
  accountType?: string;
  membership?: Record<string, unknown>;
  subscription?: Record<string, unknown>;
}) {
  const receipt: WalletReceipt = {
    operationId: input.operationId,
    orderId: input.orderId,
    purpose: input.purpose,
    creditedCoins: input.creditedCoins,
    appliedAt: input.appliedAt,
  };
  if (input.purpose === "coin_pack") {
    return applyWalletReceiptOnce({
      model: input.model,
      ownerFilter: { uid: input.uid },
      receipt,
      update: {
        $inc: { "wallet.charged.coins": input.creditedCoins },
        ...(input.accountType ? { $set: { accountType: input.accountType } } : {}),
      },
    });
  }
  if (!input.membership || !input.subscription) throw new Error("개인 Membership 지갑 스냅샷이 없습니다.");
  return applyWalletReceiptOnce({
    model: input.model,
    ownerFilter: { uid: input.uid },
    receipt,
    update: { $set: { "wallet.membership": input.membership, subscription: input.subscription } },
  });
}

export async function applyUniverseWalletCreditOnce(input: {
  model: OwnerWalletModel;
  universeId: string;
  operationId: string;
  orderId: string;
  purpose: "coin_pack" | "subscription";
  creditedCoins: number;
  appliedAt: Date;
  membershipUpdate?: Record<string, unknown>;
}) {
  const receipt: WalletReceipt = {
    operationId: input.operationId,
    orderId: input.orderId,
    purpose: input.purpose,
    creditedCoins: input.creditedCoins,
    appliedAt: input.appliedAt,
  };
  if (input.purpose === "coin_pack") {
    return applyWalletReceiptOnce({
      model: input.model,
      ownerFilter: { id: input.universeId },
      receipt,
      update: { $inc: { "wallet.charged.coins": input.creditedCoins } },
    });
  }
  if (!input.membershipUpdate) throw new Error("유니버스 Membership 지갑 스냅샷이 없습니다.");
  return applyWalletReceiptOnce({
    model: input.model,
    ownerFilter: { id: input.universeId },
    receipt,
    update: { $set: input.membershipUpdate },
  });
}

export async function markPaymentWalletCreditCommitted(
  operationModel: Model<IPaymentOperationDocument>,
  operationId: string,
) {
  const result = await operationModel.updateOne(
    { operationKey: operationId, status: { $in: ["pending", "processing"] } },
    { $set: { status: "processing", stage: "wallet_committed" }, $inc: { attempts: 1 } },
  );
  if ((result.matchedCount || 0) !== 1) {
    const completed = await operationModel.exists({ operationKey: operationId, status: "succeeded", stage: "lot_committed" });
    if (!completed) throw new Error("결제 지갑 operation 상태가 충돌했습니다.");
  }
}

export async function applyPaymentCoinLotCredits(input: {
  operationModel: Model<IPaymentOperationDocument>;
  coinLotModel: Model<ICoinLotDocument>;
  operationId: string;
  credits: readonly CoinLotCredit[];
}) {
  try {
    await input.coinLotModel.bulkWrite(
      input.credits.map((credit) => {
        const { grantedAt, purchasedAt, expiresAt, ...rest } = credit;
        const document: Partial<ICoinLotDocument> = {
          ...rest,
          grantedAt: new Date(grantedAt),
          ...(purchasedAt ? { purchasedAt: new Date(purchasedAt) } : {}),
          ...(expiresAt ? { expiresAt: new Date(expiresAt) } : {}),
        };
        return {
          updateOne: {
            filter: { lotId: credit.lotId },
            update: { $setOnInsert: document },
            upsert: true,
          },
        };
      }),
      { ordered: true },
    );
    const stored = await input.coinLotModel.find({ sourceOperationId: input.operationId }).lean<CoinLotCredit[]>();
    if (stored.length !== input.credits.length || !input.credits.every((credit) => stored.some((row) => sameCredit(row, credit)))) {
      throw new Error("결제 lot shadow 검증에 실패했습니다.");
    }
    const committed = await input.operationModel.updateOne(
      { operationKey: input.operationId, stage: { $in: ["wallet_committed", "lot_committed"] } },
      { $set: { status: "succeeded", stage: "lot_committed" }, $unset: { reasonCode: "", lastError: "" } },
    );
    if ((committed.matchedCount || 0) !== 1) throw new Error("결제 lot operation 완료 상태가 충돌했습니다.");
    return "applied" as const;
  } catch (error) {
    await input.operationModel.updateOne(
      { operationKey: input.operationId },
      {
        $set: {
          status: "manual_review",
          stage: "manual_review",
          reasonCode: "COIN_LOT_CREDIT_RECONCILIATION_REQUIRED",
          lastError: { code: "COIN_LOT_CREDIT_RECONCILIATION_REQUIRED", retryable: true, occurredAt: new Date() },
        },
      },
    );
    throw error;
  }
}
