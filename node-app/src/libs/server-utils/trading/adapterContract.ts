import "server-only";
import {
  TRADING_ADAPTER_OPTIONAL_METHOD_PAIRS,
  findLivePromotionBlockers,
  findUnverifiedCapabilities,
} from "consts/trading/capabilities";
import {
  TRADING_ASSET_CLASSES,
  TRADING_CLIENT_ORDER_ID_POLICIES,
  TRADING_PROVIDERS,
  TRADING_SESSION_MODELS,
  TRADING_SESSION_TYPES,
  TRADING_TIME_IN_FORCES,
  type TradingProvider,
  type TradingProviderAdapter,
  type TradingProviderCapabilities,
} from "types/trading/adapter";

/**
 * @docHint
 * @purpose Private Trade Lab — 어댑터가 계약을 충족하는지 등록 시점에 검증
 * @process 필수 메서드 확인  선택적 메서드·capabilities 짝 확인  capabilities 내부 정합 확인
 * @domain trading
 * @scope private-trade-lab
 *
 * 어댑터를 레지스트리에 등록할 때 이 함수를 통과해야 한다.
 * 계약 위반을 런타임 첫 호출이 아니라 기동 시점에 터뜨리는 것이 목적이다.
 */

const REQUIRED_METHODS = [
  "verifyConnection",
  "getKeyStatus",
  "listInstruments",
  "getCandles",
  "getQuotes",
  "getOrderbook",
  "getSessionState",
  "getAccounts",
  "getHoldings",
  "getOrderableInfo",
  "submitOrder",
  "cancelOrder",
  "findOrderByClientId",
  "listOpenOrders",
  "newClientOrderId",
] as const;

export type TradingContractViolation = {
  code:
    | "UNKNOWN_PROVIDER"
    | "UNKNOWN_ASSET_CLASS"
    | "MISSING_REQUIRED_METHOD"
    | "CAPABILITY_WITHOUT_METHOD"
    | "METHOD_WITHOUT_CAPABILITY"
    | "INVALID_CAPABILITY_VALUE"
    | "INCONSISTENT_CAPABILITY";
  detail: string;
};

function isFunction(value: unknown): boolean {
  return typeof value === "function";
}

/** capabilities 값 자체가 유니온을 벗어나거나 서로 모순되는지 본다 */
export function validateCapabilities(capabilities: TradingProviderCapabilities): TradingContractViolation[] {
  const violations: TradingContractViolation[] = [];

  if (!TRADING_CLIENT_ORDER_ID_POLICIES.includes(capabilities.clientOrderIdPolicy)) {
    violations.push({
      code: "INVALID_CAPABILITY_VALUE",
      detail: `clientOrderIdPolicy: ${String(capabilities.clientOrderIdPolicy)}`,
    });
  }
  if (!TRADING_SESSION_MODELS.includes(capabilities.sessionModel)) {
    violations.push({ code: "INVALID_CAPABILITY_VALUE", detail: `sessionModel: ${String(capabilities.sessionModel)}` });
  }
  if (!TRADING_SESSION_TYPES.includes(capabilities.defaultSessionType)) {
    violations.push({
      code: "INVALID_CAPABILITY_VALUE",
      detail: `defaultSessionType: ${String(capabilities.defaultSessionType)}`,
    });
  }
  for (const tif of capabilities.timeInForce) {
    if (!TRADING_TIME_IN_FORCES.includes(tif)) {
      violations.push({ code: "INVALID_CAPABILITY_VALUE", detail: `timeInForce: ${String(tif)}` });
    }
  }
  if (capabilities.candleIntervals.length === 0) {
    violations.push({ code: "INVALID_CAPABILITY_VALUE", detail: "candleIntervals가 비어 있다" });
  }
  if (capabilities.candleBatchSymbols < 1 || capabilities.priceBatchSymbols < 1) {
    violations.push({ code: "INVALID_CAPABILITY_VALUE", detail: "batchSymbols는 1 이상이어야 한다" });
  }
  if (capabilities.defaultQuantityScale < 0) {
    violations.push({ code: "INVALID_CAPABILITY_VALUE", detail: "defaultQuantityScale는 0 이상이어야 한다" });
  }
  if (capabilities.clientOrderIdMaxLength !== null && capabilities.clientOrderIdMaxLength < 1) {
    violations.push({ code: "INVALID_CAPABILITY_VALUE", detail: "clientOrderIdMaxLength는 null 또는 1 이상" });
  }

  // 스트리밍이 없으면 체결을 이벤트로 받을 수 없다. 이 조합을 허용하면 체결 감지가 조용히 멈춘다.
  if (!capabilities.streaming && capabilities.fillDetection === "stream") {
    violations.push({
      code: "INCONSISTENT_CAPABILITY",
      detail: "streaming: false인데 fillDetection: stream — 체결을 받을 경로가 없다",
    });
  }
  // 24시간 운영이면 휴장일 달력이 필요 없고, 장 운영시간 모델이면 반드시 필요하다.
  if (capabilities.sessionModel === "always_on" && capabilities.requiresMarketCalendar) {
    violations.push({
      code: "INCONSISTENT_CAPABILITY",
      detail: "sessionModel: always_on인데 requiresMarketCalendar: true",
    });
  }
  if (capabilities.sessionModel === "market_hours" && !capabilities.requiresMarketCalendar) {
    violations.push({
      code: "INCONSISTENT_CAPABILITY",
      detail: "sessionModel: market_hours인데 requiresMarketCalendar: false — 휴장일을 판정할 수 없다",
    });
  }
  // always_on provider에 거래일 기준을 쓰면 "오늘"이 정의되지 않는다.
  if (capabilities.sessionModel === "always_on" && capabilities.defaultSessionType === "market_day") {
    violations.push({
      code: "INCONSISTENT_CAPABILITY",
      detail: "always_on provider에 market_day 집계 기준을 쓸 수 없다",
    });
  }

  return violations;
}

