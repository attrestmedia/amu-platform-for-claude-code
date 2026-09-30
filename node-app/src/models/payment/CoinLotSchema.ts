import { Schema, type Document } from "mongoose";
import {
  COIN_LOT_BUCKETS,
  type CoinLotOwnerScope,
  type CoinLotCompensationReceipt,
  type CoinLotDebitReceipt,
  type CoinLotRefundReservationState,
  type CoinLotSource,
  type CoinLotStatus,
} from "types/payment/coinLots";

export interface ICoinLotDocument extends Document {
  lotId: string;
  ownerScope: CoinLotOwnerScope;
  ownerId: string;
  bucket: (typeof COIN_LOT_BUCKETS)[number];
  status: CoinLotStatus;
  coins: number;
  remainingCoins: number;
  orderId?: string;
  sourceOperationId?: string;
  refundOperationId?: string;
  refundedAt?: Date;
  debitReceipts?: CoinLotDebitReceipt[];
  compensationReceipts?: CoinLotCompensationReceipt[];
  refundReservationOperationId?: string;
  refundReservationState?: CoinLotRefundReservationState;
  refundReservedAt?: Date;
  policyVersion: string;
  source: CoinLotSource;
  grantedAt: Date;
  purchasedAt?: Date;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const CoinLotSchema = new Schema<ICoinLotDocument>(
  {
    lotId: { type: String, required: true, trim: true },
    ownerScope: { type: String, required: true, enum: ["user", "universe"] },
    ownerId: { type: String, required: true, trim: true, index: true },
    bucket: { type: String, required: true, enum: COIN_LOT_BUCKETS },
    status: { type: String, required: true, enum: ["active", "exhausted", "expired", "legacy_review"], default: "active" },
    coins: { type: Number, required: true, min: 0 },
    remainingCoins: { type: Number, required: true, min: 0 },
    orderId: { type: String, trim: true, index: true },
    sourceOperationId: { type: String, trim: true },
    refundOperationId: { type: String, trim: true },
    refundedAt: { type: Date },
    debitReceipts: {
      type: [new Schema({ operationId: { type: String, required: true }, sequence: { type: Number, required: true, min: 0 }, coins: { type: Number, required: true, min: 1 }, appliedAt: { type: Date, required: true } }, { _id: false })],
      default: [],
      validate: { validator: (rows: unknown[]) => rows.length <= 512, message: "coin lot debit receipt capacity exceeded" },
    },
    compensationReceipts: {
      type: [new Schema({ operationId: { type: String, required: true }, sourceOperationId: { type: String, required: true }, sequence: { type: Number, required: true, min: 0 }, coins: { type: Number, required: true, min: 1 }, appliedAt: { type: Date, required: true } }, { _id: false })],
      default: [],
      validate: { validator: (rows: unknown[]) => rows.length <= 512, message: "coin lot compensation receipt capacity exceeded" },
    },
    refundReservationOperationId: { type: String, trim: true },
    refundReservationState: { type: String, enum: ["reserved", "pg_succeeded", "released", "refunded"] },
    refundReservedAt: { type: Date },
    policyVersion: { type: String, required: true, trim: true },
    source: {
      type: String,
      required: true,
      enum: ["payment", "membership_grant", "admin_grant", "legacy_migration", "compensation"],
    },
    grantedAt: { type: Date, required: true },
    purchasedAt: { type: Date },
    expiresAt: { type: Date },
  },
  { collection: "coin_lots", timestamps: true },
);

CoinLotSchema.index({ lotId: 1 }, { unique: true, name: "coin_lot_id_unique" });
CoinLotSchema.index(
  { ownerScope: 1, ownerId: 1, bucket: 1, status: 1, expiresAt: 1, grantedAt: 1 },
  { name: "coin_lot_allocation_order" },
);
CoinLotSchema.index({ sourceOperationId: 1, bucket: 1 }, { unique: true, sparse: true, name: "coin_lot_source_bucket_unique" });
CoinLotSchema.index({ refundOperationId: 1 }, { sparse: true, name: "coin_lot_refund_operation" });
CoinLotSchema.index(
  { refundReservationOperationId: 1, refundReservationState: 1 },
  { sparse: true, name: "coin_lot_refund_reservation" },
);
