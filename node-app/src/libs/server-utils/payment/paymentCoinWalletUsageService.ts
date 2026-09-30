import "server-only";

export type WalletDebit = { bonusCoins: number; membershipCoins: number; chargedCoins: number };

export type WalletUsageReceipt = {
  operationId: string;
  sourceOperationId?: string;
  kind: "deduction" | "compensation";
  coins: number;
  walletDebit: WalletDebit;
  appliedAt: Date;
};

export type OwnerWalletUsageModel = {
  updateOne(filter: Record<string, unknown>, update: Record<string, unknown>): PromiseLike<{ modifiedCount?: number }>;
  exists(filter: Record<string, unknown>): PromiseLike<unknown>;
};

export async function assertWalletUsageReceiptCapacity(input: {
  model: Pick<OwnerWalletUsageModel, "exists">;
  ownerFilter: Record<string, unknown>;
  operationId?: string;
}) {
  const operationId = String(input.operationId || "").trim();
  if (
    operationId &&
    await input.model.exists({
      ...input.ownerFilter,
      "wallet.usageReceipts.operationId": operationId,
    })
  ) {
    return "already_applied" as const;
  }
  const saturated = await input.model.exists({
    ...input.ownerFilter,
    "wallet.usageReceipts.511": { $exists: true },
  });
  if (saturated) {
    throw Object.assign(new Error("지갑 usage receipt 용량이 가득 찼습니다."), {
      errorCode: "COIN_WALLET_RECEIPT_CAPACITY",
    });
  }
  return "available" as const;
}

export async function applyWalletUsageOnce(input: {
  model: OwnerWalletUsageModel;
  ownerFilter: Record<string, unknown>;
  debit: WalletDebit;
  receipt: WalletUsageReceipt;
}) {
  const capacity = await assertWalletUsageReceiptCapacity({
    model: input.model,
    ownerFilter: input.ownerFilter,
    operationId: input.receipt.operationId,
  });
  if (capacity === "already_applied") return capacity;
  const replayFilter = {
    ...input.ownerFilter,
    "wallet.usageReceipts.operationId": input.receipt.operationId,
  };
  const balanceFilter: Record<string, unknown> = {};
  const increments: Record<string, number> = {};
  const direction = input.receipt.kind === "deduction" ? -1 : 1;
  if (input.debit.bonusCoins > 0) {
    if (direction < 0) balanceFilter["wallet.bonus.coins"] = { $gte: input.debit.bonusCoins };
    increments["wallet.bonus.coins"] = direction * input.debit.bonusCoins;
  }
  if (input.debit.membershipCoins > 0) {
    if (direction < 0) balanceFilter["wallet.membership.coins"] = { $gte: input.debit.membershipCoins };
    increments["wallet.membership.coins"] = direction * input.debit.membershipCoins;
  }
  if (input.debit.chargedCoins > 0) {
    if (direction < 0) balanceFilter["wallet.charged.coins"] = { $gte: input.debit.chargedCoins };
    increments["wallet.charged.coins"] = direction * input.debit.chargedCoins;
  }
  const update: Record<string, unknown> = {
    $inc: increments,
    $push: { "wallet.usageReceipts": input.receipt },
  };
  if (input.receipt.kind === "deduction") {
    update.$set = { "wallet.lastQualifyingActivityAt": input.receipt.appliedAt };
  }
  const applied = await input.model.updateOne(
    {
      ...input.ownerFilter,
      ...balanceFilter,
      "wallet.usageReceipts.operationId": { $ne: input.receipt.operationId },
      "wallet.usageReceipts.511": { $exists: false },
    },
    update,
  );
  if ((applied.modifiedCount || 0) === 1) return "applied" as const;
  const replay = await input.model.exists(replayFilter);
  if (replay) return "already_applied" as const;
  const saturated = await input.model.exists({
    ...input.ownerFilter,
    "wallet.usageReceipts.511": { $exists: true },
  });
  if (saturated) {
    throw Object.assign(new Error("지갑 usage receipt 용량이 가득 찼습니다."), {
      errorCode: "COIN_WALLET_RECEIPT_CAPACITY",
    });
  }
  throw Object.assign(new Error("지갑 잔액 또는 usage receipt가 일치하지 않습니다."), { errorCode: "COIN_WALLET_CAS_CONFLICT" });
}
