import { NextResponse } from "next/server";
import { getModel } from "libs/database/modelCache";
import { getUniverseById } from "libs/database/universe";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import type { AuthenticatedUserType, NextRouteContext } from "libs/server-utils/api/_helpers";
import { canEditUniverse, canManageUniverseBilling } from "libs/server-utils/auth/userRoleUtils";
import { resolvePaymentStatusAccess, resolvePaymentStatusOrderId } from "libs/server-utils/payment/paymentStatusAccessPolicy";
import { calculateCoinRefundDecision } from "libs/server-utils/payment/coinRefundPolicy";
import {
  buildPaymentRefundRequestPlan,
  isPaymentCoinLotCutoverVerified,
  isPaymentRefundRequestEnabled,
  isPaymentRefundReservationVerified,
} from "libs/server-utils/payment/paymentRefundSaga";
import { buildPaymentIdempotencyKey } from "libs/server-utils/payment/paymentStateService";
import { MONGODB_BILLING_URL } from "consts/env/server";
import {
  CoinLotSchema,
  PaymentBaseModel,
  PaymentOperationSchema,
  PaymentRefundRequestSchema,
} from "models/payment";
import type {
  ICoinLotDocument,
  IPaymentOperationDocument,
  IPaymentRefundRequestDocument,
} from "models/payment";
import type { PaymentStatusType } from "types/payment";
import type { CoinLotSnapshot } from "types/payment/coinLots";

type RefundPaymentRecord = {
  scope?: "user" | "universe";
  orderId?: string;
  uid?: string;
  universeId?: string;
  adminUid?: string;
  purpose?: "coin_pack" | "subscription";
  renewalMode?: "immediate" | "scheduled";
  amount?: number;
  paidCoins?: number;
  bonusCoins?: number;
  status?: PaymentStatusType;
  stateVersion?: number;
  appliedAt?: Date;
  createdAt?: Date;
};

