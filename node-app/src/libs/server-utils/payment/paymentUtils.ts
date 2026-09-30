import "server-only";
import { Model } from "mongoose";
import type { IUserDocument } from "models/user";
import type { WalletType } from "types/payment";
import type { IPaymentBaseDocument, IUserPaymentDocument, IUniversePaymentDocument } from "models/payment";
import { UserPaymentModel, UniversePaymentModel } from "models/payment";
import { USER_ACCOUNT_TYPE } from "consts/auth";
import { coinsForAnyAmount, coinsForPackAmount, quoteSubscription } from "utils/payment";

// 코인 스냅샷 도입 전에 확정된 결제를 현재 판매 팩 정책과 분리해 조회한다.
const RETIRED_USER_COIN_PACKS: Readonly<Record<number, number>> = {
  5_000: 5_000,
  19_800: 20_000,
  29_800: 30_000,
};

/**
 * @docHint
 * @purpose 서버 유틸/핸들러 핵심 처리
 * @process ensureWallet 중심 처리  입력 검증  핵심 로직  결과 포맷팅  과금/사용량 기록 포함
 * @domain payment
 * @scope server
 */

// 지갑을 반드시 만들고 Wallet 타입으로 반환
export function ensureWallet(user: IUserDocument): WalletType {
  if (!user.wallet) {
    user.wallet = { bonus: { coins: 0 }, membership: { coins: 0 }, charged: { coins: 0 } } as WalletType;
    user.markModified?.("wallet");
  } else {
    user.wallet.bonus = user.wallet.bonus ?? { coins: 0 };
    user.wallet.membership = user.wallet.membership ?? { coins: 0 };
    user.wallet.charged = user.wallet.charged ?? { coins: 0 };
  }
  return user.wallet as WalletType;
}

// membership 만료 반영 후 사용가능 코인 계산
export function resolveMembershipCoins(m?: { coins?: number; expiresAt?: Date | string }) {
  const raw = Math.max(0, m?.coins || 0);
  const exp = m?.expiresAt ? +new Date(m.expiresAt) : 0;
  const now = Date.now();
  const expired = !!(exp && now >= exp);
  return { m: expired ? 0 : raw, mRaw: raw, expired };
}

type ModelWithDiscriminators<T> = Model<T> & { discriminators?: Record<string, Model<unknown>> };

// 유저 전용 디스크리미네이터 보장
export function ensureUserPaymentModel(Base: Model<IPaymentBaseDocument>): Model<IUserPaymentDocument> {
  const baseWithDisc = Base as ModelWithDiscriminators<IPaymentBaseDocument>;
  return (
    (baseWithDisc.discriminators?.user as unknown as Model<IUserPaymentDocument>) ||
    baseWithDisc.discriminator<IUserPaymentDocument>("user", UserPaymentModel.schema)
  );
}

// 유니버스 디스크리미네이터 보장
export function ensureUniversePaymentModel(Base: Model<IPaymentBaseDocument>): Model<IUniversePaymentDocument> {
  const baseWithDisc = Base as ModelWithDiscriminators<IPaymentBaseDocument>;
  return (
    (baseWithDisc.discriminators?.universe as unknown as Model<IUniversePaymentDocument>) ||
    baseWithDisc.discriminator<IUniversePaymentDocument>("universe", UniversePaymentModel.schema)
  );
}

