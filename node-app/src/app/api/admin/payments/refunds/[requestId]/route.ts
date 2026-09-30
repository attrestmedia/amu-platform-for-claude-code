import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getModel } from "libs/database/modelCache";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import type { AuthenticatedUserType, NextRouteContext } from "libs/server-utils/api/_helpers";
import { calculateCoinRefundDecision } from "libs/server-utils/payment/coinRefundPolicy";
import {
  applyCoinLotRefundOnce,
  applyUniverseWalletRefundOnce,
  applyUserWalletRefundOnce,
  runPaymentRefundPgFirst,
} from "libs/server-utils/payment/paymentRefundExecutionService";
import { isPaymentRefundExecutionEnabled } from "libs/server-utils/payment/paymentRefundSaga";
import { cancelTossPayment } from "libs/server-utils/payment/tossPaymentsAdapter";
import { buildPaymentAuditEventId } from "libs/server-utils/payment/paymentAuditService";
import { buildPaymentNotificationOutboxInput } from "libs/server-utils/payment/paymentNotificationContract";
import { buildPaymentStatusMail } from "libs/server-utils/mail/internalNotificationBuilder";
import { enqueueInternalNotification } from "libs/server-utils/mail/internalNotification";
import { MONGODB_AMU_URL, MONGODB_BILLING_URL, MONGODB_USERS_URL, TOSS_CONFIRM_URL } from "consts/env/server";
import { MONGODB_USER_MODEL_PREFIX } from "consts/db";
import {
  CoinLotSchema,
  PaymentAuditSchema,
  PaymentBaseModel,
  PaymentNotificationOutboxSchema,
  PaymentOperationSchema,
  PaymentRefundRequestSchema,
} from "models/payment";
import type {
  ICoinLotDocument,
  IPaymentAuditDocument,
  IPaymentNotificationOutboxDocument,
  IPaymentOperationDocument,
  IPaymentRefundRequestDocument,
} from "models/payment";
import { UserSchema } from "models/user";
import type { IUserDocument } from "models/user";
import { UniverseSchema } from "models/universe";
import type { IUniverseDocument } from "models/universe";
import type { CoinLotSnapshot } from "types/payment/coinLots";
import type { PaymentStatusType } from "types/payment";
import type { PaymentRefundRequestStatus } from "models/payment";
import type { UnknownRecord } from "utils/common";

type RefundPaymentRecord = {
  _id?: unknown;
  scope?: "user" | "universe";
  orderId?: string;
  uid?: string;
  universeId?: string;
  purpose?: "coin_pack" | "subscription";
  renewalMode?: "immediate" | "scheduled";
  amount?: number;
  paidCoins?: number;
  bonusCoins?: number;
  status?: PaymentStatusType;
  stateVersion?: number;
  appliedAt?: Date;
  createdAt?: Date;
  periodEndsAt?: Date;
  paymentKey?: string;
};

type RefundRequestRecord = {
  requestId: string;
  operationId: string;
  orderId: string;
  status: PaymentRefundRequestStatus;
  reasonCode: string;
  refundAmount?: number;
  lotIds?: string[];
  reservedLots?: Array<{ lotId: string; bucket: string; coins: number; remainingCoins: number }>;
  reservationState?: "reserved" | "pg_succeeded" | "released" | "refunded" | "not_required";
  stateVersion: number;
  pgCompletedAt?: Date;
};
type RefundLotSnapshot = CoinLotSnapshot & { refundOperationId?: string };

const RETRYABLE_MANUAL_REASONS = new Set([
  "TOSS_CANCEL_TIMEOUT",
  "TOSS_CANCEL_NETWORK_ERROR",
  "TOSS_CANCEL_RESPONSE_AMBIGUOUS",
  "PAYMENT_REFUND_WALLET_RECONCILIATION_REQUIRED",
]);
const EXECUTABLE_REFUND_STATUSES = new Set<PaymentRefundRequestStatus>([
  "approved",
  "manual_review",
  "pg_pending",
  "pg_succeeded",
  "wallet_pending",
]);
const REFUND_EXECUTION_LEASE_MS = 5 * 60 * 1000;

function buildRefundExecutionLeaseUntil() {
  return new Date(Date.now() + REFUND_EXECUTION_LEASE_MS);
}

