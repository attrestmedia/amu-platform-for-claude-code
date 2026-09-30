import { Schema, type Document } from "mongoose";

/**
 * @docHint
 * @purpose Meta 데이터 삭제 요청의 비식별 확인 코드와 처리 상태 보존
 * @process 삭제 완료 후 confirmation code 저장 → 공개 상태 조회 → 90일 후 TTL 삭제
 * @domain security
 * @scope db_schema
 */

export type MetaDataDeletionStatus = "completed";

export interface IMetaDataDeletionReceiptDocument extends Document {
  confirmationCode: string;
  provider: "threads";
  status: MetaDataDeletionStatus;
  completedAt: Date;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const MetaDataDeletionReceiptSchema = new Schema<IMetaDataDeletionReceiptDocument>(
  {
    confirmationCode: { type: String, required: true, unique: true, index: true },
    provider: { type: String, enum: ["threads"], required: true, index: true },
    status: { type: String, enum: ["completed"], required: true },
    completedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true, collection: "meta_data_deletion_receipts" },
);

MetaDataDeletionReceiptSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
