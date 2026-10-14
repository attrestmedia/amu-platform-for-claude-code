/**
 * @docHint
 * @purpose 승인 가격 정책을 재사용해 확인된 정산분의 마진을 계산한다
 * @process 정책 유효성을 검사하고 기존 카탈로그 검증 산식으로 마진을 구한다
 * @domain ai
 * @scope server
 */

import type { AiCostMonitorMargin } from "types/ai";

export type ResolvedCostMonitorMarginPolicy = {
  usable: boolean;
  netRevenuePerCoinKrw: number | null;
  fxKrwPerUsd: number | null;
  fxProvisional: boolean;
  targetMargin: number | null;
  minMargin: number | null;
};

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function resolveMarginPolicy(policy: unknown): ResolvedCostMonitorMarginPolicy {
  if (!policy || typeof policy !== "object") {
    return {
      usable: false,
      netRevenuePerCoinKrw: null,
      fxKrwPerUsd: null,
      fxProvisional: false,
      targetMargin: null,
      minMargin: null,
    };
  }

  const value = policy as {
    coinPriceKrw?: unknown;
    vatIncludedInCoinPrice?: unknown;
    paymentFeeRate?: unknown;
    fxKrwPerUsd?: { value?: unknown; provisional?: unknown } | null;
    targetMargin?: unknown;
    overheadRate?: unknown;
    minMargin?: unknown;
  };
  const paymentFeeRate = value.paymentFeeRate ?? 0;
  const coinPriceKrw = value.coinPriceKrw;
  const fxKrwPerUsd = value.fxKrwPerUsd?.value;
  const targetMargin = finite(value.targetMargin) && finite(value.overheadRate)
    ? value.targetMargin + value.overheadRate
    : null;
  const minMargin = finite(value.minMargin) ? value.minMargin : null;
  const netRevenuePerCoinKrw = finite(coinPriceKrw) && finite(paymentFeeRate)
    ? coinPriceKrw / (value.vatIncludedInCoinPrice ? 1.1 : 1) * (1 - paymentFeeRate)
    : null;
  const usable =
    finite(netRevenuePerCoinKrw) && netRevenuePerCoinKrw > 0 &&
    finite(fxKrwPerUsd) && fxKrwPerUsd > 0 &&
    finite(targetMargin) && targetMargin >= 0 && targetMargin < 1 &&
    finite(minMargin) && minMargin >= 0 && minMargin <= targetMargin;

  return {
    usable,
    netRevenuePerCoinKrw: finite(netRevenuePerCoinKrw) ? netRevenuePerCoinKrw : null,
    fxKrwPerUsd: finite(fxKrwPerUsd) ? fxKrwPerUsd : null,
    fxProvisional: value.fxKrwPerUsd?.provisional === true,
    targetMargin,
    minMargin,
  };
}

export function withFx(policy: unknown, fxKrwPerUsd: number | null): ResolvedCostMonitorMarginPolicy {
  if (!policy || typeof policy !== "object" || Array.isArray(policy) || !finite(fxKrwPerUsd) || fxKrwPerUsd <= 0) {
    return {
      ...resolveMarginPolicy(policy),
      usable: false,
      fxKrwPerUsd: null,
      fxProvisional: false,
    };
  }

  const source = policy as Record<string, unknown>;
  const existingFx = source.fxKrwPerUsd && typeof source.fxKrwPerUsd === "object" && !Array.isArray(source.fxKrwPerUsd)
    ? source.fxKrwPerUsd as Record<string, unknown>
    : {};
  return resolveMarginPolicy({
    ...source,
    fxKrwPerUsd: { ...existingFx, value: fxKrwPerUsd, provisional: false },
  });
}

export function computeMargin(args: { netCoins: number; costUsd: number }, policy: ResolvedCostMonitorMarginPolicy): AiCostMonitorMargin {
  const coveredNetCoins = Number.isFinite(args.netCoins) ? args.netCoins : 0;
  const coveredCostUsd = Number.isFinite(args.costUsd) ? args.costUsd : 0;
  const canCalculate = policy.usable && coveredNetCoins > 0 && coveredCostUsd >= 0;

  return {
    status: canCalculate ? "ok" : "unavailable",
    marginRate: canCalculate
      ? 1 - (coveredCostUsd * (policy.fxKrwPerUsd as number)) / (coveredNetCoins * (policy.netRevenuePerCoinKrw as number))
      : null,
    coveredNetCoins,
    coveredCostUsd,
    netRevenuePerCoinKrw: policy.netRevenuePerCoinKrw,
    fxKrwPerUsd: policy.fxKrwPerUsd,
    fxProvisional: policy.fxProvisional,
    targetMargin: policy.targetMargin,
    minMargin: policy.minMargin,
  };
}
