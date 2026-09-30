import type {
  TradingAdapterOptionalMethod,
  TradingCapabilityKey,
  TradingProvider,
  TradingProviderCapabilities,
} from "types/trading/adapter";

/**
 * @docHint
 * @purpose Private Trade Lab — provider별 capabilities 값 표와 선택적 메서드 짝 규칙
 * @process capabilities 선언  짝 규칙  실거래 승격 게이트
 * @domain trading
 * @scope private-trade-lab
 *
 * 설계 정본: .agent/docs/project/2026/08/20260807_103627__private-trade-lab-multi-asset-integration-design.md §1.3
 */

/**
 * 업비트 — 2026-08-07 TL-000 실측과 공식 문서 기준.
 * 실측 근거: .agent/docs/project/2026/08/20260807_132711__tl000-upbit-overseas-ip-smoke-test-result.md
 */
export const UPBIT_CAPABILITIES: TradingProviderCapabilities = {
  orderTest: true,
  conditionalOrder: false,
  cancelAndNewOrder: true,
  timeInForce: ["ioc", "fok", "post_only"],
  marketOrderQuoteAmount: true,

  streaming: true,
  candleIntervals: ["1m", "3m", "5m", "10m", "15m", "30m", "60m", "240m", "1d", "1w", "1M"],
  candleBatchSymbols: 1,
  // 추정 — /v1/ticker는 markets 콤마 다건을 받지만 상한이 문서화되어 있지 않다. P2에서 실측한다.
  priceBatchSymbols: 100,

  clientOrderIdPolicy: "single_use",
  // 2026-08-07 TL-106 공식 문서 확인 — identifier 최대 길이 64자. 재사용 불가(single_use).
  clientOrderIdMaxLength: 64,

  sessionModel: "always_on",
  requiresMarketCalendar: false,
  defaultSessionType: "kst_day",

  defaultQuantityScale: 8,
  fillDetection: "stream",
} as const;

/**
 * 토스증권 — 주식 로드맵 §1.1 기준. **일부가 여전히 미확인이다.**
 * 이 표를 확정 사실로 취급하면 안 된다. TRADING_CAPABILITY_UNVERIFIED_FIELDS를 함께 본다.
 *
 * clientOrderIdPolicy는 2026-08-07 TL-008에서 공식 문서로 확정했다 —
 * 주문 생성 에러에 idempotency-key-conflict("동일 clientOrderId로 내용이 다른 주문을 재요청")과
 * request-in-progress("동일 clientOrderId에 대한 주문 생성 요청이 이미 처리 중")이 정의되어 있다.
 */
export const TOSS_SECURITIES_CAPABILITIES: TradingProviderCapabilities = {
  orderTest: false,
  conditionalOrder: true,
  cancelAndNewOrder: false,
  timeInForce: [],
  marketOrderQuoteAmount: false,

  streaming: false,
  candleIntervals: ["1m", "1d"],
  candleBatchSymbols: 1,
  priceBatchSymbols: 200,

  clientOrderIdPolicy: "idempotent",
  clientOrderIdMaxLength: null,

  sessionModel: "market_hours",
  requiresMarketCalendar: true,
  defaultSessionType: "market_day",

  defaultQuantityScale: 0,
  fillDetection: "poll",
} as const;

export const TRADING_PROVIDER_CAPABILITIES: Record<TradingProvider, TradingProviderCapabilities> = {
  upbit: UPBIT_CAPABILITIES,
  toss_securities: TOSS_SECURITIES_CAPABILITIES,
};

/**
 * 스펙 확인이 끝나지 않은 필드.
 *
 * 값이 비어 있지 않다는 것과 값이 맞다는 것은 다르다. 표에 그럴듯한 기본값을 채워두면
 * 나중에 "이미 확인된 값"으로 오해된다. 미확인 항목을 데이터로 남겨 실거래 승격을 막는다.
 */
export const TRADING_CAPABILITY_UNVERIFIED_FIELDS: Record<TradingProvider, readonly TradingCapabilityKey[]> = {
  // Q3는 2026-08-07 TL-106 해소(identifier 최대 64자, 재사용 불가 — 공식 문서). length·문자 제약은 길이만 확정, 문자 집합은 문서 미명시라 P6 주문 검증에서 ASCII 안전 집합으로 운용.
  upbit: ["priceBatchSymbols"],
  // Q6는 2026-08-07 해소(clientOrderId = 멱등키). 길이·문자 제약은 여전히 미확인이라 남긴다.
  toss_securities: ["clientOrderIdMaxLength", "priceBatchSymbols"],
};

/**
 * 실거래 승격을 막는 미확인 항목.
 *
 * 전부가 차단 사유는 아니다. 길이 제약을 모르는 것은 ID를 짧게 만들면 우회되지만,
 * **정책(멱등 vs 일회용)을 모르는 것은 우회할 수 없다** — 재시도가 어느 쪽으로 동작할지 알 수 없고
 * 잘못 고르면 중복 주문이거나 주문 미발행이다.
 */
export const LIVE_TRADING_BLOCKING_CAPABILITIES: readonly TradingCapabilityKey[] = ["clientOrderIdPolicy"];

/**
 * 선택적 메서드와 capabilities 플래그의 짝 규칙.
 *
 * capabilities가 true인데 메서드가 없으면 코어가 부르는 순간 터지고,
 * 메서드가 있는데 capabilities가 false면 UI에서 노출되지 않아 죽은 코드가 된다.
 * 둘 다 계약 위반으로 본다.
 */
export const TRADING_ADAPTER_OPTIONAL_METHOD_PAIRS = [
  { method: "testOrder", capability: "orderTest" },
  { method: "replaceOrder", capability: "cancelAndNewOrder" },
] as const satisfies readonly { method: TradingAdapterOptionalMethod; capability: TradingCapabilityKey }[];

export function findUnverifiedCapabilities(provider: TradingProvider): readonly TradingCapabilityKey[] {
  return TRADING_CAPABILITY_UNVERIFIED_FIELDS[provider] ?? [];
}

/** 미확인 목록을 직접 받아 판정한다 — provider 표와 분리해 규칙 자체를 검증할 수 있게 둔다 */
export function findLivePromotionBlockers(
  unverified: readonly TradingCapabilityKey[],
): readonly TradingCapabilityKey[] {
  return LIVE_TRADING_BLOCKING_CAPABILITIES.filter((key) => unverified.includes(key));
}

/** 실거래(approval·auto)로 승격 가능한지 판정한다 */
export function canPromoteToLiveTrading(provider: TradingProvider): boolean {
  return findLivePromotionBlockers(findUnverifiedCapabilities(provider)).length === 0;
}
