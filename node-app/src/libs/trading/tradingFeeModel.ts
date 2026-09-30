/**
 * @docHint
 * @purpose Private Trade Lab — 수수료·세금·슬리피지 모델 (provider·assetClass별)
 * @process computeFee  computeTax  applySlippage  computeExecutionCost
 * @domain trading
 * @scope private-trade-lab
 *
 * 설계: 백테스트와 Paper Trading이 동일한 비용 모델을 공유한다.
 * 실제 수수료율과 다른 모델은 Paper 성과를 부풀려 실거래 전환 판단을 망친다.
 */

import type { TradingAssetClass, TradingProvider } from "types/trading/adapter";

/* ------------------------------------------------------------------ */
/* 수수료                                                               */
/* ------------------------------------------------------------------ */

/** provider·assetClass별 기본 수수료율 (bps) */
const FEE_BPS: Record<string, number> = {
  "upbit:crypto": 5,     // 업비트 0.05%
  "toss_securities:equity": 1.5, // 토스증권 약 0.015% (추정)
};

/** 수수료 계산. 체결금액(quantity × price) 기준 */
export function computeFee(
  provider: TradingProvider,
  assetClass: TradingAssetClass,
  executedAmount: string,
): string {
  const key = `${provider}:${assetClass}`;
  const bps = FEE_BPS[key] ?? 10; // unknown → 10bps fail-safe
  // fee = amount * bps / 10000
  return (BigInt(executedAmount) * BigInt(bps) / BigInt(10000)).toString();
}

/* ------------------------------------------------------------------ */
/* 세금 (매도 시)                                                        */
/* ------------------------------------------------------------------ */

/** provider·assetClass별 매도 세율 (bps) */
const TAX_BPS: Record<string, number> = {
  "toss_securities:equity": 23, // 증권거래세 0.23% (매도만)
  "upbit:crypto": 0,           // 가상자산 과세 2027년 이후, MVP는 면제
};

/** 매도 세금 계산. 매수는 0 반환 */
export function computeTax(
  provider: TradingProvider,
  assetClass: TradingAssetClass,
  side: "BUY" | "SELL",
  executedAmount: string,
): string {
  if (side === "BUY") return "0";
  const key = `${provider}:${assetClass}`;
  const bps = TAX_BPS[key] ?? 0;
  if (bps === 0) return "0";
  return (BigInt(executedAmount) * BigInt(bps) / BigInt(10000)).toString();
}

/* ------------------------------------------------------------------ */
/* 슬리피지                                                              */
/* ------------------------------------------------------------------ */

/**
 * 슬리피지 적용 — 지정가 주문의 체결가에 슬리피지를 반영한다.
 *
 * BUY: price × (1 + slippageBps/10000) → 더 비싸게 체결
 * SELL: price × (1 - slippageBps/10000) → 더 싸게 체결
 *
 * 기본값 5bps. 시장가 주문은 별도로 더 큰 슬리피지를 적용할 수 있다.
 */
export function applySlippage(
  limitPrice: string,
  side: "BUY" | "SELL",
  slippageBps: number = 5,
): string {
  if (slippageBps <= 0) return limitPrice;
  const price = BigInt(limitPrice);
  const slip = price * BigInt(slippageBps) / BigInt(10000);
  if (side === "BUY") return (price + slip).toString();
  return (price - slip > BigInt(0) ? price - slip : BigInt(0)).toString();
}

/* ------------------------------------------------------------------ */
/* 통합 실행 비용                                                        */
/* ------------------------------------------------------------------ */

export interface ExecutionCost {
  grossAmount: string;
  fee: string;
  tax: string;
  slippageBps: number;
  netAmount: string;
}

/**
 * 전체 실행 비용 계산.
 *
 * BUY: netAmount = grossAmount + fee (세금 없음, 슬리피지로 인상된 가격)
 * SELL: netAmount = grossAmount - fee - tax (슬리피지로 인하된 가격)
 *
 * grossAmount는 슬리피지 적용 후 체결 가격 × 수량.
 */
export function computeExecutionCost(
  provider: TradingProvider,
  assetClass: TradingAssetClass,
  side: "BUY" | "SELL",
  quantity: string,
  limitPrice: string,
  slippageBps: number = 5,
): ExecutionCost {
  const slippedPrice = applySlippage(limitPrice, side, slippageBps);
  const grossAmount = (BigInt(quantity) * BigInt(slippedPrice)).toString();
  const fee = computeFee(provider, assetClass, grossAmount);
  const tax = computeTax(provider, assetClass, side, grossAmount);

  const feeBI = BigInt(fee);
  const taxBI = BigInt(tax);
  let net: bigint;
  if (side === "BUY") {
    net = BigInt(grossAmount) + feeBI; // BUY: 실제 지출 = 체결금액 + 수수료
  } else {
    net = BigInt(grossAmount) - feeBI - taxBI;
    if (net < BigInt(0)) net = BigInt(0);
  }

  return { grossAmount, fee, tax, slippageBps, netAmount: net.toString() };
}
