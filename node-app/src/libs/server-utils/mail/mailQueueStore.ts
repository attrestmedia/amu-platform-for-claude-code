import "server-only";

import { MONGODB_AMU_URL } from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import {
  getMailLedgerExpiresAt,
  getMailPayloadExpiresAt,
  type IMailMessageDocument,
  MailMessageSchema,
  type IMailSuppressionDocument,
  MailSuppressionSchema,
} from "models/mail";
import type { MailQueueStore, MailSuppressionMatch } from "./queueTypes";
import { getMailRetryDecision } from "./retryPolicy";

const MESSAGE_MODEL = "MailMessage";
const SUPPRESSION_MODEL = "MailSuppression";

function messageModel() {
  return getModel<IMailMessageDocument>(MONGODB_AMU_URL, MESSAGE_MODEL, MailMessageSchema, "mail_messages");
}

function suppressionModel() {
  return getModel<IMailSuppressionDocument>(
    MONGODB_AMU_URL,
    SUPPRESSION_MODEL,
    MailSuppressionSchema,
    "mail_suppressions",
  );
}

function isDuplicateKey(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === 11000);
}

function terminalFields(now: Date) {
  return {
    completedAt: now,
    payloadExpiresAt: getMailPayloadExpiresAt(now),
    expiresAt: getMailLedgerExpiresAt(now),
    leaseUntil: null,
    nextAttemptAt: null,
  };
}

export const mongoMailQueueStore: MailQueueStore = {
  async createOnce(input) {
    const Model = await messageModel();
    try {
      await Model.create({ ...input, status: "queued", attempts: 0 });
      return { created: true, status: "queued" };
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      const existing = await Model.findOne({ messageId: input.messageId }).select("status").lean();
      if (!existing) throw error;
      return { created: false, status: existing.status };
    }
  },

  async claim(workerId, now, leaseMs) {
    const Model = await messageModel();
    const claimed = await Model.findOneAndUpdate(
      {
        $expr: { $lt: ["$attempts", "$maxAttempts"] },
        $or: [
          { status: "queued", scheduledAt: { $lte: now } },
          {
            status: "retry_wait",
            scheduledAt: { $lte: now },
            $or: [{ nextAttemptAt: null }, { nextAttemptAt: { $lte: now } }],
          },
          { status: "processing", leaseUntil: { $lte: now } },
        ],
      },
      {
        $set: { status: "processing", leaseOwner: workerId, leaseUntil: new Date(now.getTime() + leaseMs) },
        $inc: { attempts: 1 },
      },
      { new: true, sort: { scheduledAt: 1, createdAt: 1 } },
    )
      .select("+recipientEmail +payload")
      .lean();
    if (!claimed?.recipientEmail || !claimed.payload) return null;
    return {
      id: String(claimed._id),
      messageId: claimed.messageId,
      category: claimed.category,
      templateKey: claimed.templateKey,
      locale: claimed.locale,
      recipientEmail: claimed.recipientEmail,
      emailHash: claimed.emailHash,
      payload: claimed.payload,
      configurationSet: claimed.configurationSet,
      attempts: claimed.attempts,
      maxAttempts: claimed.maxAttempts,
    };
  },

  async findSuppression(emailHash, category) {
    const Model = await suppressionModel();
    const row = await Model.findOne({ emailHash, scope: { $in: ["all", category] } })
      .select("scope reason")
      .lean();
    return row ? ({ scope: row.scope, reason: row.reason } satisfies MailSuppressionMatch) : null;
  },

  async markSuppressed(job, workerId, suppression, now) {
    const Model = await messageModel();
    await Model.updateOne(
      { _id: job.id, status: "processing", leaseOwner: workerId },
      {
        $set: {
          status: "suppressed",
          ...terminalFields(now),
          lastError: {
            code: `MAIL_SUPPRESSED_${suppression.reason.toUpperCase()}`,
            reason: `${suppression.scope}:${suppression.reason}`,
            retryable: false,
            occurredAt: now,
          },
        },
        $unset: { leaseOwner: 1 },
      },
    );
  },

  async markSent(job, workerId, providerMessageId, now) {
    const Model = await messageModel();
    await Model.updateOne(
      { _id: job.id, status: "processing", leaseOwner: workerId },
      {
        $set: { status: "sent", ...terminalFields(now), sesMessageId: providerMessageId, sentAt: now, lastError: null },
        $unset: { leaseOwner: 1 },
      },
    );
  },

  async markError(job, workerId, error, now) {
    const Model = await messageModel();
    const decision = getMailRetryDecision({
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      retryable: error.retryable,
      now,
    });
    const update = decision.status === "failed"
      ? { status: decision.status, ...terminalFields(now), lastError: error }
      : {
          status: decision.status,
          leaseUntil: null,
          nextAttemptAt: decision.nextAttemptAt,
          lastError: error,
        };
    await Model.updateOne(
      { _id: job.id, status: "processing", leaseOwner: workerId },
      { $set: update, $unset: { leaseOwner: 1 } },
    );
    return decision.status;
  },

  async defer(job, workerId, nextAttemptAt, error) {
    const Model = await messageModel();
    await Model.updateOne(
      { _id: job.id, status: "processing", leaseOwner: workerId },
      {
        $set: {
          status: "retry_wait",
          scheduledAt: nextAttemptAt,
          nextAttemptAt,
          leaseUntil: null,
          lastError: error,
        },
        $unset: { leaseOwner: 1 },
        // 정책 보류는 장애 재시도가 아니므로 maxAttempts를 소모하지 않는다.
        $inc: { attempts: -1 },
      },
    );
  },

  async purgeExpiredPayloads(now) {
    const Model = await messageModel();
    const result = await Model.updateMany(
      {
        status: { $in: ["sent", "failed", "suppressed", "canceled"] },
        payloadExpiresAt: { $lte: now },
        payloadPurgedAt: null,
      },
      { $unset: { recipientEmail: 1, payload: 1 }, $set: { payloadPurgedAt: now } },
    );
    return result.modifiedCount;
  },
};
