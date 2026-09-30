export const COIN_LOT_BUCKETS = [
  "membership",
  "purchase_bonus",
  "promo_bonus",
  "legacy_unattributed",
  "paid",
] as const;

export type CoinLotBucket = (typeof COIN_LOT_BUCKETS)[number];
export type CoinLotOwnerScope = "user" | "universe";
export type CoinLotStatus = "active" | "exhausted" | "expired" | "legacy_review";
export type CoinLotSource =
  | "payment"
  | "membership_grant"
  | "admin_grant"
  | "legacy_migration"
  | "compensation";

export type CoinLotDebit = {
  lotId: string;
  bucket: CoinLotBucket;
  coins: number;
};

export type CoinLotDebitReceipt = {
  operationId: string;
  sequence: number;
  coins: number;
  appliedAt: Date | string;
};

export type CoinLotCompensationReceipt = CoinLotDebitReceipt & {
  sourceOperationId: string;
};

export type CoinLotRefundReservationState = "reserved" | "pg_succeeded" | "released" | "refunded";

export type CoinLotSnapshot = {
  lotId: string;
  ownerScope: CoinLotOwnerScope;
  ownerId: string;
  bucket: CoinLotBucket;
  coins: number;
  remainingCoins: number;
  grantedAt: Date | string;
  purchasedAt?: Date | string;
  expiresAt?: Date | string;
  orderId?: string;
  status?: CoinLotStatus;
  refundReservationOperationId?: string;
  refundReservationState?: CoinLotRefundReservationState;
};

export type CoinLotCredit = CoinLotSnapshot & {
  policyVersion: string;
  source: CoinLotSource;
  sourceOperationId?: string;
};