function isRetryableManualReason(reasonCode: string) {
  return RETRYABLE_MANUAL_REASONS.has(reasonCode) || /^TOSS_CANCEL_HTTP_(408|409|429|5\d\d)$/.test(reasonCode);
}

async function handlePOST(body: UnknownRecord, user: AuthenticatedUserType, _request: Request, context: NextRouteContext) {
  const requestId = String(context?.params?.requestId || "").trim();
  const action = String(body?.action || "").trim();
  if (!requestId || requestId.length > 200 || !["approve", "replay"].includes(action)) {
    return NextResponse.json({ error: "유효하지 않은 환불 실행 요청입니다.", errorCode: "PAYMENT_REFUND_ADMIN_INPUT_INVALID" }, { status: 400 });
  }

  const RefundRequest = await getModel<IPaymentRefundRequestDocument>(
    MONGODB_BILLING_URL,
    "PaymentRefundRequest",
    PaymentRefundRequestSchema,
    "payment_refund_requests",
  );
  let refund = await RefundRequest.findOne({ requestId }).select("+lotIds +reservedLots +approvedByUid").lean<RefundRequestRecord>();
  if (!refund) return NextResponse.json({ error: "환불 요청을 찾을 수 없습니다.", errorCode: "PAYMENT_REFUND_NOT_FOUND" }, { status: 404 });

  const adminUid = String(user?.uid || user?.ID || "").trim();
  if (action === "approve") {
    if (refund.status !== "requested") {
      return NextResponse.json({ error: "자동 환불 후보만 승인할 수 있습니다.", errorCode: "PAYMENT_REFUND_APPROVAL_CONFLICT" }, { status: 409 });
    }
    refund = await RefundRequest.findOneAndUpdate(
      { requestId, status: "requested", stateVersion: refund.stateVersion },
      {
        $set: { status: "approved", approvedByUid: adminUid, approvedAt: new Date() },
        $inc: { stateVersion: 1 },
      },
      { new: true },
    ).select("+lotIds +reservedLots +approvedByUid").lean<RefundRequestRecord>();
    if (!refund) return NextResponse.json({ error: "환불 승인 상태가 변경되었습니다.", errorCode: "PAYMENT_REFUND_APPROVAL_CONFLICT" }, { status: 409 });
  } else if (refund.status === "manual_review" && !isRetryableManualReason(refund.reasonCode)) {
    return NextResponse.json({ error: "이 수동 검토 건은 자동 replay할 수 없습니다.", errorCode: "PAYMENT_REFUND_MANUAL_ONLY" }, { status: 409 });
  }
  if (action === "replay" && refund.status === "requested") {
    return NextResponse.json({ error: "먼저 환불 요청을 승인해야 합니다.", errorCode: "PAYMENT_REFUND_APPROVAL_REQUIRED" }, { status: 409 });
  }

  if (!isPaymentRefundExecutionEnabled()) {
    return NextResponse.json(
      { ok: true, request: { requestId, status: refund.status }, execution: "disabled" },
      { status: 202 },
    );
  }
  if (!EXECUTABLE_REFUND_STATUSES.has(refund.status)) {
    return NextResponse.json(
      { error: "현재 환불 요청 상태는 실행할 수 없습니다.", errorCode: "PAYMENT_REFUND_EXECUTION_CONFLICT" },
      { status: 409 },
    );
  }

  const Payment = await getModel<RefundPaymentRecord>(MONGODB_BILLING_URL, "PaymentBase", PaymentBaseModel.schema, "payments");
  const payment = await Payment.findOne({ orderId: refund.orderId })
    .select("+paymentKey scope orderId uid universeId purpose renewalMode amount paidCoins bonusCoins status stateVersion appliedAt createdAt periodEndsAt");
  if (!payment || !payment.paymentKey || !payment.scope || !payment.orderId || !payment.purpose) {
    return NextResponse.json({ error: "환불 결제 snapshot이 없습니다.", errorCode: "PAYMENT_REFUND_PAYMENT_INVALID" }, { status: 409 });
  }
  const paymentOrderId = payment.orderId;
  const paymentScope = payment.scope;
  const paymentPurpose = payment.purpose;
  const paymentKey = payment.paymentKey;
  const refundOperationId = refund.operationId;
  if (!["confirmed", "refund_pending"].includes(String(payment.status)) || payment.renewalMode === "scheduled") {
    return NextResponse.json({ error: "자동 환불 실행이 허용되지 않는 결제입니다.", errorCode: "PAYMENT_REFUND_EXECUTION_CONFLICT" }, { status: 409 });
  }

  const ownerId = paymentScope === "user" ? String(payment.uid || "") : String(payment.universeId || "");
  const CoinLot = await getModel<ICoinLotDocument>(MONGODB_BILLING_URL, "CoinLot", CoinLotSchema, "coin_lots");
  const lots = await CoinLot.find({ ownerScope: paymentScope, ownerId, orderId: paymentOrderId }).lean<RefundLotSnapshot[]>();
  const pgAlreadySucceeded = Boolean(refund.pgCompletedAt) || ["pg_succeeded", "wallet_pending"].includes(refund.status);
  const decision = calculateCoinRefundDecision({
    order: {
      orderId: paymentOrderId,
      purpose: paymentPurpose,
      purchasedAt: payment.appliedAt || payment.createdAt || new Date(0),
      amount: Number(payment.amount),
      paidCoins: Number(payment.paidCoins),
      bonusCoins: Number(payment.bonusCoins),
    },
    lots,
  });
  const expectedLotIds = [...(refund.lotIds || [])].sort();
  const actualLotIds = lots.map((lot) => lot.lotId).sort();
  const pgSucceededReplaySafe = pgAlreadySucceeded && lots.length > 0 && lots.every((lot) =>
    (lot.remainingCoins === lot.coins && !lot.refundOperationId &&
      lot.refundReservationOperationId === refundOperationId &&
      lot.refundReservationState === "pg_succeeded") ||
    (lot.remainingCoins === 0 && lot.refundOperationId === refundOperationId));
  const prePgSnapshotSafe = !pgAlreadySucceeded &&
    decision.decision === "auto_refund" &&
    decision.refundAmount === refund.refundAmount &&
    refund.reservationState === "reserved" &&
    lots.every((lot) => lot.remainingCoins === lot.coins &&
      lot.refundReservationOperationId === refundOperationId &&
      lot.refundReservationState === "reserved");
  if ((!prePgSnapshotSafe && !pgSucceededReplaySafe) || JSON.stringify(actualLotIds) !== JSON.stringify(expectedLotIds)) {
    const snapshotRejected = await RefundRequest.updateOne(
      {
        requestId,
        status: refund.status,
        stateVersion: refund.stateVersion,
        $or: [{ leaseUntil: { $exists: false } }, { leaseUntil: { $lte: new Date() } }],
      },
      { $set: { status: "manual_review", reasonCode: "PAYMENT_REFUND_SNAPSHOT_CHANGED" }, $inc: { stateVersion: 1 } },
    );
    if ((snapshotRejected.matchedCount || 0) !== 1) {
      return NextResponse.json({ error: "다른 환불 실행이 진행 중입니다.", errorCode: "PAYMENT_REFUND_EXECUTION_CONFLICT" }, { status: 409 });
    }
    return NextResponse.json({ error: "환불 snapshot이 변경되어 수동 검토가 필요합니다.", errorCode: "PAYMENT_REFUND_SNAPSHOT_CHANGED" }, { status: 409 });
  }

  const PaymentOperation = await getModel<IPaymentOperationDocument>(
    MONGODB_BILLING_URL,
    "PaymentOperation",
    PaymentOperationSchema,
    "payment_operations",
  );
  const PaymentAudit = await getModel<IPaymentAuditDocument>(MONGODB_BILLING_URL, "PaymentAudit", PaymentAuditSchema, "payment_audits");
  const PaymentOutbox = await getModel<IPaymentNotificationOutboxDocument>(
    MONGODB_BILLING_URL,
    "PaymentNotificationOutbox",
    PaymentNotificationOutboxSchema,
    "payment_notification_outbox",
  );
  const claimNow = new Date();
  const claimOwner = `payment-refund:${randomUUID()}`;
  const claimedStatus = pgAlreadySucceeded ? "wallet_pending" : "pg_pending";
  const claimedReasonCode = pgAlreadySucceeded
    ? "PAYMENT_REFUND_WALLET_PENDING"
    : "PAYMENT_REFUND_PG_PENDING";
  // Exact status/version plus an expired-or-absent lease is the single execution gate.
  // In particular, an active pg_pending request is never reclaimed while Toss is in flight.
  const claimed = await RefundRequest.findOneAndUpdate(
    {
      requestId,
      status: refund.status,
      stateVersion: refund.stateVersion,
      $or: [{ leaseUntil: { $exists: false } }, { leaseUntil: { $lte: claimNow } }],
    },
    {
      $set: {
        status: claimedStatus,
        reasonCode: claimedReasonCode,
        leaseOwner: claimOwner,
        leaseUntil: buildRefundExecutionLeaseUntil(),
      },
      $inc: { stateVersion: 1 },
    },
    { new: true },
  ).select("+lotIds +reservedLots +approvedByUid").lean<RefundRequestRecord>();
  if (!claimed) {
    return NextResponse.json({ error: "다른 환불 실행이 진행 중입니다.", errorCode: "PAYMENT_REFUND_EXECUTION_CONFLICT" }, { status: 409 });
  }
  refund = claimed;
  if (!pgAlreadySucceeded) {
    if (payment.status === "confirmed") {
      const paymentClaim = await Payment.updateOne(
        { orderId: paymentOrderId, status: "confirmed", stateVersion: payment.stateVersion },
        { $set: { status: "refund_pending", leaseOperation: "refund", stateChangedAt: new Date() }, $inc: { refundAttempts: 1, stateVersion: 1 } },
      );
      if ((paymentClaim.matchedCount || 0) !== 1) {
        await RefundRequest.updateOne(
          { requestId, status: "pg_pending", leaseOwner: claimOwner },
          {
            $set: { status: "manual_review", reasonCode: "PAYMENT_REFUND_PAYMENT_CLAIM_CONFLICT" },
            $inc: { stateVersion: 1 },
            $unset: { leaseOwner: "", leaseUntil: "" },
          },
        );
        return NextResponse.json({ error: "결제 상태 선점에 실패했습니다.", errorCode: "PAYMENT_REFUND_PAYMENT_CLAIM_CONFLICT" }, { status: 409 });
      }
    }
  }
  await PaymentOperation.updateOne(
    { operationKey: refundOperationId },
    { $set: { status: "processing", stage: claimedStatus, reasonCode: claimedReasonCode }, $inc: { attempts: 1 } },
  );

  let pgSummary: Record<string, unknown> | undefined;
  let recipientEmail = "";
  let pgSucceededInThisRun = pgAlreadySucceeded;
  const creditedCoins = Number(payment.paidCoins) + Number(payment.bonusCoins);
  const result = await runPaymentRefundPgFirst({
    executionEnabled: true,
    pgAlreadySucceeded,
    cancelPg: async () => {
      // PG 호출 직전 최신 Payment/request/lot reservation을 다시 대사한다.
      const [latestPayment, latestRefund, latestLots] = await Promise.all([
        Payment.findOne({ orderId: paymentOrderId, status: "refund_pending" }).select("stateVersion").lean(),
        RefundRequest.findOne({ requestId, status: "pg_pending", leaseOwner: claimOwner }).lean(),
        CoinLot.find({ ownerScope: paymentScope, ownerId, orderId: paymentOrderId }).lean<RefundLotSnapshot[]>(),
      ]);
      const latestSafe = Boolean(latestPayment && latestRefund) &&
        latestLots.length === expectedLotIds.length &&
        latestLots.every((lot) => expectedLotIds.includes(lot.lotId) &&
          lot.remainingCoins === lot.coins &&
          lot.refundReservationOperationId === refundOperationId &&
          lot.refundReservationState === "reserved");
      if (!latestSafe) {
        return { ok: false, code: "PAYMENT_REFUND_PRE_PG_RECONCILIATION_FAILED", retryable: false, ambiguous: false };
      }
      const canceled = await cancelTossPayment({
        baseUrl: TOSS_CONFIRM_URL,
        secretKey: process.env.TOSS_WIDGET_SECRET_KEY || "",
        paymentKey,
        cancelReason: "customer_request",
        idempotencyKey: refundOperationId,
      });
      if (canceled.summary) pgSummary = canceled.summary;
      return canceled;
    },
    markPgSucceeded: async () => {
      const now = new Date();
      const receiptSession = await RefundRequest.db.startSession();
      try {
        await receiptSession.withTransaction(async () => {
          const lotsMarked = await CoinLot.updateMany(
            {
              ownerScope: paymentScope,
              ownerId,
              orderId: paymentOrderId,
              lotId: { $in: expectedLotIds },
              refundReservationOperationId: refundOperationId,
              refundReservationState: "reserved",
              $expr: { $eq: ["$remainingCoins", "$coins"] },
            },
            { $set: { refundReservationState: "pg_succeeded" } },
            { session: receiptSession },
          );
          if ((lotsMarked.modifiedCount || 0) !== expectedLotIds.length) throw new Error("PG 성공 후 lot reservation receipt 저장에 실패했습니다.");
          const persisted = await RefundRequest.updateOne(
            { requestId, status: "pg_pending", leaseOwner: claimOwner },
            {
              $set: {
                status: "pg_succeeded",
                reasonCode: "PAYMENT_REFUND_PG_SUCCEEDED",
                pgCompletedAt: now,
                reservationState: "pg_succeeded",
                leaseUntil: buildRefundExecutionLeaseUntil(),
              },
              $inc: { stateVersion: 1 },
            },
            { session: receiptSession },
          );
          if ((persisted.matchedCount || 0) !== 1) throw new Error("환불 PG 성공 receipt lease가 변경되었습니다.");
          await PaymentOperation.updateOne(
            { operationKey: refundOperationId },
            { $set: { status: "processing", stage: "pg_succeeded", providerStatus: "CANCELED", ...(pgSummary ? { providerSummary: pgSummary } : {}) } },
            { session: receiptSession },
          );
        });
        pgSucceededInThisRun = true;
      } finally {
        await receiptSession.endSession();
      }
    },
    markWalletPending: async () => {
      const persisted = await RefundRequest.updateOne(
        { requestId, status: { $in: ["pg_succeeded", "wallet_pending"] }, leaseOwner: claimOwner },
        {
          $set: {
            status: "wallet_pending",
            reasonCode: "PAYMENT_REFUND_WALLET_PENDING",
            leaseUntil: buildRefundExecutionLeaseUntil(),
          },
          $inc: { stateVersion: 1 },
        },
      );
      if ((persisted.matchedCount || 0) !== 1) throw new Error("환불 wallet lease가 변경되었습니다.");
      await PaymentOperation.updateOne(
        { operationKey: refundOperationId },
        { $set: { status: "processing", stage: "wallet_pending" } },
      );
    },
    reverseWalletAndLots: async () => {
      const now = new Date();
      if (paymentScope === "user") {
        const modelName = `${MONGODB_USER_MODEL_PREFIX}${payment.uid}`;
        const User = await getModel<IUserDocument>(MONGODB_USERS_URL, modelName, UserSchema, modelName);
        const owner = await User.findOne({ uid: payment.uid }).select("userEmail").lean<IUserDocument>();
        recipientEmail = String(owner?.userEmail || "");
        await applyUserWalletRefundOnce({
          model: User,
          uid: String(payment.uid || ""),
          operationId: refundOperationId,
          orderId: paymentOrderId,
          purpose: paymentPurpose,
          creditedCoins,
          appliedAt: now,
          membershipExpiresAt: payment.periodEndsAt,
        });
      } else {
        const Universe = await getModel<IUniverseDocument>(MONGODB_AMU_URL, "Universe", UniverseSchema, "universes");
        const owner = await Universe.findOne({ id: payment.universeId }).select("billingOwnerEmail").lean<IUniverseDocument>();
        recipientEmail = String(owner?.billingOwnerEmail || "");
        await applyUniverseWalletRefundOnce({
          model: Universe,
          universeId: String(payment.universeId || ""),
          operationId: refundOperationId,
          orderId: paymentOrderId,
          purpose: paymentPurpose,
          creditedCoins,
          appliedAt: now,
          membershipExpiresAt: payment.periodEndsAt,
        });
      }
      const refundLots = await CoinLot.find({
        ownerScope: paymentScope,
        ownerId,
        orderId: paymentOrderId,
        lotId: { $in: expectedLotIds },
      }).lean<RefundLotSnapshot[]>();
      await applyCoinLotRefundOnce({
        model: CoinLot,
        operationId: refundOperationId,
        orderId: paymentOrderId,
        lots: refundLots,
        refundedAt: now,
      });
    },
    markRefunded: async () => {
      const now = new Date();
      const nextStateVersion = Number(payment.stateVersion || 0) + (payment.status === "confirmed" ? 2 : 1);
      const auditEventId = buildPaymentAuditEventId({
        orderId: paymentOrderId,
        stateVersion: nextStateVersion,
        toStatus: "refunded",
      });
      const notificationOutbox = recipientEmail
        ? buildPaymentNotificationOutboxInput({
            orderId: paymentOrderId,
            scope: paymentScope,
            event: "payment.refunded",
            stateVersion: nextStateVersion,
          })
        : null;
      // Wallet/lot receipts live in their owner stores, but all Billing terminal
      // projections must commit together. A rollback leaves wallet_pending and is
      // safely replayed through the receipt guards above.
      const finalizeSession = await RefundRequest.db.startSession();
      try {
        await finalizeSession.withTransaction(async () => {
          const finalized = await Payment.updateOne(
            { orderId: paymentOrderId, status: "refund_pending" },
            {
              $set: { status: "refunded", ...(pgSummary ? { pgSummary } : {}), stateChangedAt: now },
              $inc: { stateVersion: 1 },
              $unset: { leaseOperation: "", leaseOwner: "", leaseUntil: "", nextAttemptAt: "", lastError: "" },
            },
            { session: finalizeSession },
          );
          if ((finalized.matchedCount || 0) !== 1) throw new Error("환불 Payment 최종 상태가 충돌했습니다.");
          const refundFinalized = await RefundRequest.updateOne(
            { requestId, status: "wallet_pending", leaseOwner: claimOwner },
            {
              $set: {
                status: "refunded",
                reasonCode: "PAYMENT_REFUNDED",
                walletCompletedAt: now,
                reservationState: "refunded",
              },
              $inc: { stateVersion: 1 },
              $unset: { leaseOwner: "", leaseUntil: "" },
            },
            { session: finalizeSession },
          );
          if ((refundFinalized.matchedCount || 0) !== 1) throw new Error("환불 요청 최종 상태가 충돌했습니다.");
          const operationFinalized = await PaymentOperation.updateOne(
            { operationKey: refundOperationId },
            { $set: { status: "succeeded", stage: "completed", reasonCode: "PAYMENT_REFUNDED" } },
            { session: finalizeSession },
          );
          if ((operationFinalized.matchedCount || 0) !== 1) throw new Error("환불 operation 최종 상태가 충돌했습니다.");
          const auditWritten = await PaymentAudit.updateOne(
            { eventId: auditEventId },
            {
              $setOnInsert: {
                eventId: auditEventId,
                orderId: paymentOrderId,
                scope: paymentScope,
                stateVersion: nextStateVersion,
                fromStatus: "refund_pending",
                toStatus: "refunded",
                operation: "refund",
                reasonCode: "PAYMENT_REFUNDED",
                requestId,
                safeSummary: { totalAmount: payment.amount },
                createdAt: now,
              },
            },
            { upsert: true, session: finalizeSession },
          );
          if ((auditWritten.matchedCount || 0) + (auditWritten.upsertedCount || 0) !== 1) {
            throw new Error("환불 audit 원장 저장에 실패했습니다.");
          }
          if (notificationOutbox) {
            const outboxWritten = await PaymentOutbox.updateOne(
              { eventId: notificationOutbox.eventId },
              {
                $setOnInsert: {
                  ...notificationOutbox,
                  status: "pending",
                  attempts: 0,
                },
              },
              { upsert: true, session: finalizeSession },
            );
            if ((outboxWritten.matchedCount || 0) + (outboxWritten.upsertedCount || 0) !== 1) {
              throw new Error("환불 notification outbox 저장에 실패했습니다.");
            }
          }
        });
      } finally {
        await finalizeSession.endSession();
      }
      if (recipientEmail) {
        const mail = buildPaymentStatusMail({
          event: "payment.refunded",
          orderId: paymentOrderId,
          recipientEmail,
          occurredAt: now,
          stateVersion: nextStateVersion,
          amount: Number(payment.amount),
          supportUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://app.allmyuniverse.com"}/support`,
        });
        try {
          await enqueueInternalNotification(mail, "payment.refunded");
        } catch (error) {
          console.error("[payment-refund] durable notification remains pending", {
            code: error instanceof Error ? error.message : "PAYMENT_REFUND_NOTIFICATION_ENQUEUE_FAILED",
            eventId: notificationOutbox?.eventId,
          });
        }
      }
    },
    markManualReview: async (code, retryable) => {
      const now = new Date();
      const pgSucceeded = pgSucceededInThisRun;
      // PARTIAL_CANCELED is an observed provider-side money mutation. Even though
      // retrying is unsafe, the reserved coins must stay frozen for human repair.
      const releaseReservation = !pgSucceeded && !retryable && code !== "TOSS_PARTIAL_CANCEL_UNEXPECTED";
      if (releaseReservation) {
        const releaseSession = await RefundRequest.db.startSession();
        try {
          await releaseSession.withTransaction(async () => {
            const lotsReleased = await CoinLot.updateMany(
              {
                ownerScope: paymentScope,
                ownerId,
                orderId: paymentOrderId,
                lotId: { $in: expectedLotIds },
                refundReservationOperationId: refundOperationId,
                refundReservationState: "reserved",
              },
              { $set: { refundReservationState: "released" } },
              { session: releaseSession },
            );
            if ((lotsReleased.modifiedCount || 0) !== expectedLotIds.length) {
              throw new Error("환불 reservation 해제 대상이 변경되었습니다.");
            }
            const paymentReleased = await Payment.updateOne(
              { orderId: paymentOrderId, status: "refund_pending" },
              {
                $set: { status: "confirmed", stateChangedAt: now },
                $inc: { stateVersion: 1 },
                $unset: { leaseOperation: "", leaseOwner: "", leaseUntil: "" },
              },
              { session: releaseSession },
            );
            if ((paymentReleased.matchedCount || 0) !== 1) throw new Error("환불 Payment reservation 해제 상태가 충돌했습니다.");
            const requestReleased = await RefundRequest.updateOne(
              { requestId, leaseOwner: claimOwner },
              {
                $set: {
                  status: "manual_review",
                  reasonCode: code,
                  reservationState: "released",
                  lastError: { code, retryable, occurredAt: now },
                },
                $inc: { stateVersion: 1 },
                $unset: { leaseOwner: "", leaseUntil: "" },
              },
              { session: releaseSession },
            );
            if ((requestReleased.matchedCount || 0) !== 1) throw new Error("환불 요청 reservation 해제 상태가 충돌했습니다.");
            const operationReleased = await PaymentOperation.updateOne(
              { operationKey: refundOperationId },
              { $set: { status: "manual_review", stage: "manual_review", reasonCode: code, lastError: { code, retryable, occurredAt: now } } },
              { session: releaseSession },
            );
            if ((operationReleased.matchedCount || 0) !== 1) throw new Error("환불 operation reservation 해제 상태가 충돌했습니다.");
          });
        } finally {
          await releaseSession.endSession();
        }
        return;
      }
      await RefundRequest.updateOne(
        { requestId, leaseOwner: claimOwner },
        {
          $set: {
            status: "manual_review",
            reasonCode: code,
            reservationState: releaseReservation ? "released" : (pgSucceeded ? "pg_succeeded" : "reserved"),
            lastError: { code, retryable, occurredAt: now },
          },
          $inc: { stateVersion: 1 },
          $unset: { leaseOwner: "", leaseUntil: "" },
        },
      );
      await PaymentOperation.updateOne(
        { operationKey: refundOperationId },
        { $set: { status: "manual_review", stage: "manual_review", reasonCode: code, lastError: { code, retryable, occurredAt: now } } },
      );
    },
  });

  return NextResponse.json({ ok: result === "refunded", request: { requestId, status: result } }, { status: result === "refunded" ? 200 : 202 });
}

export const POST = withAuth(handlePOST, undefined, "admin/payments/refunds:post", { requireAdmin: true, bodyParser: "json" });
