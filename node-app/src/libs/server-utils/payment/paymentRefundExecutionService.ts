import "server-only";

import type { Model } from "mongoose";
import type { ICoinLotDocument } from "models/payment";
import type { TossCancelResult } from "./tossPaymentsAdapter";

type UpdateResult = { matchedCount?: number; modifiedCount?: number };
type OwnerWalletModel = {
  updateOne(filter: Record<string, unknown>, update: Record<string, unknown>): PromiseLike<UpdateResult>;
  exists(filter: Record<string, unknown>): PromiseLike<unknown>;
};

type RefundReceipt = {
  operationId: string;
  orderId: string;
  purpose: "coin_pack" | "subscription";
  creditedCoins: number;
  appliedAt: Date;
};

async function applyWalletRefundReceiptOnce(input: {
  model: OwnerWalletModel;
  ownerFilter: Record<string, unknown>;
  balanceFilter: Record<string, unknown>;
  receipt: RefundReceipt;
  update: Record<string, unknown>;
}) {
  const replayFilter = {
    ...input.ownerFilter,
    "wallet.refundReceipts.operationId": input.receipt.operationId,
  };
  if (await input.model.exists(replayFilter)) return "already_applied" as const;
  const result = await input.model.updateOne(
    {
      ...input.ownerFilter,
      ...input.balanceFilter,
      "wallet.refundReceipts.operationId": { $ne: input.receipt.operationId },
      "wallet.refundReceipts.511": { $exists: false },
    },
    {
      ...input.update,
      $push: { "wallet.refundReceipts": input.receipt },
    },
  );
  if ((result.modifiedCount || 0) === 1) return "applied" as const;
  const replay = await input.model.exists(replayFilter);
  if (replay) return "already_applied" as const;
  const saturated = await input.model.exists({
    ...input.ownerFilter,
    "wallet.refundReceipts.511": { $exists: true },
  });
  if (saturated) throw new Error("COIN_WALLET_REFUND_RECEIPT_CAPACITY");
  throw new Error("환불 지갑 잔액 또는 operation receipt가 일치하지 않습니다.");
}

export async function applyUserWalletRefundOnce(input: {
  model: OwnerWalletModel;
  uid: string;
  operationId: string;
  orderId: string;
  purpose: "coin_pack" | "subscription";
  creditedCoins: number;
  appliedAt: Date;
  membershipExpiresAt?: Date;
}) {
  const receipt: RefundReceipt = {
    operationId: input.operationId,
    orderId: input.orderId,
    purpose: input.purpose,
    creditedCoins: input.creditedCoins,
    appliedAt: input.appliedAt,
  };
  if (input.purpose === "coin_pack") {
    return applyWalletRefundReceiptOnce({
      model: input.model,
      ownerFilter: { uid: input.uid },
      balanceFilter: { "wallet.charged.coins": { $gte: input.creditedCoins } },
      receipt,
      update: { $inc: { "wallet.charged.coins": -input.creditedCoins } },
    });
  }
  if (!input.membershipExpiresAt) throw new Error("개인 Membership 환불은 자동 실행할 수 없습니다.");
  return applyWalletRefundReceiptOnce({
    model: input.model,
    ownerFilter: { uid: input.uid },
    balanceFilter: {
      "wallet.membership.coins": input.creditedCoins,
      "wallet.membership.expiresAt": input.membershipExpiresAt,
    },
    receipt,
    update: {
      $set: { "wallet.membership.coins": 0, "subscription.active": false },
    },
  });
}

