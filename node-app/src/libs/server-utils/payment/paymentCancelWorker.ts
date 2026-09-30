import "server-only";

import type { Model } from "mongoose";
import type { IPaymentBaseDocument } from "models/payment";
import type { PaymentPgSummary } from "./paymentPgSummary";
import type { TossCancelResult } from "./tossPaymentsAdapter";

const DEFAULT_LEASE_MS = 60_000;
const MAX_ATTEMPTS = 5;
const MAX_BACKOFF_MS = 30 * 60_000;

export type PaymentCancelJob = {
  id: string;
  orderId: string;
  scope: "user" | "universe";
  paymentKey: string;
  leaseOwner: string;
  attempts: number;
  maxAttempts: number;
  stateVersion: number;
};

export type PaymentCancelWorkerStore = {
  claim(now: Date, workerId: string, leaseMs: number): Promise<PaymentCancelJob | null>;
  markCanceled(job: PaymentCancelJob, summary: PaymentPgSummary | undefined, now: Date): Promise<void>;
  markRetry(
    job: PaymentCancelJob,
    input: { code: string; retryable: boolean; occurredAt: Date; nextAttemptAt: Date },
  ): Promise<void>;
  markFailed(job: PaymentCancelJob, input: { code: string; retryable: boolean; occurredAt: Date }, now: Date): Promise<void>;
  markManualReview(job: PaymentCancelJob, input: { code: string; retryable: boolean; occurredAt: Date }, now: Date): Promise<void>;
};

export function computePaymentCancelBackoff(attempts: number, now: Date): Date {
  const exponent = Math.max(0, Math.min(8, Math.floor(attempts) - 1));
  const delay = Math.min(MAX_BACKOFF_MS, 30_000 * 2 ** exponent);
  return new Date(now.getTime() + delay);
}

export function classifyPaymentCancelResult(input: {
  result: TossCancelResult;
  attempts: number;
  maxAttempts?: number;
  now: Date;
}):
  | { kind: "canceled"; summary?: PaymentPgSummary }
  | { kind: "retry"; code: string; retryable: boolean; nextAttemptAt: Date }
  | { kind: "failed"; code: string; retryable: boolean }
  | { kind: "manual_review"; code: string; retryable: boolean } {
  if (input.result.ok) return { kind: "canceled", summary: input.result.summary };

  const maxAttempts = input.maxAttempts || MAX_ATTEMPTS;
  if (input.result.ambiguous && input.attempts >= maxAttempts) {
    return { kind: "manual_review", code: input.result.code, retryable: true };
  }
  if (input.result.retryable && input.attempts < maxAttempts) {
    return {
      kind: "retry",
      code: input.result.code,
      retryable: true,
      nextAttemptAt: computePaymentCancelBackoff(input.attempts, input.now),
    };
  }
  if (input.result.ambiguous) {
    return {
      kind: "retry",
      code: input.result.code,
      retryable: true,
      nextAttemptAt: computePaymentCancelBackoff(input.attempts, input.now),
    };
  }
  return { kind: "failed", code: input.result.code, retryable: false };
}

/**
 * 한 번에 한 건만 처리하는 결제 취소 worker.
 * 실제 Toss 호출은 주입된 adapter로만 수행되어 테스트와 수동 replay에서 외부 호출을 통제할 수 있다.
 */
export async function runPaymentCancelWorkerOnce(input: {
  store: PaymentCancelWorkerStore;
  workerId: string;
  now?: Date;
  leaseMs?: number;
  cancel: (job: PaymentCancelJob) => Promise<TossCancelResult>;
}): Promise<"idle" | "canceled" | "retry" | "failed" | "manual_review"> {
  const now = input.now || new Date();
  const job = await input.store.claim(now, input.workerId, input.leaseMs || DEFAULT_LEASE_MS);
  if (!job) return "idle";

  const result = await input.cancel(job);
  const decision = classifyPaymentCancelResult({
    result,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    now,
  });
  if (decision.kind === "canceled") {
    await input.store.markCanceled(job, decision.summary, now);
    return decision.kind;
  }
  const error = { code: decision.code, retryable: decision.retryable, occurredAt: now };
  if (decision.kind === "retry") {
    await input.store.markRetry(job, { ...error, nextAttemptAt: decision.nextAttemptAt });
    return decision.kind;
  }
  if (decision.kind === "manual_review") {
    await input.store.markManualReview(job, error, now);
    return decision.kind;
  }
  await input.store.markFailed(job, error, now);
  return decision.kind;
}

