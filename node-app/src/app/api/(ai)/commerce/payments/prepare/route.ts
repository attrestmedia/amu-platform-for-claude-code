import { NextResponse } from "next/server";
import type { Model } from "mongoose";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { getModel } from "libs/database/modelCache";
import { PaymentBaseModel } from "models/payment";
import type { IPaymentBaseDocument } from "models/payment";
import {
  quoteUniverseSubscription,
  quoteUniverseCoinCharge,
  resolveUniverseRenewalPeriod,
  resolveUniverseWalletPolicyState,
  buildTossOrderId,
} from "utils/payment";
import { ensureUniversePaymentModel } from "libs/server-utils/payment/paymentUtils";
import { COIN_CHARGE_TAX_POLICY_VERSION, COIN_CHARGE_TAX_TREATMENT, UNIVERSE_COIN_POLICY_VERSION } from "consts/payment";
import { MONGODB_BILLING_URL } from "consts/env/server";
import { extractCodedError, type UnknownRecord } from "utils/common";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import { canManageUniverseBilling } from "libs/server-utils/auth/userRoleUtils";
import { ensureUniverseWalletLifecycle } from "libs/server-utils/payment/universeWalletPolicyService";
import type { IUniverse } from "types/game";

/**
 * @docHint
 * @purpose API 라우트((ai) / commerce / payments / prepare) 기능 요청 처리
 * @process POST 요청 파싱  입력 검증  핵심 처리  JSON 응답 반환
 * @domain payment
 * @scope commerce
 */

async function handlePOST(body: UnknownRecord, user: AuthenticatedUserType) {
  try {
    const {
      universeId,
      purpose = "coin_pack",
      packAmount,
      policyAccepted,
    } = body as {
      universeId: string;
      purpose?: "subscription" | "coin_pack";
      packAmount?: number;
      policyAccepted?: boolean;
    };
    const adminUid = String(user?.uid || user?.ID || "").trim();

    if (!universeId || !adminUid) {
      return NextResponse.json({ error: "universeId, adminUid는 필수입니다." }, { status: 400 });
    }
    if (purpose !== "subscription" && purpose !== "coin_pack") {
      return NextResponse.json({ error: "지원하지 않는 결제 목적입니다." }, { status: 400 });
    }

    if (policyAccepted !== true) {
      return NextResponse.json({ error: "결제 전 정책 확인과 동의가 필요합니다." }, { status: 400 });
    }

    const uni = await ensureUniverseWalletLifecycle(universeId);
    if (!uni || uni?.type !== "commerce") {
      return NextResponse.json({ error: "커머스 유니버스가 아닙니다." }, { status: 400 });
    }
    if (!canManageUniverseBilling(user, uni.toObject() as unknown as IUniverse)) {
      return NextResponse.json({ error: "billingOwner만 결제할 수 있습니다." }, { status: 403 });
    }
    const policy = resolveUniverseWalletPolicyState(uni.wallet);
    if (policy.accessState === "closed") {
      return NextResponse.json({ error: "폐쇄된 유니버스는 고객센터 복구 심사 후 결제할 수 있습니다." }, { status: 409 });
    }

    let amount = 0;
    let suppliedAmount: number | undefined;
    let vat: number | undefined;
    let paidCoins: number | undefined;
    let bonusCoins: number | undefined;
    let creditedCoins = 0;
    let periodStartsAt: Date | undefined;
    let periodEndsAt: Date | undefined;
    let renewableAt: Date | undefined;
    let renewalMode: "immediate" | "scheduled" | undefined;

    if (purpose === "subscription") {
      const period = resolveUniverseRenewalPeriod(uni.wallet);
      if (!period) {
        return NextResponse.json(
          { error: "재결제 가능 기간이 아닙니다.", renewableAt: policy.renewableAt, pendingRenewal: policy.pendingRenewal },
          { status: 409 },
        );
      }
      const quote = quoteUniverseSubscription();
      ({ amount, suppliedAmount, vat, paidCoins, bonusCoins, creditedCoins } = quote);
      periodStartsAt = period.start;
      periodEndsAt = period.end;
      renewableAt = period.renewableAt;
      renewalMode = period.mode;
    } else {
      if (!policy.chargeAllowed) {
        return NextResponse.json(
          { error: "활성 Membership 코인이 1코인 이상일 때만 Charged 코인을 충전할 수 있습니다." },
          { status: 409 },
        );
      }
      suppliedAmount = Number(packAmount);
      ({ amount, suppliedAmount, vat, paidCoins, bonusCoins, creditedCoins } = quoteUniverseCoinCharge(suppliedAmount));
    }

    // adminUid도 추가하여 유니크성/추적성 향상
    const orderId = buildTossOrderId(`${universeId}_${adminUid}`, "amu_uni");

    // 모델 인스턴스: 베이스 모델에서 디스크리미네이터 사용
    const PaymentBase = await getModel<IPaymentBaseDocument>(
      MONGODB_BILLING_URL,
      "PaymentBase",
      PaymentBaseModel.schema,
      "payments",
    );
    const Payment = ensureUniversePaymentModel(PaymentBase as unknown as Model<IPaymentBaseDocument>);
    await Payment.create({
      scope: "universe",
      orderId,
      universeId,
      adminUid,
      purpose,
      packAmount: purpose === "coin_pack" ? suppliedAmount : undefined,
      amount,
      suppliedAmount,
      vat,
      taxFreeAmount: 0,
      taxTreatment: COIN_CHARGE_TAX_TREATMENT,
      taxPolicyVersion: COIN_CHARGE_TAX_POLICY_VERSION,
      paidCoins,
      bonusCoins,
      creditedCoins,
      periodStartsAt,
      periodEndsAt,
      renewableAt,
      renewalMode,
      policyVersion: UNIVERSE_COIN_POLICY_VERSION,
      policyAcceptedAt: new Date(),
      currency: "KRW",
      status: "prepared",
    });

    return NextResponse.json({
      orderId, amount, suppliedAmount, vat, paidCoins, bonusCoins, creditedCoins,
      periodStartsAt, periodEndsAt, renewableAt, renewalMode, policyVersion: UNIVERSE_COIN_POLICY_VERSION, currency: "KRW",
    });
  } catch (e) {
    const { message, status } = extractCodedError(e, { message: "prepare 실패" });
    return NextResponse.json({ error: message }, { status });
  }
}

export const POST = withAuth(handlePOST, undefined, "commerce/payments/prepare", {
  checkUniversePermission: { universeIdParam: "universeId", requireEdit: true },
  bodyParser: "json",
});