export async function applyUniverseWalletRefundOnce(input: {
  model: OwnerWalletModel;
  universeId: string;
  operationId: string;
  orderId: string;
  purpose: "coin_pack" | "subscription";
  creditedCoins: number;
  appliedAt: Date;
  membershipExpiresAt?: Date;
}) {
  const receipt: RefundReceipt = {
    operationId: input.operationId,
    orderId: input.orderId,
    purpose: input.purpose,
    creditedCoins: input.creditedCoins,
    appliedAt: input.appliedAt,
  };
  if (input.purpose === "coin_pack") {
    return applyWalletRefundReceiptOnce({
      model: input.model,
      ownerFilter: { id: input.universeId },
      balanceFilter: { "wallet.charged.coins": { $gte: input.creditedCoins } },
      receipt,
      update: { $inc: { "wallet.charged.coins": -input.creditedCoins } },
    });
  }
  if (!input.membershipExpiresAt) throw new Error("Membership 환불 만료 snapshot이 없습니다.");
  return applyWalletRefundReceiptOnce({
    model: input.model,
    ownerFilter: { id: input.universeId },
    balanceFilter: {
      "wallet.membership.coins": input.creditedCoins,
      "wallet.membership.expiresAt": input.membershipExpiresAt,
    },
    receipt,
    update: {
      $set: { "wallet.membership.coins": 0, "wallet.accessState": "suspended" },
    },
  });
}

export type RefundableCoinLot = {
  lotId: string;
  orderId?: string;
  coins: number;
  remainingCoins: number;
  refundOperationId?: string;
  refundReservationOperationId?: string;
  refundReservationState?: "reserved" | "pg_succeeded" | "released" | "refunded";
};

export async function applyCoinLotRefundOnce(input: {
  model: Model<ICoinLotDocument>;
  operationId: string;
  orderId: string;
  lots: readonly RefundableCoinLot[];
  refundedAt: Date;
}) {
  if (!input.lots.length || input.lots.some((lot) => {
    const untouched = lot.remainingCoins === lot.coins &&
      !lot.refundOperationId &&
      lot.refundReservationOperationId === input.operationId &&
      lot.refundReservationState === "pg_succeeded";
    const replay = lot.remainingCoins === 0 && lot.refundOperationId === input.operationId;
    return lot.orderId !== input.orderId || lot.coins <= 0 || (!untouched && !replay);
  })) {
    throw new Error("전액 미사용 lot snapshot이 아닙니다.");
  }
  for (const lot of input.lots) {
    const result = await input.model.updateOne(
      {
        lotId: lot.lotId,
        orderId: input.orderId,
        remainingCoins: lot.coins,
        refundOperationId: { $exists: false },
        refundReservationOperationId: input.operationId,
        refundReservationState: "pg_succeeded",
      },
      {
        $set: {
          remainingCoins: 0,
          status: "exhausted",
          refundOperationId: input.operationId,
          refundedAt: input.refundedAt,
          refundReservationState: "refunded",
        },
      },
    );
    if ((result.modifiedCount || 0) === 1) continue;
    const replay = await input.model.exists({ lotId: lot.lotId, refundOperationId: input.operationId, remainingCoins: 0 });
    if (!replay) throw new Error(`환불 lot CAS 충돌: ${lot.lotId}`);
  }
}

export async function runPaymentRefundPgFirst(input: {
  executionEnabled: boolean;
  pgAlreadySucceeded?: boolean;
  cancelPg: () => Promise<TossCancelResult>;
  markPgSucceeded: () => Promise<void>;
  markWalletPending: () => Promise<void>;
  reverseWalletAndLots: () => Promise<void>;
  markRefunded: () => Promise<void>;
  markManualReview: (code: string, retryable: boolean) => Promise<void>;
}) {
  if (!input.executionEnabled) return "disabled" as const;
  if (!input.pgAlreadySucceeded) {
    const pgResult = await input.cancelPg();
    if (!pgResult.ok) {
      await input.markManualReview(pgResult.code, pgResult.retryable || pgResult.ambiguous);
      return "manual_review" as const;
    }
    await input.markPgSucceeded();
  }
  await input.markWalletPending();
  try {
    await input.reverseWalletAndLots();
  } catch {
    await input.markManualReview("PAYMENT_REFUND_WALLET_RECONCILIATION_REQUIRED", true);
    return "manual_review" as const;
  }
  try {
    await input.markRefunded();
  } catch {
    await input.markManualReview("PAYMENT_REFUND_FINALIZE_CONFLICT", true);
    return "manual_review" as const;
  }
  return "refunded" as const;
}
