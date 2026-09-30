import "server-only";

import crypto from "crypto";
import { MONGODB_SECRETS_URL } from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import {
  MetaDataDeletionReceiptSchema,
  type IMetaDataDeletionReceiptDocument,
} from "models/secure/MetaDataDeletionReceiptSchema";
import { pickString } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose Meta 데이터 삭제 confirmation receipt 생성·공개 상태 조회
 * @process 무작위 확인 코드 저장 → 상태만 조회 → TTL로 자동 만료
 * @domain security
 * @scope server
 */

const RECEIPT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const CONFIRMATION_CODE_PATTERN = /^[a-f0-9]{32}$/;

async function getMetaDataDeletionReceiptModel() {
  return await getModel<IMetaDataDeletionReceiptDocument>(
    MONGODB_SECRETS_URL,
    "MetaDataDeletionReceipt",
    MetaDataDeletionReceiptSchema,
    "meta_data_deletion_receipts",
  );
}

export async function createCompletedMetaDataDeletionReceipt() {
  const model = await getMetaDataDeletionReceiptModel();
  const now = new Date();
  const confirmationCode = crypto.randomBytes(16).toString("hex");
  await model.create({
    confirmationCode,
    provider: "threads",
    status: "completed",
    completedAt: now,
    expiresAt: new Date(now.getTime() + RECEIPT_RETENTION_MS),
  });
  return { confirmationCode, status: "completed" as const, completedAt: now };
}

export async function getMetaDataDeletionReceiptStatus(confirmationCodeRaw: unknown) {
  const confirmationCode = pickString(confirmationCodeRaw).toLowerCase();
  if (!CONFIRMATION_CODE_PATTERN.test(confirmationCode)) return null;
  const model = await getMetaDataDeletionReceiptModel();
  const receipt = await model
    .findOne({ confirmationCode, provider: "threads", expiresAt: { $gt: new Date() } })
    .select({ _id: 0, status: 1, completedAt: 1 })
    .lean();
  if (!receipt) return null;
  return {
    status: receipt.status,
    completedAt: receipt.completedAt instanceof Date ? receipt.completedAt.toISOString() : String(receipt.completedAt || ""),
  };
}