export function findAdapterContractViolations(adapter: TradingProviderAdapter): TradingContractViolation[] {
  const violations: TradingContractViolation[] = [];
  const target = adapter as unknown as Record<string, unknown>;

  if (!TRADING_PROVIDERS.includes(adapter.provider)) {
    violations.push({ code: "UNKNOWN_PROVIDER", detail: String(adapter.provider) });
  }
  if (!TRADING_ASSET_CLASSES.includes(adapter.assetClass)) {
    violations.push({ code: "UNKNOWN_ASSET_CLASS", detail: String(adapter.assetClass) });
  }

  for (const method of REQUIRED_METHODS) {
    if (!isFunction(target[method])) {
      violations.push({ code: "MISSING_REQUIRED_METHOD", detail: method });
    }
  }

  // 짝 규칙 — 양방향으로 검사한다.
  // capability만 켜져 있으면 코어가 부르는 순간 터지고, 메서드만 있으면 UI에 노출되지 않아 죽은 코드가 된다.
  for (const pair of TRADING_ADAPTER_OPTIONAL_METHOD_PAIRS) {
    const declared = Boolean(adapter.capabilities[pair.capability]);
    const implemented = isFunction(target[pair.method]);
    if (declared && !implemented) {
      violations.push({
        code: "CAPABILITY_WITHOUT_METHOD",
        detail: `${pair.capability}: true인데 ${pair.method}()가 없다`,
      });
    }
    if (!declared && implemented) {
      violations.push({
        code: "METHOD_WITHOUT_CAPABILITY",
        detail: `${pair.method}()가 있는데 ${pair.capability}: false다`,
      });
    }
  }

  violations.push(...validateCapabilities(adapter.capabilities));

  return violations;
}

export class TradingAdapterContractError extends Error {
  readonly violations: readonly TradingContractViolation[];

  constructor(provider: string, violations: readonly TradingContractViolation[]) {
    super(`[trading] 어댑터 계약 위반 (${provider}): ${violations.map((v) => `${v.code} ${v.detail}`).join(" / ")}`);
    this.name = "TradingAdapterContractError";
    this.violations = violations;
  }
}

/** 어댑터 등록 시점에 호출한다. 위반이 있으면 기동을 막는다 */
export function assertAdapterContract(adapter: TradingProviderAdapter): void {
  const violations = findAdapterContractViolations(adapter);
  if (violations.length > 0) {
    throw new TradingAdapterContractError(String(adapter.provider), violations);
  }
}

/**
 * 미확인 capability가 남아 있으면 실거래(approval·auto) 승격을 막는다.
 * clientOrderIdPolicy가 미확인이면 재시도가 어느 쪽으로 동작할지 알 수 없어 중복 주문 위험이 있다.
 */
export function assertLiveTradingCapabilitiesVerified(provider: TradingProvider): void {
  const blockers = findLivePromotionBlockers(findUnverifiedCapabilities(provider));
  if (blockers.length > 0) {
    throw new TradingAdapterContractError(
      provider,
      blockers.map((key) => ({
        code: "INCONSISTENT_CAPABILITY" as const,
        detail: `${key}가 미확인 상태다. 스펙 확인 전 실거래 승격을 허용하지 않는다`,
      })),
    );
  }
}
