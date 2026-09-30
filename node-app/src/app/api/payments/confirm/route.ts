import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getModel } from "libs/database/modelCache";
import type { Model } from "mongoose";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import {
  PaymentAuditSchema,
  PaymentBaseModel,
  CoinLotSchema,
  PaymentNotificationOutboxSchema,
  PaymentOperationSchema,
} from "models/payment";
import type { ICoinLotDocument, IPaymentAuditDocument, IPaymentBaseDocument, IPaymentNotificationOutboxDocument, IPaymentOperationDocument } from "models/payment";
import { UserSchema } from "models/user";
import type { IUserDocument } from "models/user";
import { quoteSubscription, computePeriod } from "utils/payment";
import {
  ensureWallet,
  ensureUserPaymentModel,
  resolvePaymentCreditedCoins,
} from "libs/server-utils/payment/paymentUtils";
import { MONGODB_USER_MODEL_PREFIX } from "consts/db";
import { MONGODB_USERS_URL, MONGODB_BILLING_URL, PERSONAL_SUBSCRIPTION_SALES_ENABLED, TOSS_CONFIRM_URL } from "consts/env/server";
import fetchClient from "libs/api/fetchClient";
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
  applyUserWalletCreditOnce,
  markPaymentWalletCreditCommitted,
  preparePaymentCoinLotCreditOperation,
} from "libs/server-utils/payment/paymentCoinLotCreditService";
import { USER_ACCOUNT_TYPE } from "consts/auth";

import { toErrorLike, toUnknownRecord, extractCodedError, type UnknownRecord } from "utils/common";
/**
 * @docHint
 * @purpose API 라우트(payments / confirm) 기능 요청 처리
 * @process POST 요청 파싱  입력 검증  핵심 처리  JSON 응답 반환
 * @domain payment.checkout
 * @scope user_api
 */