export function resolvePaymentCreditedCoins(payment: {
  purpose?: string;
  stageCount?: number;
  packAmount?: number;
  customAmount?: number;
  paidCoins?: number;
  bonusCoins?: number;
  creditedCoins?: number;
}) {
  if (Number.isSafeInteger(payment.creditedCoins) && (payment.creditedCoins as number) > 0) {
    return payment.creditedCoins as number;
  }
  if (payment.purpose === "subscription") {
    return quoteSubscription(Math.max(1, Number(payment.stageCount || 1))).membershipCoins;
  }

  const hasPaidCoinSnapshot = typeof payment.paidCoins === "number";
  const hasBonusCoinSnapshot = typeof payment.bonusCoins === "number";
  if (hasPaidCoinSnapshot || hasBonusCoinSnapshot) {
    if (
      !hasPaidCoinSnapshot ||
      !hasBonusCoinSnapshot ||
      !Number.isSafeInteger(payment.paidCoins) ||
      !Number.isSafeInteger(payment.bonusCoins) ||
      (payment.paidCoins as number) <= 0 ||
      (payment.bonusCoins as number) < 0
    ) {
      throw Object.assign(new Error("유료/보너스 코인 스냅샷 오류"), { status: 422 });
    }
    return (payment.paidCoins as number) + (payment.bonusCoins as number);
  }

  const hasCustom = typeof payment.customAmount === "number";
  const hasPack = typeof payment.packAmount === "number";
  if (hasCustom === hasPack) {
    throw Object.assign(new Error("코인팩/커스텀 금액 상태 오류"), { status: 422 });
  }
  return hasCustom
    ? coinsForAnyAmount(payment.customAmount as number)
    : coinsForPackAmount(payment.packAmount as number);
}

export function resolveRecordedUserPaymentCoins(payment: {
  purpose?: string;
  amount?: number;
  stageCount?: number;
  packAmount?: number;
  customAmount?: number;
  paidCoins?: number;
  bonusCoins?: number;
}) {
  if (payment.purpose === "subscription") {
    return quoteSubscription(Math.max(1, Number(payment.stageCount || 1))).membershipCoins;
  }

  if (
    Number.isSafeInteger(payment.paidCoins) &&
    Number.isSafeInteger(payment.bonusCoins) &&
    (payment.paidCoins as number) > 0 &&
    (payment.bonusCoins as number) >= 0
  ) {
    return (payment.paidCoins as number) + (payment.bonusCoins as number);
  }

  if (typeof payment.customAmount === "number") return coinsForAnyAmount(payment.customAmount);
  if (typeof payment.packAmount === "number") {
    return RETIRED_USER_COIN_PACKS[payment.packAmount] ?? coinsForAnyAmount(payment.packAmount);
  }
  return coinsForAnyAmount(Number(payment.amount || 0));
}

// 범용 지갑 보정(유저/유니버스 문서 모두)
export function ensureWalletFor<T extends { wallet?: WalletType; markModified?: (path: string) => void }>(
  doc: T,
): WalletType {
  if (!doc.wallet) {
    (doc as { wallet?: WalletType }).wallet = {
      bonus: { coins: 0 },
      membership: { coins: 0 },
      charged: { coins: 0 },
    } as WalletType;
    doc.markModified?.("wallet");
  } else {
    const wallet = doc.wallet as WalletType;
    wallet.bonus = wallet.bonus ?? { coins: 0 };
    wallet.membership = wallet.membership ?? { coins: 0 };
    wallet.charged = wallet.charged ?? { coins: 0 };
  }
  return doc.wallet as WalletType;
}

/**
 * wallet.charged.coins 기준으로 FREE/PRO 자동 동기화
 * - premium/enterprise는 보호
 * - 변경 발생 시 user.accountType을 수정(저장은 호출 측에서)
 */
export function syncAccountTypeByWallet(
  user: IUserDocument,
): (typeof USER_ACCOUNT_TYPE)[keyof typeof USER_ACCOUNT_TYPE] {
  const charged = Math.max(0, user?.wallet?.charged?.coins || 0);
  const curr = user.accountType as string | undefined;

  if (curr === USER_ACCOUNT_TYPE.PREMIUM || curr === USER_ACCOUNT_TYPE.ENTERPRISE) {
    return curr as (typeof USER_ACCOUNT_TYPE)[keyof typeof USER_ACCOUNT_TYPE];
  }
  const nextType = charged > 0 ? USER_ACCOUNT_TYPE.PRO : USER_ACCOUNT_TYPE.FREE;
  if (curr !== nextType) {
    user.accountType = nextType;
  }
  return nextType;
}
