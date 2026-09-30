import type { BillingModeType } from "types/payment";
import {
  COIN_CHARGE_VAT_RATE,
  COIN_PACKS,
  COIN_PER_WON,
  CUSTOM_CHARGE_SUPPLIED_AMOUNT_UNIT,
  MAX_CUSTOM_CHARGE_SUPPLIED_AMOUNT,
  MIN_CUSTOM_CHARGE_SUPPLIED_AMOUNT,
  SUBSCRIBER_BONUS,
  UNIVERSE_COIN_BONUS_RATE,
  UNIVERSE_COIN_PACKS,
  UNIVERSE_COIN_POLICY_VERSION,
  UNIVERSE_MEMBERSHIP_SUPPLIED_AMOUNT,
  UNIVERSE_RENEWAL_LEAD_DAYS,
  WON_PER_COIN,
} from "consts/payment";
import { SUBSCRIPTION_PLANS } from "consts/payment";

/**
 * @docHint
 * @purpose billingUtils 유틸 기능 제공
 * @process 입력 정규화  변환  보조 처리 제공
 * @domain payment
 * @scope global
 */

// Toss orderId 정규화 빌더
export const buildTossOrderId = (raw: unknown, prefix = "amu") => {
  // 1) 어떤 값이 와도 문자열화
  const base = String(raw ?? "");

  // 2) 허용 문자만 남기기 (영문/숫자/-/_/.)
  const safeId = base.replace(/[^0-9A-Za-z\-_.]/g, "-");

  // 3) 짧고 충돌 적은 타임스탬프/랜덤 부여 (base36로 길이 절약)
  const ts = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 8);

  // 4) 조합 (중복 구분자 정리)
  let orderId = `${prefix}_${safeId}_${ts}_${rnd}`.replace(/-+/g, "-").replace(/_+/g, "_").replace(/\.+/g, ".");

  // 5) 최소 길이 보장
  if (orderId.length < 6) orderId = `${prefix}_${ts}_${rnd}`;

  // 6) 최대 64자 제한
  if (orderId.length > 64) orderId = orderId.slice(0, 64);

  return orderId;
};

// 월 구독 요금/코인 산정
export function quoteSubscription(stageCount: number): { membershipCoins: number; amount: number } {
  // stageCount를 "플랜 번호"로 활용 (1~3 이상은 3으로 고정)
  const sc = Math.max(1, Math.floor(Number(stageCount || 1)));

  let plan = SUBSCRIPTION_PLANS[0];
  if (sc === 2) plan = SUBSCRIPTION_PLANS[1];
  else if (sc >= 3) plan = SUBSCRIPTION_PLANS[2];

  // 기본 코인: 1코인 = 1원 기준
  const baseCoins = Math.floor(plan.amount * COIN_PER_WON);

  // 구독 전용 보너스
  const bonusRate = SUBSCRIBER_BONUS / 100;
  const membershipCoins = Math.floor(baseCoins * (1 + bonusRate));

  return {
    membershipCoins,
    amount: plan.amount,
  };
}

export function quoteUniverseSubscription() {
  return {
    ...quoteUniverseCoinAmount(
      UNIVERSE_MEMBERSHIP_SUPPLIED_AMOUNT,
      Math.floor(UNIVERSE_MEMBERSHIP_SUPPLIED_AMOUNT * (1 + UNIVERSE_COIN_BONUS_RATE / 100)),
    ),
    policyVersion: UNIVERSE_COIN_POLICY_VERSION,
  };
}

export function coinsForUniversePackAmount(amount: number) {
  const coins = UNIVERSE_COIN_PACKS[amount];
  if (!coins) throw new Error("지원하지 않는 유니버스 코인팩 금액입니다.");
  return coins;
}

function quoteUniverseCoinAmount(suppliedAmount: number, creditedCoins: number) {
  const vat = Math.round(suppliedAmount * COIN_CHARGE_VAT_RATE);
  const paidCoins = Math.floor(suppliedAmount / WON_PER_COIN);
  const bonusCoins = Math.max(creditedCoins - paidCoins, 0);
  return {
    suppliedAmount,
    vat,
    amount: suppliedAmount + vat,
    paidCoins,
    bonusCoins,
    creditedCoins,
  };
}

export function quoteUniverseCoinCharge(suppliedAmount: number) {
  return {
    ...quoteUniverseCoinAmount(suppliedAmount, coinsForUniversePackAmount(suppliedAmount)),
    policyVersion: UNIVERSE_COIN_POLICY_VERSION,
  };
}

export function computeUniverseAnniversaryPeriod(startsAt = new Date()) {
  const start = new Date(startsAt);
  const end = new Date(start);
  const day = start.getDate();
  end.setMonth(end.getMonth() + 1);
  if (end.getDate() < day) end.setDate(0);
  const renewableAt = new Date(end.getTime() - UNIVERSE_RENEWAL_LEAD_DAYS * 24 * 60 * 60 * 1000);
  return { start, end, renewableAt };
}