async function handlePOST(
  _body: unknown,
  user: AuthenticatedUserType,
  request: Request,
  context: NextRouteContext,
) {
  if (!isPaymentRefundRequestEnabled()) {
    return NextResponse.json(
      { error: "환불 접수 기능이 현재 비활성화되어 있습니다.", errorCode: "PAYMENT_REFUND_REQUEST_DISABLED" },
      { status: 503 },
    );
  }
  const orderIdResult = resolvePaymentStatusOrderId(context?.params?.orderId, new URL(request.url).searchParams.getAll("orderId"));
  if (!orderIdResult.ok) {
    return NextResponse.json({ error: "유효하지 않은 주문 경로입니다.", errorCode: orderIdResult.errorCode }, { status: 400 });
  }

  const Payment = await getModel<RefundPaymentRecord>(MONGODB_BILLING_URL, "PaymentBase", PaymentBaseModel.schema, "payments");
  const payment = await Payment.findOne({ orderId: orderIdResult.orderId })
    .select("scope orderId uid universeId adminUid purpose renewalMode amount paidCoins bonusCoins status stateVersion appliedAt createdAt")
    .lean<RefundPaymentRecord>();
  if (!payment) return NextResponse.json({ error: "해당 주문을 찾을 수 없습니다.", errorCode: "PAYMENT_NOT_FOUND" }, { status: 404 });

  const currentUid = String(user?.uid || user?.ID || "").trim();
  const access = resolvePaymentStatusAccess({
    scope: payment.scope,
    userUid: currentUid,
    paymentUid: payment.uid,
    adminUid: payment.adminUid,
    universeId: payment.universeId,
  });
  if (payment.scope === "universe") {
    const universe = await getUniverseById(String(payment.universeId || ""));
    if (!universe || !canManageUniverseBilling(user, universe)) {
      return NextResponse.json({ error: "환불 접수 권한이 없습니다.", errorCode: "PAYMENT_REFUND_FORBIDDEN" }, { status: 403 });
    }
  }
  if (access === "require_universe_edit") {
    const universe = await getUniverseById(String(payment.universeId || ""));
    if (!universe || !canEditUniverse(user, universe)) {
      return NextResponse.json({ error: "환불 접수 권한이 없습니다.", errorCode: "PAYMENT_REFUND_FORBIDDEN" }, { status: 403 });
    }
  } else if (access !== "allow") {
    return NextResponse.json({ error: "환불 접수 권한이 없습니다.", errorCode: "PAYMENT_REFUND_FORBIDDEN" }, { status: 403 });
  }
  if (!payment.purpose || !payment.scope || !payment.orderId) {
    return NextResponse.json(
      { error: "현재 결제 상태에서는 환불을 접수할 수 없습니다.", errorCode: "PAYMENT_REFUND_STATE_CONFLICT" },
      { status: 409 },
    );
  }

  const operationId = buildPaymentIdempotencyKey(payment.orderId, "refund");
  const RefundRequest = await getModel<IPaymentRefundRequestDocument>(
    MONGODB_BILLING_URL,
    "PaymentRefundRequest",
    PaymentRefundRequestSchema,
    "payment_refund_requests",
  );
  const PaymentOperation = await getModel<IPaymentOperationDocument>(
    MONGODB_BILLING_URL,
    "PaymentOperation",
    PaymentOperationSchema,
    "payment_operations",
  );
  const existing = await RefundRequest.findOne({ operationId });
  if (existing) {
    return NextResponse.json({ ok: true, request: { requestId: existing.requestId, orderId: payment.orderId, status: existing.status, reasonCode: existing.reasonCode } });
  }
  if (payment.status !== "confirmed") {
    return NextResponse.json(
      { error: "현재 결제 상태에서는 환불을 접수할 수 없습니다.", errorCode: "PAYMENT_REFUND_STATE_CONFLICT" },
      { status: 409 },
    );
  }

  const ownerId = payment.scope === "user" ? String(payment.uid || "") : String(payment.universeId || "");
  const CoinLot = await getModel<ICoinLotDocument>(MONGODB_BILLING_URL, "CoinLot", CoinLotSchema, "coin_lots");
  const session = await Payment.db.startSession();
  try {
    await session.withTransaction(async () => {
      const currentPayment = await Payment.findOne({
        orderId: payment.orderId,
        status: "confirmed",
        stateVersion: Number(payment.stateVersion || 0),
      }).session(session).lean<RefundPaymentRecord>();
      if (!currentPayment) throw Object.assign(new Error("결제 상태가 변경되었습니다."), { errorCode: "PAYMENT_REFUND_STATE_CONFLICT" });
      const lots = await CoinLot.find({ ownerScope: payment.scope, ownerId, orderId: payment.orderId })
        .session(session)
        .lean<CoinLotSnapshot[]>();
      const decision = calculateCoinRefundDecision({
        order: {
          orderId: payment.orderId!,
          purpose: payment.purpose!,
          purchasedAt: payment.appliedAt || payment.createdAt || new Date(0),
          amount: Number(payment.amount),
          paidCoins: Number(payment.paidCoins),
          bonusCoins: Number(payment.bonusCoins),
        },
        lots,
      });
      const basePlan = buildPaymentRefundRequestPlan(decision);
      const plan = !isPaymentCoinLotCutoverVerified() || !isPaymentRefundReservationVerified()
        ? { ...basePlan, status: "manual_review" as const, reasonCode: "COIN_LOT_CUTOVER_OR_RESERVATION_NOT_VERIFIED" }
        : payment.renewalMode === "scheduled"
          ? { ...basePlan, status: "manual_review" as const, reasonCode: "SCHEDULED_MEMBERSHIP_REFUND_REVIEW" }
          : basePlan;
      const reservedLots = plan.status === "requested"
        ? lots.filter((lot) => plan.lotIds.includes(lot.lotId)).map((lot) => ({
            lotId: lot.lotId,
            bucket: lot.bucket,
            coins: Number(lot.coins),
            remainingCoins: Number(lot.remainingCoins),
          }))
        : [];
      if (plan.status === "requested") {
        if (reservedLots.length !== plan.lotIds.length || reservedLots.some((lot) => lot.coins <= 0 || lot.remainingCoins !== lot.coins)) {
          throw Object.assign(new Error("전액 미사용 lot snapshot이 아닙니다."), { errorCode: "COIN_LOT_RESERVATION_CONFLICT" });
        }
        for (const lot of reservedLots) {
          const reserved = await CoinLot.updateOne(
            {
              ownerScope: payment.scope,
              ownerId,
              orderId: payment.orderId,
              lotId: lot.lotId,
              coins: lot.coins,
              remainingCoins: lot.remainingCoins,
              status: "active",
              refundOperationId: { $exists: false },
              refundReservationState: { $nin: ["reserved", "pg_succeeded", "refunded"] },
            },
            {
              $set: {
                refundReservationOperationId: operationId,
                refundReservationState: "reserved",
                refundReservedAt: new Date(),
              },
            },
            { session },
          );
          if ((reserved.modifiedCount || 0) !== 1) {
            throw Object.assign(new Error(`환불 lot 예약 충돌: ${lot.lotId}`), { errorCode: "COIN_LOT_RESERVATION_CONFLICT" });
          }
        }
        const paymentReserved = await Payment.updateOne(
          { orderId: payment.orderId, status: "confirmed", stateVersion: Number(payment.stateVersion || 0) },
          {
            $set: { status: "refund_pending", leaseOperation: "refund", stateChangedAt: new Date() },
            $inc: { stateVersion: 1 },
          },
          { session },
        );
        if ((paymentReserved.modifiedCount || 0) !== 1) throw Object.assign(new Error("결제 환불 예약 CAS가 충돌했습니다."), { errorCode: "PAYMENT_REFUND_STATE_CONFLICT" });
      }
      await PaymentOperation.create([{
        operationKey: operationId,
        idempotencyKey: operationId,
        orderId: payment.orderId,
        scope: payment.scope,
        operation: "refund",
        status: plan.status === "manual_review" ? "manual_review" : "pending",
        stage: plan.status === "manual_review" ? "manual_review" : "refund_decided",
        reasonCode: plan.reasonCode,
        attempts: 0,
        maxAttempts: 5,
      }], { session });
      const created = await RefundRequest.create([{
        requestId: operationId,
        operationId,
        idempotencyKey: operationId,
        orderId: payment.orderId,
        scope: payment.scope,
        requesterUid: currentUid,
        status: plan.status,
        reasonCode: plan.reasonCode,
        ...(plan.refundAmount === undefined ? {} : { refundAmount: plan.refundAmount }),
        refundablePaidCoins: plan.refundablePaidCoins,
        reclaimBonusCoins: plan.reclaimBonusCoins,
        lotIds: plan.lotIds,
        ...(reservedLots.length ? { reservedLots } : {}),
        reservationState: reservedLots.length ? "reserved" : "not_required",
        stateVersion: 0,
      }], { session });
      if (!created[0]) throw new Error("환불 요청 생성 결과가 없습니다.");
    });
  } catch (error) {
    const code = String((error as { errorCode?: string }).errorCode || "PAYMENT_REFUND_RESERVATION_FAILED");
    return NextResponse.json({ error: error instanceof Error ? error.message : "환불 예약에 실패했습니다.", errorCode: code }, { status: 409 });
  } finally {
    await session.endSession();
  }
  const row = await RefundRequest.findOne({ operationId });
  if (!row) return NextResponse.json({ error: "환불 요청 생성에 실패했습니다.", errorCode: "PAYMENT_REFUND_RESERVATION_FAILED" }, { status: 503 });
  return NextResponse.json(
    {
      ok: true,
      request: {
        requestId: row.requestId || operationId,
        orderId: payment.orderId,
        status: row.status,
        reasonCode: row.reasonCode,
      },
    },
    { status: 201 },
  );
}

export const POST = withAuth(handlePOST, undefined, "payments/refund:post", { bodyParser: "json" });
