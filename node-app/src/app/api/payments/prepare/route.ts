import { NextResponse } from "next/server";
import type { Model } from "mongoose";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import { getModel } from "libs/database/modelCache";
import { UserSchema } from "models/user";
import type { IUserDocument } from "models/user";
import { PaymentBaseModel } from "models/payment";
import type { IPaymentBaseDocument } from "models/payment";
import {
  quoteSubscription,
  quoteCoinCharge,
  coinsForPackAmount,
  validateCustomChargeAmount,
  buildTossOrderId,
} from "utils/payment";
import { ensureUserPaymentModel } from "libs/server-utils/payment/paymentUtils";
import { MONGODB_USER_MODEL_PREFIX } from "consts/db";
import { COIN_CHARGE_TAX_POLICY_VERSION, COIN_CHARGE_TAX_TREATMENT } from "consts/payment";
import { MONGODB_BILLING_URL, MONGODB_USERS_URL, PERSONAL_SUBSCRIPTION_SALES_ENABLED } from "consts/env/server";

import { extractCodedError, type UnknownRecord } from "utils/common";
/**
 * @docHint
 * @purpose API 라우트(payments / prepare) 기능 요청 처리
 * @process POST 요청 파싱  입력 검증  핵심 처리  JSON 응답 반환
 * @domain payment.checkout
 * @scope user_api
 */

async function getUserSubscriptionLock(uid: string) {
  // 유저 모델 이름 규칙과 동일하게 구성
  const modelName = `${MONGODB_USER_MODEL_PREFIX}${uid}`;
  const UserModel = await getModel<IUserDocument>(MONGODB_USERS_URL, modelName, UserSchema, modelName);
  const user = await UserModel.findOne({ uid }).lean();

  if (!user) return { locked: false as const };

  const now = Date.now();
  const end1 = user.subscription?.currentPeriodEnd ? +new Date(user.subscription.currentPeriodEnd) : 0;
  const end2 = user.wallet?.membership?.expiresAt ? +new Date(user.wallet.membership.expiresAt) : 0;
  const until = Math.max(end1, end2);

  // 구독 기간이 남아있다면 잠금
  if (until && now < until) {
    return { locked: true as const, until: new Date(until) };
  }
  return { locked: false as const };
}

async function handlePOST(body: UnknownRecord, user: AuthenticatedUserType) {
  try {
    const { purpose, stageCount, packAmount, customAmount } = body as {
      purpose: "subscription" | "coin_pack";
      stageCount?: number;
      packAmount?: number;
      customAmount?: number;
    };
    const uid = String(user?.uid || user?.ID || "").trim();

    if (!uid || !purpose) {
      return NextResponse.json({ error: "uid, purpose는 필수입니다." }, { status: 400 });
    }
    if (purpose === "subscription" && !PERSONAL_SUBSCRIPTION_SALES_ENABLED) {
      return NextResponse.json({ error: "개인 구독은 현재 판매하지 않습니다." }, { status: 409 });
    }

    let amount = 0;
    let suppliedAmount: number | undefined;
    let vat: number | undefined;
    let paidCoins: number | undefined;
    let bonusCoins: number | undefined;
    let isCustom = false;
    const sc = Math.max(1, Math.floor(Number(stageCount ?? 1)));

    if (purpose === "subscription") {
      // 재결제 방지: 현재 구독기간 내 재결제 차단
      const lock = await getUserSubscriptionLock(uid);
      if (lock.locked) {
        return NextResponse.json(
          {
            error: "현재 구독 기간 중에는 다시 결제할 수 없습니다.",
            until: lock.until, // 클라이언트가 안내에 활용 가능
          },
          { status: 409 },
        );
      }
      amount = quoteSubscription(sc).amount;
    } else {
      // coin_pack: packAmount 또는 customAmount 중 하나 필요
      if (packAmount) {
        coinsForPackAmount(Number(packAmount)); // 유효성 체크
        suppliedAmount = Number(packAmount);
      } else if (customAmount) {
        suppliedAmount = validateCustomChargeAmount(Number(customAmount)); // 공급가액 기준 10만원 제한
        isCustom = true;
      } else {
        return NextResponse.json({ error: "packAmount 또는 customAmount가 필요합니다." }, { status: 400 });
      }
      ({ amount, suppliedAmount, vat, paidCoins, bonusCoins } = quoteCoinCharge(suppliedAmount));
    }

    // 소셜 로그인 uid의 특수문자(:,@ 등)로 인한 Toss 검증 오류 방지
    const orderId = buildTossOrderId(uid, "amu");

    // DB에 주문 생성
    const PaymentBase = await getModel<IPaymentBaseDocument>(
      MONGODB_BILLING_URL,
      "PaymentBase",
      PaymentBaseModel.schema,
      "payments",
    );
    const Payment = ensureUserPaymentModel(PaymentBase as unknown as Model<IPaymentBaseDocument>);
    await Payment.create({
      scope: "user",
      orderId,
      uid,
      purpose,
      stageCount: purpose === "subscription" ? sc : undefined,
      packAmount: purpose === "coin_pack" && !isCustom ? suppliedAmount : undefined,
      customAmount: isCustom ? suppliedAmount : undefined,
      amount,
      suppliedAmount,
      vat,
      taxFreeAmount: purpose === "coin_pack" ? 0 : undefined,
      taxTreatment: purpose === "coin_pack" ? COIN_CHARGE_TAX_TREATMENT : undefined,
      taxPolicyVersion: purpose === "coin_pack" ? COIN_CHARGE_TAX_POLICY_VERSION : undefined,
      paidCoins,
      bonusCoins,
      currency: "KRW",
      status: "prepared",
    });

    return NextResponse.json({ orderId, amount, suppliedAmount, vat, paidCoins, bonusCoins, currency: "KRW" });
  } catch (e) {
    const { message, status } = extractCodedError(e, { message: "prepare 실패" });
    return NextResponse.json({ error: message }, { status });
  }
}

export const POST = withAuth(handlePOST, undefined, "payments/prepare", { bodyParser: "json" });