// 코인팩(충전) 금액 설정
export function coinsForPackAmount(amount: number) {
  const coins = COIN_PACKS[amount];
  if (!coins) throw new Error("지원하지 않는 코인팩 금액입니다.");
  return coins;
}

// 커스텀 공급가액 유효성 검사 (1,000원 이상, 100원 단위, 부가세 제외 최대 10만 원)
export function validateCustomChargeAmount(amount: number) {
  if (!Number.isSafeInteger(amount)) throw new Error("충전 공급가액은 원 단위의 정수여야 합니다.");
  if (amount < MIN_CUSTOM_CHARGE_SUPPLIED_AMOUNT) {
    throw new Error("충전 공급가액은 최소 1,000원입니다.");
  }
  if (amount > MAX_CUSTOM_CHARGE_SUPPLIED_AMOUNT) {
    throw new Error("충전 공급가액은 최대 10만원까지 설정할 수 있습니다.");
  }
  if (amount % CUSTOM_CHARGE_SUPPLIED_AMOUNT_UNIT !== 0) {
    throw new Error("충전 공급가액은 100원 단위로 설정할 수 있습니다.");
  }
  return amount;
}

// 코인 충전 공급가액 → 부가세/실제 결제금액 산정
export function quoteCoinCharge(suppliedAmount: number) {
  if (!Number.isSafeInteger(suppliedAmount) || suppliedAmount <= 0) {
    throw new Error("충전 금액은 원 단위의 양의 정수여야 합니다.");
  }
  const vat = Math.round(suppliedAmount * COIN_CHARGE_VAT_RATE);
  const paidCoins = Math.floor(suppliedAmount / WON_PER_COIN);
  const creditedCoins = coinsForAnyAmount(suppliedAmount);
  const bonusCoins = Math.max(creditedCoins - paidCoins, 0);
  return { suppliedAmount, vat, amount: suppliedAmount + vat, paidCoins, bonusCoins, creditedCoins };
}

// 금액 → 코인 환산 (코인팩 매칭 시 보너스 적용 또는 일반 환산)
export function coinsForAnyAmount(amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  // 1) 코인팩 테이블: 보너스/프로모션 포함
  if (COIN_PACKS[amount]) return COIN_PACKS[amount];

  // 2) 임의 금액: 환산율 기반 (1코인=1원)
  return Math.floor(amount * COIN_PER_WON);
}

// 청구 주기 계산 (calendar: 이번 달 1일 ~ 말일 23:59:59 / anniversary: 결제일 기준 +1개월)
export function computePeriod(billingMode: BillingModeType, paidAt = new Date()) {
  if (billingMode === "calendar") {
    const s = new Date(paidAt);
    s.setDate(1);
    s.setHours(0, 0, 0, 0);
    const e = new Date(paidAt);
    e.setMonth(e.getMonth() + 1, 0);
    e.setHours(23, 59, 59, 999);
    return { start: s, end: e };
  }

  // anniversary: 존재하지 않는 일자는 말일 처리
  const s = new Date(paidAt);
  const e = new Date(paidAt);
  const day = e.getDate();
  e.setMonth(e.getMonth() + 1);

  // setMonth 오버플로우 보정: 다음달 동일 일이 없으면 자동 말일로 떨어짐
  if (e.getDate() < day) {
    e.setDate(0); // 전월 말일
  }
  e.setHours(23, 59, 59, 999);
  return { start: s, end: e };
}

// customerKey 정규화 헬퍼
export const buildTossCustomerKey = (raw: unknown) => {
  const s = String(raw ?? ""); // 어떤 타입이 와도 문자열화
  let key = `amu-${s}`; // 최소 길이 보장 위해 prefix

  // 허용되지 않는 문자 제거(허용: 0-9A-Za-z-_=.@)
  key = key.replace(/[^0-9A-Za-z\-_=.@]/g, "-");

  // 길이 보정(2~50자)
  if (key.length < 2) key = "amu-00";
  if (key.length > 50) key = key.slice(0, 50);

  return key;
};

// 코인 변경(충전/차감) 시 전역으로 알리는 표준 이벤트 유틸
export type CoinUpdatedPayload =
  | { scope: "user"; amount?: number } // 유저 charged
  | { scope: "universe"; universeId: string; amount?: number }; // 유니버스

const EVENT_NAME = "coin-updated";
export function dispatchCoinUpdated(detail: CoinUpdatedPayload) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail }));
}

export function onCoinUpdated(handler: (e: CustomEvent<CoinUpdatedPayload>) => void) {
  if (typeof window === "undefined") return () => {};
  const wrapped = handler as EventListener;
  window.addEventListener(EVENT_NAME, wrapped);
  return () => window.removeEventListener(EVENT_NAME, wrapped);
}
