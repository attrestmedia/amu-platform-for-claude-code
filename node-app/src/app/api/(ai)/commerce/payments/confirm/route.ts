import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import type { Model } from "mongoose";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { canManageUniverseBilling } from "libs/server-utils/auth/userRoleUtils";
import { getModel } from "libs/database/modelCache";
import {
  CoinLotSchema,
  PaymentAuditSchema,
  PaymentBaseModel,
  PaymentNotificationOutboxSchema,
  PaymentOperationSchema,
} from "models/payment";
import type {
  ICoinLotDocument,
  IPaymentAuditDocument,
  IPaymentBaseDocument,
  IPaymentNotificationOutboxDocument,
  IPaymentOperationDocument,
  IUniversePaymentDocument,
} from "models/payment";
import { UniverseSchema } from "models/universe";
import type { IUniverseDocument } from "models/universe";
import { quoteUniverseCoinCharge, quoteUniverseSubscription, resolveUniverseWalletPolicyState } from "utils/payment";
import { ensureUniversePaymentModel, resolvePaymentCreditedCoins } from "libs/server-utils/payment/paymentUtils";
import { MONGODB_AMU_URL, MONGODB_BILLING_URL, TOSS_CONFIRM_URL } from "consts/env/server";
import fetchClient from "libs/api/fetchClient";
import { extractCodedError, toErrorLike, toUnknownRecord, type UnknownRecord } from "utils/common";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import type { IUniverse } from "types/game";
import { ensureUniverseWalletLifecycle } from "libs/server-utils/payment/universeWalletPolicyService";
import { UNIVERSE_COIN_POLICY_VERSION } from "consts/payment";
import {
  buildPaymentConfirmedMail,
  enqueueInternalNotification,
} from "libs/server-utils/mail/internalNotification";
import {
  buildPaymentTaxSnapshot,
  reconcilePaymentTax,
  PAYMENT_CONFIRM_RESPONSE_INVALID_CODE,
  PAYMENT_TAX_RECONCILIATION_FAILURE_CODE,
} from "libs/server-utils/payment/paymentTaxReconciliation";
import { buildPaymentPgSummary } from "libs/server-utils/payment/paymentPgSummary";
import { recordPaymentAuditOnce } from "libs/server-utils/payment/paymentAuditService";
import { recordPaymentNotificationOutboxOnce } from "libs/server-utils/payment/paymentNotificationOutboxService";
import { buildPaymentIdempotencyKey } from "libs/server-utils/payment/paymentStateService";
import {
  applyPaymentCoinLotCredits,
  applyUniverseWalletCreditOnce,
  markPaymentWalletCreditCommitted,
  preparePaymentCoinLotCreditOperation,
} from "libs/server-utils/payment/paymentCoinLotCreditService";

/**
 * @docHint
 * @purpose API 라우트((ai) / commerce / payments / confirm) 기능 요청 처리
 * @process POST 요청 파싱  입력 검증  핵심 처리  JSON 응답 반환
 * @domain payment
 * @scope commerce
 */