async function handlePOST(body: UnknownRecord, user: AuthenticatedUserType) {
  try {
    const requestId = randomUUID();
    const { orderId, paymentKey, amount } = toUnknownRecord(body) as {
      orderId?: string;
      paymentKey?: string;
      amount?: number | string;
    };
    if (!orderId || !paymentKey || !amount) {
      return NextResponse.json({ error: "orderId, paymentKey, amount는 필수입니다." }, { status: 400 });
    }

    // Toss confirm
    const secretKey = process.env.TOSS_WIDGET_SECRET_KEY!;
    const auth = Buffer.from(`${secretKey}:`).toString("base64");

    // ① Toss 승인 성공 이후, "미적용(applied:false) 건"만 확정 대상으로 픽
    const PaymentBase = await getModel<IPaymentBaseDocument>(
      MONGODB_BILLING_URL,
      "PaymentBase",
      PaymentBaseModel.schema,
      "payments",
    );
    const Payment = ensureUserPaymentModel(PaymentBase as unknown as Model<IPaymentBaseDocument>);
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
    const pay = await Payment.findOne({ orderId }).lean();
    if (!pay) return NextResponse.json({ error: "해당 주문을 찾을 수 없습니다." }, { status: 404 });

    const uid = String(user?.uid || user?.ID || "").trim();
    if (!uid || String(pay.uid || "") !== uid) {
      return NextResponse.json({ error: "해당 주문을 찾을 수 없습니다." }, { status: 404 });
    }

    // 금액 무결성 체크
    if (Number(amount) !== Number(pay.amount)) {
      return NextResponse.json({ error: "금액 불일치로 결제 취소" }, { status: 409 });
    }
    const creditedCoins = resolvePaymentCreditedCoins(pay);

    // 이미 적립 완료된 주문은 바로 OK
    if (pay.applied === true) {
      const previousAppliedAt = pay.appliedAt || pay.updatedAt || pay.createdAt;
      if (previousAppliedAt) {
        await enqueueInternalNotification(
          buildPaymentConfirmedMail({
            orderId: pay.orderId,
            recipientEmail: String(user?.userEmail || user?.email || ""),
            paidAt: previousAppliedAt,
            amount: pay.amount,
            creditedCoins,
            purpose: pay.purpose,
            context: "개인 지갑",
            stateVersion: pay.stateVersion || 0,
          }),
          "payment.confirmed.user",
        );
      }
      return NextResponse.json({
        ok: true,
        payment: { orderId: pay.orderId, purpose: pay.purpose, creditedCoins, alreadyApplied: true },
      });
    }

    // 구독 재결제 방지 (토스 승인 전 차단)
    if (pay.purpose === "subscription") {
      if (!PERSONAL_SUBSCRIPTION_SALES_ENABLED) {
        return NextResponse.json(
          { error: "개인 구독 상품은 현재 판매하지 않습니다.", errorCode: "PERSONAL_SUBSCRIPTION_SALES_DISABLED" },
          { status: 409 },
        );
      }
      const modelName = `${MONGODB_USER_MODEL_PREFIX}${pay.uid}`;
      const UserModel = await getModel<IUserDocument>(MONGODB_USERS_URL, modelName, UserSchema, modelName);
      const user = await UserModel.findOne({ uid: pay.uid }).lean();

      const now = Date.now();
      const end1 = user?.subscription?.currentPeriodEnd ? +new Date(user.subscription.currentPeriodEnd) : 0;
      const end2 = user?.wallet?.membership?.expiresAt ? +new Date(user.wallet.membership.expiresAt) : 0;
      const until = Math.max(end1, end2);

      if (until && now < until) {
        // 토스 confirm을 호출하지 않으므로 실제 결제는 발생하지 않음
        return NextResponse.json(
          { error: "현재 구독 기간 중에는 다시 결제할 수 없습니다.", until: new Date(until) },
          { status: 409 },
        );
      }
    }

    // 1) Toss 승인 전 결제 상태를 confirming으로 선점한다. 다른 요청은 외부 승인 호출을 중복하지 않는다.
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
      scope: "user",
      stateVersion: confirming.stateVersion || 0,
      fromStatus: pay.status,
      toStatus: "confirming",
      operation: "confirm",
      reasonCode: "PAYMENT_CONFIRM_STARTED",
      requestId,
    });

    // 2) Toss 승인 호출
    let data: UnknownRecord = {};
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
      data = toUnknownRecord(r.data);
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
        scope: "user",
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

    // 3) Toss 응답은 전체 원문을 저장하지 않고, 공통 세액 대사를 먼저 수행한다.
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
        scope: "user",
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

    // 4) 멱등/경합 안전 선점: 대사 통과 건만 지갑 반영 대상으로 픽한다.
    const now = new Date();
    const forApply = await Payment.findOneAndUpdate(
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

    // 이미 다른 요청이 선점/처리했다면 성공으로 오인하지 않고 재조회 가능한 충돌로 반환한다.
    if (!forApply) {
      return NextResponse.json(
        { error: "결제 확정 선점이 만료되었습니다. 결제 내역을 다시 확인해 주세요.", errorCode: "PAYMENT_CONFIRM_LEASE_LOST", requestId },
        { status: 409 },
      );
    }

    // 5) owner DB receipt CAS → Billing CoinLot shadow 순서로 dual-write한다.
    try {
      const userModelName = `${MONGODB_USER_MODEL_PREFIX}${forApply.uid}`;
      const UserModel = await getModel<IUserDocument>(MONGODB_USERS_URL, userModelName, UserSchema, userModelName);
      const user = await UserModel.findOne({ uid: forApply.uid });
      if (!user) {
        throw Object.assign(new Error("사용자 없음"), { status: 404 });
      }

      const wallet = ensureWallet(user);
      let lotCreditOperation: Awaited<ReturnType<typeof preparePaymentCoinLotCreditOperation>>;

      if (forApply.purpose === "subscription") {
        const sc = Math.max(1, Number(forApply.stageCount || 1));
        const { membershipCoins, amount: verifyAmount } = quoteSubscription(sc);
        if (verifyAmount !== forApply.amount) {
          throw Object.assign(new Error("플랜 금액 검증 실패"), { status: 409 });
        }
        const billingMode = wallet.membership?.billingMode || "calendar";
        const { start, end } = computePeriod(billingMode, now);
        const membership = {
          ...(wallet.membership || {}),
          coins: membershipCoins,
          expiresAt: end,
          lastChargedAt: now,
          billingMode,
        };
        const subscription = {
          ...(user.subscription || {}),
          active: true,
          stageCount: sc,
          planAmount: forApply.amount,
          currentPeriodStart: start,
          currentPeriodEnd: end,
          lastPaidAt: now,
        };
        lotCreditOperation = await preparePaymentCoinLotCreditOperation(PaymentOperation, {
          orderId: forApply.orderId,
          scope: "user",
          ownerId: forApply.uid,
          purpose: "subscription",
          paidCoins: Number(forApply.paidCoins),
          bonusCoins: Number(forApply.bonusCoins),
          creditedCoins,
          membershipExpiresAt: end,
          grantedAt: new Date(forApply.createdAt || pay.createdAt || now),
          policyVersion: forApply.policyVersion,
        });
        await applyUserWalletCreditOnce({
          model: UserModel,
          uid: forApply.uid,
          operationId: lotCreditOperation.operationId,
          orderId: forApply.orderId,
          purpose: "subscription",
          creditedCoins,
          appliedAt: now,
          membership,
          subscription,
        });
      } else {
        lotCreditOperation = await preparePaymentCoinLotCreditOperation(PaymentOperation, {
          orderId: forApply.orderId,
          scope: "user",
          ownerId: forApply.uid,
          purpose: "coin_pack",
          paidCoins: Number(forApply.paidCoins),
          bonusCoins: Number(forApply.bonusCoins),
          creditedCoins,
          grantedAt: new Date(forApply.createdAt || pay.createdAt || now),
          policyVersion: forApply.policyVersion,
        });
        const protectedAccountType = [USER_ACCOUNT_TYPE.PREMIUM, USER_ACCOUNT_TYPE.ENTERPRISE].includes(
          user.accountType as typeof USER_ACCOUNT_TYPE.PREMIUM | typeof USER_ACCOUNT_TYPE.ENTERPRISE,
        );
        await applyUserWalletCreditOnce({
          model: UserModel,
          uid: forApply.uid,
          operationId: lotCreditOperation.operationId,
          orderId: forApply.orderId,
          purpose: "coin_pack",
          creditedCoins,
          appliedAt: now,
          accountType: protectedAccountType ? user.accountType : USER_ACCOUNT_TYPE.PRO,
        });
      }

      await markPaymentWalletCreditCommitted(PaymentOperation, lotCreditOperation.operationId);
      await applyPaymentCoinLotCredits({
        operationModel: PaymentOperation,
        coinLotModel: CoinLot,
        operationId: lotCreditOperation.operationId,
        credits: lotCreditOperation.credits,
      });

      // 적립 완료 마킹: 지갑 저장까지 끝난 뒤에만 confirmed/applied로 수렴한다.
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
        scope: "user",
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
        recipientEmail: user.userEmail,
        paidAt: appliedAt,
        amount: forApply.amount,
        creditedCoins,
        purpose: forApply.purpose,
        context: "개인 지갑",
        stateVersion: (forApply.stateVersion || 0) + 1,
      });
      const mailResult = await enqueueInternalNotification(confirmationMail, "payment.confirmed.user");
      await recordPaymentNotificationOutboxOnce(PaymentNotificationOutbox, {
        eventId: `payment:${forApply.orderId}:payment.confirmed:${(forApply.stateVersion || 0) + 1}`,
        messageId: confirmationMail.messageId,
        orderId: forApply.orderId,
        scope: "user",
        event: "payment.confirmed",
        stateVersion: (forApply.stateVersion || 0) + 1,
        accepted: Boolean(mailResult.accepted),
      });

      return NextResponse.json({
        ok: true,
        payment: { orderId: forApply.orderId, purpose: forApply.purpose, creditedCoins },
      });
    } catch (err) {
      // Billing DB와 지갑 DB가 분리되어 있으므로 자동 재시도 시 중복 적립하지 않고 보정 심사로 보낸다.
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
        scope: "user",
        stateVersion: (forApply.stateVersion || 0) + 1,
        fromStatus: "confirming",
        toStatus: "wallet_reconciliation_failed",
        operation: "reconcile",
        reasonCode: "PAYMENT_WALLET_RECONCILIATION_FAILED",
        requestId,
      });
      throw err; // 공통 에러 핸들러로
    }
  } catch (e) {
    const { message, status } = extractCodedError(e, { message: "confirm 실패" });
    return NextResponse.json({ error: message }, { status });
  }
}

export const POST = withAuth(handlePOST, undefined, "payments/confirm", { bodyParser: "json" });
