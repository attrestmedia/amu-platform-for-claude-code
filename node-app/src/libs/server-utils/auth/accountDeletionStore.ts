import type mongoose from "mongoose";
import type { IAccountDeletionRequestDocument } from "models/user/AccountDeletionRequestSchema";
import {
  ACCOUNT_DELETION_HOLD_REASON_CODES,
  ACCOUNT_DELETION_LEASE_MS,
  ACCOUNT_DELETION_MANUAL_REASON_CODES,
  ACCOUNT_DELETION_MAX_RETRIES,
  calculateAccountDeletionBackoff,
} from "./accountDeletionState";

export type AccountDeletionModel = mongoose.Model<IAccountDeletionRequestDocument>;

export type ClaimedAccountDeletion = Pick<
  IAccountDeletionRequestDocument,
  "requestId" | "uid" | "identityHash" | "status" | "stages" | "retryCount" | "failedStage" | "workflowPhase"
> & { leaseOwner: string };

function isDuplicateKey(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === 11000);
}

export async function claimAccountDeletion(
  model: AccountDeletionModel,
  workerId: string,
  now = new Date(),
  leaseMs = ACCOUNT_DELETION_LEASE_MS,
) {
  const leaseUntil = new Date(now.getTime() + leaseMs);
  const request = await model
    .findOneAndUpdate(
      {
        legalHold: { $exists: false },
        $or: [
          { status: "accepted", $or: [{ nextAttemptAt: null }, { nextAttemptAt: { $exists: false } }, { nextAttemptAt: { $lte: now } }] },
          { status: "failed", retryable: true, nextAttemptAt: { $lte: now }, retryCount: { $lt: ACCOUNT_DELETION_MAX_RETRIES } },
          { status: "processing", workflowPhase: { $ne: "awaiting_finalization" }, leaseUntil: { $lte: now } },
        ],
      },
      {
        $set: { status: "processing", leaseOwner: workerId, leaseUntil, updatedAt: now },
        $inc: { retryCount: 1 },
      },
      { new: true, sort: { nextAttemptAt: 1, createdAt: 1 } },
    )
    .lean();
  if (!request) return null;
  return { ...request, leaseOwner: workerId } as ClaimedAccountDeletion;
}

export async function checkpointAccountDeletion(
  model: AccountDeletionModel,
  requestId: string,
  workerId: string,
  update: Record<string, unknown>,
  now = new Date(),
) {
  const result = await model.updateOne(
    { requestId, status: "processing", leaseOwner: workerId, leaseUntil: { $gt: now } },
    { $set: { ...update, leaseUntil: new Date(now.getTime() + ACCOUNT_DELETION_LEASE_MS), updatedAt: now } },
  );
  return result.modifiedCount === 1;
}

export async function renewAccountDeletionLease(
  model: AccountDeletionModel,
  requestId: string,
  workerId: string,
  now = new Date(),
  leaseMs = ACCOUNT_DELETION_LEASE_MS,
) {
  const result = await model.updateOne(
    { requestId, status: "processing", leaseOwner: workerId, leaseUntil: { $gt: now } },
    { $set: { leaseUntil: new Date(now.getTime() + leaseMs), updatedAt: now } },
  );
  return result.modifiedCount === 1;
}

// awaiting_finalization 전환 시 lease를 해제해 파기 worker가 즉시 claim할 수 있게 한다.
export async function releaseAccountDeletionLease(
  model: AccountDeletionModel,
  requestId: string,
  workerId: string,
  now = new Date(),
) {
  const result = await model.updateOne(
    { requestId, status: "processing", leaseOwner: workerId },
    { $set: { updatedAt: now }, $unset: { leaseOwner: 1, leaseUntil: 1 } },
  );
  return result.modifiedCount === 1;
}