/**
 * Billing DB용 CAS/lease store. 이 함수는 worker 실행 시에만 호출되며, 모델을 주입받아 환경·DB 연결을 숨긴다.
 */
export function createMongoPaymentCancelStore(model: Model<IPaymentBaseDocument>): PaymentCancelWorkerStore {
  return {
    async claim(now, workerId, leaseMs) {
      const row = await model
        .findOneAndUpdate(
          {
            // 세액 대사 실패는 worker가 취소 대기 상태로 승격한 뒤 처리한다.
            status: { $in: ["cancel_pending", "tax_reconciliation_failed"] },
            $or: [{ leaseUntil: { $exists: false } }, { leaseUntil: { $lte: now } }],
            $and: [{ $or: [{ nextAttemptAt: { $exists: false } }, { nextAttemptAt: { $lte: now } }] }],
          },
          {
            $set: {
              status: "cancel_pending",
              leaseOperation: "cancel",
              leaseOwner: workerId,
              leaseUntil: new Date(now.getTime() + leaseMs),
            },
            $inc: { cancelAttempts: 1, stateVersion: 1 },
          },
          { new: true, sort: { stateChangedAt: 1, createdAt: 1 } },
        )
        .select("+paymentKey")
        .lean();
      if (!row?.paymentKey) return null;
      return {
        id: String(row._id),
        orderId: row.orderId,
        scope: row.scope,
        paymentKey: row.paymentKey,
        leaseOwner: workerId,
        attempts: row.cancelAttempts || 1,
        maxAttempts: MAX_ATTEMPTS,
        stateVersion: row.stateVersion || 0,
      };
    },

    async markCanceled(job, summary, now) {
      await model.updateOne(
        { _id: job.id, status: "cancel_pending", leaseOwner: job.leaseOwner, stateVersion: job.stateVersion },
        {
          $set: {
            status: "canceled",
            ...(summary ? { pgSummary: summary } : {}),
            stateChangedAt: now,
          },
          $inc: { stateVersion: 1 },
          $unset: { leaseOperation: "", leaseOwner: "", leaseUntil: "", nextAttemptAt: "", lastError: "" },
        },
      );
    },

    async markRetry(job, error) {
      await model.updateOne(
        { _id: job.id, status: "cancel_pending", leaseOwner: job.leaseOwner, stateVersion: job.stateVersion },
        {
          $set: { nextAttemptAt: error.nextAttemptAt, lastError: { code: error.code, retryable: true, occurredAt: error.occurredAt } },
          $inc: { stateVersion: 1 },
          $unset: { leaseOperation: "", leaseOwner: "", leaseUntil: "" },
        },
      );
    },

    async markFailed(job, error, now) {
      await model.updateOne(
        { _id: job.id, status: "cancel_pending", leaseOwner: job.leaseOwner, stateVersion: job.stateVersion },
        {
          $set: { status: "cancel_failed", stateChangedAt: now, lastError: error },
          $inc: { stateVersion: 1 },
          $unset: { leaseOperation: "", leaseOwner: "", leaseUntil: "", nextAttemptAt: "" },
        },
      );
    },

    async markManualReview(job, error, now) {
      await model.updateOne(
        { _id: job.id, status: "cancel_pending", leaseOwner: job.leaseOwner, stateVersion: job.stateVersion },
        {
          $set: { status: "manual_review", stateChangedAt: now, lastError: error },
          $inc: { stateVersion: 1 },
          $unset: { leaseOperation: "", leaseOwner: "", leaseUntil: "", nextAttemptAt: "" },
        },
      );
    },
  };
}