async function handlePOST(body: UnknownRecord, user: AuthenticatedUserType) {
  try {
    const requestId = randomUUID();
    const { orderId, paymentKey, amount } = (body || {}) as { orderId?: string; paymentKey?: string; amount?: number | string };
    if (!orderId || !paymentKey || !amount) {
      return NextResponse.json({ error: "orderId, paymentKey, amount는 필수입니다." }, { status: 400 });
    }

    const secretKey = process.env.TOSS_WIDGET_SECRET_KEY!;
    const auth = Buffer.from(`${secretKey}:`).toString("base64");

    // 베이스 모델 → universe 디스크리미네이터
    const PaymentBase = await getModel<IPaymentBaseDocument>(
      MONGODB_BILLING_URL,
      "PaymentBase",
      PaymentBaseModel.schema,
      "payments",
    );
    const Payment = ensureUniversePaymentModel(PaymentBase as unknown as Model<IPaymentBaseDocument>);
    const PaymentAudit = await getModel<IPaymentAuditDocument>(
      MONGODB_BILLING_URL,
      "PaymentAudit",
      PaymentAuditSchema,
      "payment_audits",
    );
    const PaymentNotificationOutbox = await getModel<IPaymentNotificationOutboxDocument>(
      MONGODB_BILLING_URL,
      "PaymentNotificationOutbox",
      PaymentNotificationOutboxSchema,
      "payment_notification_outbox",
    );
    const PaymentOperation = await getModel<IPaymentOperationDocument>(
      MONGODB_BILLING_URL,
      "PaymentOperation",
      PaymentOperationSchema,
      "payment_operations",
    );
    const CoinLot = await getModel<ICoinLotDocument>(
      MONGODB_BILLING_URL,
      "CoinLot",
      CoinLotSchema,
      "coin_lots",
    );
    const pay = await Payment.findOne({ orderId }).lean<IUniversePaymentDocument>();
    if (!pay) return NextResponse.json({ error: "해당 주문을 찾을 수 없습니다." }, { status: 404 });

    const payUniverseDocument = await ensureUniverseWalletLifecycle(pay.universeId);
    const payUniverse = payUniverseDocument?.toObject();
    if (!payUniverse) {
      return NextResponse.json({ error: "유니버스를 찾을 수 없습니다." }, { status: 404 });
    }
    if (!canManageUniverseBilling(user, payUniverse as unknown as IUniverse)) {
      return NextResponse.json({ error: "billingOwner만 결제할 수 있습니다." }, { status: 403 });
    }
    const currentUid = String(user?.uid || user?.ID || "").trim();
    if (!currentUid || currentUid !== String(pay.adminUid || "")) {
      return NextResponse.json({ error: "결제를 준비한 사용자와 승인 사용자가 다릅니다." }, { status: 403 });
    }

    if (Number(amount) !== Number(pay.amount)) {
      return NextResponse.json({ error: "금액 불일치로 결제 취소" }, { status: 409 });
    }
    const creditedCoins = resolvePaymentCreditedCoins(pay);

    if (pay.applied === true) {
      const previousAppliedAt = pay.appliedAt || pay.updatedAt || pay.createdAt;
      if (previousAppliedAt) {
        await enqueueInternalNotification(
          buildPaymentConfirmedMail({
            orderId: pay.orderId,
            recipientEmail: String(payUniverse.billingOwnerEmail || ""),
            paidAt: previousAppliedAt,
            amount: pay.amount,
            creditedCoins,
            purpose: pay.purpose,
            context: `${payUniverse.name} 유니버스`,
            stateVersion: pay.stateVersion || 0,
          }),
          "payment.confirmed.universe",
        );
      }
      return NextResponse.json({
        ok: true,
        payment: { orderId: pay.orderId, purpose: pay.purpose, creditedCoins, alreadyApplied: true },
      });
    }
    if (pay.policyVersion !== UNIVERSE_COIN_POLICY_VERSION) {
      return NextResponse.json({ error: "이전 정책으로 준비된 주문입니다. 결제를 다시 시작해 주세요." }, { status: 409 });
    }
    if (!pay.policyAcceptedAt || !["prepared", "confirming", "confirmed"].includes(pay.status)) {
      return NextResponse.json({ error: "결제 준비 상태 또는 정책 동의 기록이 올바르지 않습니다." }, { status: 409 });
    }

    const policy = resolveUniverseWalletPolicyState(payUniverse.wallet);
    if (policy.accessState === "closed") {
      return NextResponse.json({ error: "폐쇄된 유니버스는 고객센터 복구 심사 후 결제할 수 있습니다." }, { status: 409 });
    }
    if (pay.purpose === "coin_pack" && !policy.chargeAllowed) {
      return NextResponse.json({ error: "활성 Membership 코인이 있어야 Charged 코인을 충전할 수 있습니다." }, { status: 409 });
    }
    if (
      pay.purpose === "subscription" && pay.renewalMode === "scheduled" && policy.pendingRenewal &&
      policy.pendingRenewal.orderId !== pay.orderId
    ) {
      return NextResponse.json({ error: "이미 예약된 재결제가 있습니다." }, { status: 409 });
    }
    if (pay.purpose === "subscription" && !pay.renewalMode) {
      return NextResponse.json({ error: "구독 갱신 방식이 없습니다. 결제를 다시 시작해 주세요." }, { status: 409 });
    }
    if (pay.purpose === "coin_pack") {
      const verify = quoteUniverseCoinCharge(Number(pay.suppliedAmount || pay.packAmount || 0));
      if (verify.amount !== pay.amount || verify.creditedCoins !== creditedCoins) {
        return NextResponse.json({ error: "Charged 코인팩 금액이 현재 정책과 다릅니다." }, { status: 409 });
      }
    }

    // Toss 승인 전 결제 상태를 confirming으로 선점한다. 다른 요청은 외부 승인 호출을 중복하지 않는다.
    const confirmLeaseUntil = new Date(Date.now() + 5 * 60 * 1000);
    const confirming = await Payment.findOneAndUpdate(
      {
        orderId,
        applied: { $ne: true },
        status: { $in: ["prepared", "confirming", "confirmed"] },
        $or: [
          { leaseUntil: { $exists: false } },
          { leaseUntil: { $lte: new Date() } },
          { leaseOwner: requestId },
        ],
      },
      {
        $set: {
          status: "confirming",
          paymentKey,
          leaseOperation: "confirm",
          leaseOwner: requestId,
          leaseUntil: confirmLeaseUntil,
          stateChangedAt: new Date(),
        },
        $inc: { stateVersion: 1, confirmAttempts: 1 },
      },
      { new: true },
    );
    if (!confirming) {
      return NextResponse.json(
        { error: "결제가 이미 처리 중입니다. 잠시 후 결제 내역을 확인해 주세요.", errorCode: "PAYMENT_CONFIRM_IN_PROGRESS", requestId },
        { status: 409 },
      );
    }
    await recordPaymentAuditOnce(PaymentAudit, {
      orderId,
      scope: "universe",
      stateVersion: confirming.stateVersion || 0,
      fromStatus: pay.status,
      toStatus: "confirming",
      operation: "confirm",
      reasonCode: "PAYMENT_CONFIRM_STARTED",
      requestId,
    });

    // Toss 승인
    let data: UnknownRecord;
    try {
      const r = await fetchClient.post<UnknownRecord>(
        TOSS_CONFIRM_URL,
        { paymentKey, orderId, amount: pay.amount },
        {
          headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/json",
            "Idempotency-Key": buildPaymentIdempotencyKey(pay.orderId, "confirm"),
          },
          credentials: "omit",
          timeout: 15_000,
        },
      );
      data = r.data;
    } catch (e) {
      const errLike = toErrorLike(e);
      const response = toUnknownRecord(errLike.response);
      const status = Number(response.status) || 502;
      const errData = toUnknownRecord(response.data);
      const fallbackMessage = typeof errLike.message === "string" ? errLike.message : "toss_confirm_failed";
      await Payment.updateOne(
        { _id: confirming._id, leaseOwner: requestId, applied: { $ne: true } },
        {
          $set: {
            status: "confirm_failed",
            stateChangedAt: new Date(),
            lastError: { code: "TOSS_CONFIRM_FAILED", retryable: status >= 500 || status === 408 || status === 429, occurredAt: new Date() },
          },
          $inc: { stateVersion: 1 },
          $unset: { leaseOperation: "", leaseOwner: "", leaseUntil: "", applying: "", applyingAt: "" },
        },
      );
      await recordPaymentAuditOnce(PaymentAudit, {
        orderId,
        scope: "universe",
        stateVersion: (confirming.stateVersion || 0) + 1,
        fromStatus: "confirming",
        toStatus: "confirm_failed",
        operation: "confirm",
        reasonCode: "TOSS_CONFIRM_FAILED",
        requestId,
      });
      const msg =
        (typeof errData.message === "string" && errData.message) ||
        (typeof errData.error === "string" && errData.error) ||
        fallbackMessage ||
        "토스 승인 실패";
      return NextResponse.json({ error: msg, errorCode: "TOSS_CONFIRM_FAILED", requestId }, { status });
    }

    // Toss 응답은 전체 원문을 저장하지 않고, 공통 세액 대사를 먼저 수행한다.
    const expectedTaxSnapshot = buildPaymentTaxSnapshot(confirming);
    const taxReconciliation = reconcilePaymentTax(expectedTaxSnapshot, data);
    const pgSummary = buildPaymentPgSummary({ response: data, paymentKey, observedAt: new Date() });
    if (!taxReconciliation.ok) {
      const failureCode = taxReconciliation.code === PAYMENT_CONFIRM_RESPONSE_INVALID_CODE
        ? PAYMENT_CONFIRM_RESPONSE_INVALID_CODE
        : PAYMENT_TAX_RECONCILIATION_FAILURE_CODE;
      await Payment.updateOne(
        { _id: confirming._id, leaseOwner: requestId, applied: { $ne: true } },
        {
          $set: {
            status: "tax_reconciliation_failed",
            paymentKey,
            pgSummary,
            reconciliation: {
              status: "failed",
              code: failureCode,
              reason: taxReconciliation.reason,
              ...(taxReconciliation.field ? { expected: { field: taxReconciliation.field, value: taxReconciliation.expected }, actual: { field: taxReconciliation.field, value: taxReconciliation.actual } } : {}),
              checkedAt: new Date(),
            },
            stateChangedAt: new Date(),
            lastError: { code: failureCode, retryable: false, occurredAt: new Date() },
          },
          $inc: { stateVersion: 1 },
          $unset: { leaseOperation: "", leaseOwner: "", leaseUntil: "", applying: "", applyingAt: "" },
        },
      );
      await recordPaymentAuditOnce(PaymentAudit, {
        orderId,
        scope: "universe",
        stateVersion: (confirming.stateVersion || 0) + 1,
        fromStatus: "confirming",
        toStatus: "tax_reconciliation_failed",
        operation: "reconcile",
        reasonCode: failureCode,
        requestId,
        safeSummary: {
          totalAmount: typeof expectedTaxSnapshot.totalAmount === "number" ? expectedTaxSnapshot.totalAmount : undefined,
          suppliedAmount: typeof expectedTaxSnapshot.suppliedAmount === "number" ? expectedTaxSnapshot.suppliedAmount : undefined,
          vat: typeof expectedTaxSnapshot.vat === "number" ? expectedTaxSnapshot.vat : undefined,
          taxFreeAmount: typeof expectedTaxSnapshot.taxFreeAmount === "number" ? expectedTaxSnapshot.taxFreeAmount : undefined,
        },
      });
      return NextResponse.json(
        {
          error: "결제 승인 응답의 세액 대사에 실패했습니다. 지갑에는 반영되지 않았습니다.",
          errorCode: failureCode,
          requestId,
          payment: { orderId, status: "tax_reconciliation_failed" },
        },
        { status: 502 },
      );
    }

    const now = new Date();
    const forApply = await Payment.findOneAndUpdate<IUniversePaymentDocument>(
      {
        _id: confirming._id,
        applied: { $ne: true },
        status: "confirming",
        leaseOwner: requestId,
      },
      {
        $set: {
          paymentKey,
          pgSummary,
          reconciliation: { status: "passed", checkedAt: now },
          applying: true,
          applyingAt: now,
        },
      },
      { new: true },
    );

    if (!forApply) {
      return NextResponse.json(
        { error: "결제 확정 선점이 만료되었습니다. 결제 내역을 다시 확인해 주세요.", errorCode: "PAYMENT_CONFIRM_LEASE_LOST", requestId },
        { status: 409 },
      );
    }

    // 5) owner DB receipt CAS → Billing CoinLot shadow 순서로 dual-write한다.
    try {
      // Universe 모델은 game/users 클러스터 중 실제 저장소에 맞춰 연결
      const UniverseModel = await getModel<IUniverseDocument>(MONGODB_AMU_URL, "Universe", UniverseSchema, "universes");
      const uni = await UniverseModel.findOne({ id: forApply.universeId });
      if (!uni) {
        throw Object.assign(new Error("유니버스 없음"), { status: 404 });
      }

      let lotCreditOperation: Awaited<ReturnType<typeof preparePaymentCoinLotCreditOperation>>;

      if (forApply.purpose === "subscription") {
        const quote = quoteUniverseSubscription();
        if (quote.amount !== forApply.amount || quote.creditedCoins !== creditedCoins) {
          throw Object.assign(new Error("플랜 금액 검증 실패"), { status: 409 });
        }
        if (!forApply.periodStartsAt || !forApply.periodEndsAt || !forApply.renewableAt) {
          throw Object.assign(new Error("구독 기간 스냅샷이 없습니다."), { status: 409 });
        }
        lotCreditOperation = await preparePaymentCoinLotCreditOperation(PaymentOperation, {
          orderId: forApply.orderId,
          scope: "universe",
          ownerId: forApply.universeId,
          purpose: "subscription",
          paidCoins: Number(forApply.paidCoins),
          bonusCoins: Number(forApply.bonusCoins),
          creditedCoins,
          membershipExpiresAt: forApply.periodEndsAt,
          grantedAt: new Date(forApply.createdAt || pay.createdAt || now),
          policyVersion: forApply.policyVersion || UNIVERSE_COIN_POLICY_VERSION,
        });
        if (forApply.renewalMode === "scheduled") {
          await applyUniverseWalletCreditOnce({
            model: UniverseModel,
            universeId: forApply.universeId,
            operationId: lotCreditOperation.operationId,
            orderId: forApply.orderId,
            purpose: "subscription",
            creditedCoins,
            appliedAt: now,
            membershipUpdate: {
              "wallet.membership.pendingRenewal": {
                orderId: forApply.orderId,
                coins: creditedCoins,
                startsAt: forApply.periodStartsAt,
                expiresAt: forApply.periodEndsAt,
                renewableAt: forApply.renewableAt,
              },
            },
          });
        } else {
          await applyUniverseWalletCreditOnce({
            model: UniverseModel,
            universeId: forApply.universeId,
            operationId: lotCreditOperation.operationId,
            orderId: forApply.orderId,
            purpose: "subscription",
            creditedCoins,
            appliedAt: now,
            membershipUpdate: {
              "wallet.membership": {
                coins: creditedCoins,
                expiresAt: forApply.periodEndsAt,
                renewableAt: forApply.renewableAt,
                lastChargedAt: now,
                billingMode: "anniversary",
              },
              "wallet.accessState": "active",
              "wallet.lastQualifyingActivityAt": now,
              "wallet.closedAt": null,
              "wallet.closureNoticeSentAt": null,
            },
          });
        }
      } else {
        const suppliedAmount = Number(forApply.suppliedAmount || forApply.packAmount || 0);
        const quote = quoteUniverseCoinCharge(suppliedAmount);
        if (quote.amount !== forApply.amount || quote.creditedCoins !== creditedCoins) {
          throw Object.assign(new Error("Charged 코인팩 금액 검증 실패"), { status: 409 });
        }
        lotCreditOperation = await preparePaymentCoinLotCreditOperation(PaymentOperation, {
          orderId: forApply.orderId,
          scope: "universe",
          ownerId: forApply.universeId,
          purpose: "coin_pack",
          paidCoins: Number(forApply.paidCoins),
          bonusCoins: Number(forApply.bonusCoins),
          creditedCoins,
          grantedAt: new Date(forApply.createdAt || pay.createdAt || now),
          policyVersion: forApply.policyVersion || UNIVERSE_COIN_POLICY_VERSION,
        });
        await applyUniverseWalletCreditOnce({
          model: UniverseModel,
          universeId: forApply.universeId,
          operationId: lotCreditOperation.operationId,
          orderId: forApply.orderId,
          purpose: "coin_pack",
          creditedCoins,
          appliedAt: now,
        });
      }

      await markPaymentWalletCreditCommitted(PaymentOperation, lotCreditOperation.operationId);
      await applyPaymentCoinLotCredits({
        operationModel: PaymentOperation,
        coinLotModel: CoinLot,
        operationId: lotCreditOperation.operationId,
        credits: lotCreditOperation.credits,
      });

      const appliedAt = new Date();
      const paymentApplied = await Payment.updateOne(
        { _id: forApply._id, leaseOwner: requestId },
        {
          $set: { applied: true, appliedAt, status: "confirmed", stateChangedAt: appliedAt },
          $inc: { stateVersion: 1 },
          $unset: { leaseOperation: "", leaseOwner: "", leaseUntil: "", applying: "", applyingAt: "" },
        },
      );
      if ((paymentApplied.matchedCount || 0) !== 1) {
        throw Object.assign(new Error("결제 최종 상태 반영에 실패했습니다."), { status: 409, errorCode: "PAYMENT_CONFIRM_FINALIZE_CONFLICT" });
      }
      await recordPaymentAuditOnce(PaymentAudit, {
        orderId: forApply.orderId,
        scope: "universe",
        stateVersion: (forApply.stateVersion || 0) + 1,
        fromStatus: "confirming",
        toStatus: "confirmed",
        operation: "confirm",
        reasonCode: "PAYMENT_WALLET_APPLIED",
        requestId,
        safeSummary: { totalAmount: forApply.amount, suppliedAmount: forApply.suppliedAmount, vat: forApply.vat, taxFreeAmount: forApply.taxFreeAmount },
      });
      const confirmationMail = buildPaymentConfirmedMail({
        orderId: forApply.orderId,
        recipientEmail: String(uni.billingOwnerEmail || ""),
        paidAt: appliedAt,
        amount: forApply.amount,
        creditedCoins,
        purpose: forApply.purpose,
        context: `${uni.name} 유니버스`,
        stateVersion: (forApply.stateVersion || 0) + 1,
      });
      const mailResult = await enqueueInternalNotification(confirmationMail, "payment.confirmed.universe");
      await recordPaymentNotificationOutboxOnce(PaymentNotificationOutbox, {
        eventId: `payment:${forApply.orderId}:payment.confirmed:${(forApply.stateVersion || 0) + 1}`,
        messageId: confirmationMail.messageId,
        orderId: forApply.orderId,
        scope: "universe",
        event: "payment.confirmed",
        stateVersion: (forApply.stateVersion || 0) + 1,
        accepted: Boolean(mailResult.accepted),
      });

      return NextResponse.json({
        ok: true,
        payment: {
          orderId: forApply.orderId,
          purpose: forApply.purpose,
          creditedCoins,
          renewalMode: forApply.renewalMode,
          periodStartsAt: forApply.periodStartsAt,
          periodEndsAt: forApply.periodEndsAt,
        },
      });
    } catch (err) {
      const failedAt = new Date();
      await Payment.updateOne(
        { _id: forApply._id, leaseOwner: requestId },
        {
          $set: {
            status: "wallet_reconciliation_failed",
            stateChangedAt: failedAt,
            lastError: { code: "PAYMENT_WALLET_RECONCILIATION_FAILED", retryable: false, occurredAt: failedAt },
          },
          $inc: { stateVersion: 1 },
          $unset: { leaseOperation: "", leaseOwner: "", leaseUntil: "", applying: "", applyingAt: "" },
        },
      );
      await recordPaymentAuditOnce(PaymentAudit, {
        orderId: forApply.orderId,
        scope: "universe",
        stateVersion: (forApply.stateVersion || 0) + 1,
        fromStatus: "confirming",
        toStatus: "wallet_reconciliation_failed",
        operation: "reconcile",
        reasonCode: "PAYMENT_WALLET_RECONCILIATION_FAILED",
        requestId,
      });
      throw err;
    }
  } catch (e) {
    const { message, status } = extractCodedError(e, { message: "confirm 실패" });
    return NextResponse.json({ error: message }, { status });
  }
}

export const POST = withAuth(handlePOST, undefined, "commerce/payments/confirm", { bodyParser: "json" });
