import type { FixedPricingMapType, TokenPricingMapType } from "./coinUtils";

/**
 * @docHint
 * @purpose 가격표 단일 소스 계약 — 코드 정책 키 집합이 정본이고 DB는 값 override만 한다
 * @process 정책 키 판정  DB only 분리  단일 pricing map 생성
 * @domain billing.pricing-source
 * @scope global
 */

export type PricingCatalogEntry = {
  billingKey: string;
  tokensPerCoin?: { input: number; output: number } | null;
  fixedCost?: Record<string, number> | null;
  /** 코드 정책(bootstrap 상수)에 존재하는 키인지. false면 DB에만 있는 잔여 문서다. */
  policyManaged: boolean;
};

export type PricingMaps = { tokenMap: TokenPricingMapType; fixedMap: FixedPricingMapType };

/**
 * 과금과 가격표 확인이 같은 표를 보게 만드는 유일한 생성 지점.
 *
 * 기본값은 `policyManaged` 항목만 싣는다. 코드 정책에서 빠진 DB only 키를 여기 넣으면
 * 가격표 preflight(assertPricingConfigured)는 통과하는데 코인 산정(calcCoins)은 실패하는
 * 불일치가 생긴다. DB only 키는 가격이 아니라 정리 대상 신호로만 다룬다.
 */
export function buildPricingMapsFromCatalog(
  entries: readonly PricingCatalogEntry[],
  options: { includeDbOnly?: boolean } = {},
): PricingMaps {
  const tokenMap: Record<string, { input: number; output: number }> = {};
  const fixedMap: Record<string, Record<string, number>> = {};

  for (const entry of entries) {
    if (!options.includeDbOnly && !entry.policyManaged) continue;
    if (entry.tokensPerCoin) tokenMap[entry.billingKey] = entry.tokensPerCoin;
    if (entry.fixedCost && Object.keys(entry.fixedCost).length > 0) fixedMap[entry.billingKey] = entry.fixedCost;
  }

  return { tokenMap: tokenMap as TokenPricingMapType, fixedMap: fixedMap as FixedPricingMapType };
}

/** 코드 정책에서 빠진 채 DB에만 남아 있는 항목. 관리자 화면의 정리 대상 목록이다. */
export function collectDbOnlyBillingKeys(entries: readonly PricingCatalogEntry[]) {
  return entries.filter((entry) => !entry.policyManaged).map((entry) => entry.billingKey).sort();
}