export async function markAccountDeletionFailure(
  model: AccountDeletionModel,
  input: {
    requestId: string;
    workerId: string;
    errorCode: string;
    failedStage: string;
    retryable: boolean;
    retryCount: number;
  },
  now = new Date(),
  jitterMs = 0,
) {
  const deadLettered = !input.retryable || input.retryCount >= ACCOUNT_DELETION_MAX_RETRIES;
  const nextAttemptAt = deadLettered
    ? null
    : new Date(now.getTime() + calculateAccountDeletionBackoff(input.retryCount, jitterMs));
  const result = await model.updateOne(
    { requestId: input.requestId, status: "processing", leaseOwner: input.workerId, leaseUntil: { $gt: now } },
    {
      $set: {
        status: "failed",
        failedStage: input.failedStage,
        retryable: input.retryable && !deadLettered,
        nextAttemptAt,
        lastErrorCode: input.errorCode,
        lastErrorAt: now,
        deadLetteredAt: deadLettered ? now : null,
        updatedAt: now,
      },
      $unset: { leaseOwner: 1, leaseUntil: 1 },
    },
  );
  return { updated: result.modifiedCount === 1, deadLettered, nextAttemptAt };
}

const MANUAL_RETRY_REASONS: Set<string> = new Set(ACCOUNT_DELETION_MANUAL_REASON_CODES);

export async function manualRetryAccountDeletion(
  model: AccountDeletionModel,
  input: { requestId: string; actorHash: string; reasonCode: string },
  now = new Date(),
) {
  if (!/^[a-f0-9]{64}$/.test(input.actorHash) || !MANUAL_RETRY_REASONS.has(input.reasonCode)) {
    return { ok: false as const, errorCode: "MANUAL_RETRY_NOT_ALLOWED" };
  }
  const result = await model.updateOne(
    { requestId: input.requestId, status: "failed", legalHold: { $exists: false } },
    {
      $set: {
        status: "accepted",
        retryable: true,
        nextAttemptAt: now,
        lastErrorAt: null,
        deadLetteredAt: null,
        manualAction: { kind: "retry", actorHash: input.actorHash, reasonCode: input.reasonCode, at: now },
        updatedAt: now,
      },
      $push: { auditEvents: { kind: "manual_retry", actorHash: input.actorHash, reasonCode: input.reasonCode, at: now } },
      $unset: { leaseOwner: 1, leaseUntil: 1, lastErrorCode: 1 },
    },
  );
  return result.modifiedCount === 1
    ? { ok: true as const, requestId: input.requestId, status: "accepted" as const }
    : { ok: false as const, errorCode: "INVALID_STATE" };
}

