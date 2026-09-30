import { NextResponse } from "next/server";
import { getModel } from "libs/database/modelCache";
import { getUniverseById } from "libs/database/universe";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import type { AuthenticatedUserType, NextRouteContext } from "libs/server-utils/api/_helpers";
import { canEditUniverse } from "libs/server-utils/auth/userRoleUtils";
import {
  resolvePaymentStatusAccess,
  resolvePaymentStatusOrderId,
} from "libs/server-utils/payment/paymentStatusAccessPolicy";
import { buildPublicPaymentStatus } from "libs/server-utils/payment/paymentStatusProjection";
import { MONGODB_BILLING_URL } from "consts/env/server";
import { PaymentBaseModel } from "models/payment";
import type { PaymentStatusType } from "types/payment";

type PaymentStatusRecord = {
  scope?: string;
  orderId?: string;
  uid?: string;
  universeId?: string;
  adminUid?: string;
  status?: PaymentStatusType;
  stateVersion?: number;
  updatedAt?: Date;
  amount?: number;
  creditedCoins?: number;
  paidCoins?: number;
  bonusCoins?: number;
};

function resolveCreditedCoins(payment: PaymentStatusRecord) {
  if (Number.isSafeInteger(payment.creditedCoins) && (payment.creditedCoins as number) >= 0) {
    return payment.creditedCoins;
  }
  if (
    Number.isSafeInteger(payment.paidCoins) &&
    (payment.paidCoins as number) >= 0 &&
    Number.isSafeInteger(payment.bonusCoins) &&
    (payment.bonusCoins as number) >= 0
  ) {
    return (payment.paidCoins as number) + (payment.bonusCoins as number);
  }
  return undefined;
}

async function handleGET(
  _data: unknown,
  user: AuthenticatedUserType,
  request: Request,
  context: NextRouteContext,
) {
  const orderIdResult = resolvePaymentStatusOrderId(
    context?.params?.orderId,
    new URL(request.url).searchParams.getAll("orderId"),
  );
  if (!orderIdResult.ok) {
    return NextResponse.json({ error: "유효하지 않은 주문 경로입니다.", errorCode: orderIdResult.errorCode }, { status: 400 });
  }

  const Payment = await getModel<PaymentStatusRecord>(
    MONGODB_BILLING_URL,
    "PaymentBase",
    PaymentBaseModel.schema,
    "payments",
  );
  const payment = await Payment.findOne({ orderId: orderIdResult.orderId })
    .select("scope orderId uid universeId adminUid status stateVersion updatedAt amount creditedCoins paidCoins bonusCoins")
    .lean<PaymentStatusRecord>();

  if (!payment) {
    return NextResponse.json({ error: "해당 주문을 찾을 수 없습니다.", errorCode: "PAYMENT_NOT_FOUND" }, { status: 404 });
  }

  const access = resolvePaymentStatusAccess({
    scope: payment.scope,
    userUid: user?.uid || user?.ID,
    paymentUid: payment.uid,
    adminUid: payment.adminUid,
    universeId: payment.universeId,
  });
  if (access === "require_universe_edit") {
    const universe = await getUniverseById(String(payment.universeId || ""));
    if (!universe || !canEditUniverse(user, universe)) {
      return NextResponse.json({ error: "결제 상태 조회 권한이 없습니다.", errorCode: "PAYMENT_STATUS_FORBIDDEN" }, { status: 403 });
    }
  } else if (access !== "allow") {
    return NextResponse.json({ error: "결제 상태 조회 권한이 없습니다.", errorCode: "PAYMENT_STATUS_FORBIDDEN" }, { status: 403 });
  }

  return NextResponse.json(
    buildPublicPaymentStatus({
      orderId: String(payment.orderId || ""),
      status: payment.status as PaymentStatusType,
      stateVersion: payment.stateVersion ?? 0,
      updatedAt: payment.updatedAt as Date,
      amount: payment.amount,
      creditedCoins: resolveCreditedCoins(payment),
    }),
  );
}

export const GET = withAuth(handleGET, undefined, "payments/status:get", { bodyParser: "none" });
