export type BillingModeType = "calendar" | "anniversary";
export type UniverseWalletAccessStateType = "active" | "suspended" | "closed";
export type UniversePendingRenewalType = {
  orderId: string;
  coins: number;
  startsAt: Date;
  expiresAt: Date;
  renewableAt: Date;
};
export type WalletType = {
  bonus?: { coins: number };
  membership: {
    coins: number;
    expiresAt?: Date;
    lastChargedAt?: Date;
    billingMode?: BillingModeType;
    renewableAt?: Date;
    expiryNoticeSentAt?: Date;
    pendingRenewal?: UniversePendingRenewalType;
  };
  charged: { coins: number };
  accessState?: UniverseWalletAccessStateType;
  lastQualifyingActivityAt?: Date;
  closedAt?: Date;
  closureNoticeSentAt?: Date;
  closureCompletedNoticeSentAt?: Date;
  usageReceipts?: Array<{
    operationId: string;
    sourceOperationId?: string;
    kind: "deduction" | "compensation";
    coins: number;
    walletDebit: { bonusCoins: number; membershipCoins: number; chargedCoins: number };
    appliedAt: Date;
  }>;
};

export type UserPurposeType = typeof import("consts/payment").USER_PURPOSE_TYPES[number];
export type PaymentStatusType = typeof import("consts/payment").PAYMENT_STATUS_TYPES[number];