export async function readAccountDeletionReconciliation(model: AccountDeletionModel) {
  return model.aggregate<{ _id: string; count: number }>([
    { $group: { _id: "$status", count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]).then((rows) => rows.map((row) => ({ status: row._id, count: row.count })));
}

export type AccountDeletionNotificationRecord = {
  eventType: string;
  messageId: string;
  enqueuedAt: Date;
  accepted: boolean;
  errorCode?: string;
};

export async function recordAccountDeletionNotification(
  model: AccountDeletionModel,
  input: { requestId: string; notification: AccountDeletionNotificationRecord },
) {
  const result = await model.updateOne(
    { requestId: input.requestId },
    { $push: { notifications: input.notification } },
  );
  return result.modifiedCount === 1;
}

export async function listAccountDeletionReplayCandidates(model: AccountDeletionModel) {
  return model
    .find({ "notifications.accepted": false }, { requestId: 1, uid: 1, stages: 1, notifications: 1 })
    .lean();
}

export async function markAccountDeletionNotificationAccepted(
  model: AccountDeletionModel,
  input: { requestId: string; messageId: string },
) {
  const result = await model.updateOne(
    { requestId: input.requestId, "notifications.messageId": input.messageId },
    { $set: { "notifications.$.accepted": true }, $unset: { "notifications.$.errorCode": 1 } },
  );
  return result.modifiedCount === 1;
}

export async function holdAccountDeletion(
  model: AccountDeletionModel,
  input: { requestId: string; actorHash: string; reasonCode: string },
  now = new Date(),
) {
  if (!/^[a-f0-9]{64}$/.test(input.actorHash) || !ACCOUNT_DELETION_HOLD_REASON_CODES.includes(input.reasonCode as never)) {
    return { ok: false as const, errorCode: "HOLD_NOT_ALLOWED" };
  }
  const result = await model.updateOne(
    { requestId: input.requestId, status: { $ne: "completed" }, legalHold: { $exists: false } },
    {
      $set: {
        legalHold: { reasonCode: input.reasonCode, actorHash: input.actorHash, at: now },
        manualAction: { kind: "hold", actorHash: input.actorHash, reasonCode: input.reasonCode, at: now },
        retryable: false,
        nextAttemptAt: null,
        updatedAt: now,
      },
      $push: { auditEvents: { kind: "manual_hold", actorHash: input.actorHash, reasonCode: input.reasonCode, at: now } },
      $unset: { leaseOwner: 1, leaseUntil: 1 },
    },
  );
  return result.modifiedCount === 1
    ? { ok: true as const, requestId: input.requestId }
    : { ok: false as const, errorCode: "INVALID_STATE" };
}

export async function releaseAccountDeletionHold(
  model: AccountDeletionModel,
  input: { requestId: string; actorHash: string; reasonCode: string },
  now = new Date(),
) {
  if (!/^[a-f0-9]{64}$/.test(input.actorHash) || !ACCOUNT_DELETION_HOLD_REASON_CODES.includes(input.reasonCode as never)) {
    return { ok: false as const, errorCode: "HOLD_NOT_ALLOWED" };
  }
  const result = await model.updateOne(
    { requestId: input.requestId, legalHold: { $exists: true } },
    {
      $set: {
        manualAction: { kind: "release", actorHash: input.actorHash, reasonCode: input.reasonCode, at: now },
        retryable: true,
        nextAttemptAt: now,
        updatedAt: now,
      },
      $push: { auditEvents: { kind: "manual_release", actorHash: input.actorHash, reasonCode: input.reasonCode, at: now } },
      $unset: { legalHold: 1 },
    },
  );
  return result.modifiedCount === 1
    ? { ok: true as const, requestId: input.requestId }
    : { ok: false as const, errorCode: "INVALID_STATE" };
}

export async function claimAwaitingFinalization(
  model: AccountDeletionModel,
  workerId: string,
  now = new Date(),
  leaseMs = ACCOUNT_DELETION_LEASE_MS,
) {
  const leaseUntil = new Date(now.getTime() + leaseMs);
  const request = await model
    .findOneAndUpdate(
      {
        status: "processing",
        workflowPhase: "awaiting_finalization",
        legalHold: { $exists: false },
        $or: [{ leaseUntil: null }, { leaseUntil: { $exists: false } }, { leaseUntil: { $lte: now } }],
      },
      { $set: { leaseOwner: workerId, leaseUntil, updatedAt: now } },
      { new: true, sort: { updatedAt: 1 } },
    )
    .lean();
  if (!request) return null;
  return { ...request, leaseOwner: workerId };
}

// 최종 파기 완료: completed 전환 + tombstone(keyed hash) 기록 + PII 원문 제거.
// uid·identityHash·멱등키는 삭제하고 requestId·status·시각·tombstoneHash만 남긴다.
export async function completeAccountDeletion(
  model: AccountDeletionModel,
  input: { requestId: string; workerId: string; tombstoneHash: string },
  now = new Date(),
) {
  const result = await model.updateOne(
    { requestId: input.requestId, status: "processing", leaseOwner: input.workerId },
    {
      $set: {
        status: "completed",
        completedAt: now,
        "destruction.tombstoneHash": input.tombstoneHash,
        "destruction.tombstoneAt": now,
        updatedAt: now,
      },
      $unset: {
        leaseOwner: 1,
        leaseUntil: 1,
        nextAttemptAt: 1,
        uid: 1,
        identityHash: 1,
        idempotencyKey: 1,
        activeKey: 1,
        legacyRequestId: 1,
      },
    },
  );
  return result.modifiedCount === 1;
}

export { isDuplicateKey };
