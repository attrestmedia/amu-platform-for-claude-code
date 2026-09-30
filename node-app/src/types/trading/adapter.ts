/**
 * @docHint
 * @purpose Private Trade Lab — provider 중립 거래 어댑터 계약
 * @process capabilities 선언  어댑터 인터페이스  코어가 호출하는 유일한 표면
 * @domain trading
 * @scope private-trade-lab
 *
 * 설계 정본: .agent/docs/project/2026/08/20260807_103627__private-trade-lab-multi-asset-integration-design.md §1.3·§1.4
 *
 * 이 파일은 코드 작성 전에 두 거래소(토스증권·업비트) 스펙을 모두 반영해 고정한 계약이다.
 * 한쪽 provider를 먼저 구현하고 나중에 계약을 고치면 코어를 다시 깨야 하므로, 여기서 확정한다.
 */

export const TRADING_PROVIDERS = ["toss_securities", "upbit"] as const;
export type TradingProvider = (typeof TRADING_PROVIDERS)[number];

export const TRADING_ASSET_CLASSES = ["equity", "crypto"] as const;
export type TradingAssetClass = (typeof TRADING_ASSET_CLASSES)[number];

/**
 * 실행 모드 6종 (통합 보고서 §6.3).
 * 승격은 자동으로 하지 않는다 — 각 단계는 사용자가 명시적으로 승인하며,
 * 전략 정의가 바뀌면 paper로 강등된다.
 */
export const TRADING_EXECUTION_MODES = [
  "disabled",
  "backtest",
  "paper",
  "broker_test",
  "approval",
  "auto",
] as const;
export type TradingExecutionMode = (typeof TRADING_EXECUTION_MODES)[number];

/**
 * 손익 집계 기준 (통합 보고서 §3.3).
 * 주식은 거래일이 명확하지만 크립토에는 "오늘"이 없다. 자산군마다 기준이 다르므로 값으로 명시한다.
 */
export const TRADING_SESSION_TYPES = ["market_day", "kst_day", "utc_day", "rolling_24h"] as const;
export type TradingSessionType = (typeof TRADING_SESSION_TYPES)[number];

export const TRADING_TIME_IN_FORCES = ["ioc", "fok", "post_only"] as const;
export type TradingTimeInForce = (typeof TRADING_TIME_IN_FORCES)[number];

/**
 * 주문 식별자 정책 — 두 거래소의 의미가 정반대다 (통합 보고서 §4.3).
 *
 *   idempotent  토스 clientOrderId. 같은 값 재요청 시 중복을 막는 멱등 키.
 *               재시도 = 같은 ID 재전송.
 *   single_use  업비트 identifier. 성공·실패 무관하게 한 번 쓰면 폐기되는 일회용 키.
 *               재시도 = 반드시 새 ID.
 *
 * 같은 재시도 코드를 두 거래소에 쓰면 한쪽이 반드시 깨진다.
 * 토스에 새 ID로 재시도하면 중복 주문이 나가고, 업비트에 같은 ID로 재시도하면 주문이 영원히 안 나간다.
 */
export const TRADING_CLIENT_ORDER_ID_POLICIES = ["idempotent", "single_use"] as const;
export type TradingClientOrderIdPolicy = (typeof TRADING_CLIENT_ORDER_ID_POLICIES)[number];

export const TRADING_SESSION_MODELS = ["market_hours", "always_on"] as const;
export type TradingSessionModel = (typeof TRADING_SESSION_MODELS)[number];

/**
 * 코어가 알아야 하는 provider 능력 차이.
 *
 * 차이를 전부 함수 시그니처 뒤로 숨길 수는 없다. 조건주문 유무·스트리밍 유무·식별자 정책·
 * 세션 모델·수량 정밀도·체결 감지 경로 6가지는 코어의 동작 자체를 바꾸므로 선언으로 노출한다.
 */
export type TradingProviderCapabilities = {
  // 실행 능력
  orderTest: boolean;
  conditionalOrder: boolean;
  cancelAndNewOrder: boolean;
  timeInForce: readonly TradingTimeInForce[];
  /** 금액 지정 시장가 매수 (업비트 ord_type=price) */
  marketOrderQuoteAmount: boolean;

  // 데이터 능력
  streaming: boolean;
  candleIntervals: readonly string[];
  /** 한 번의 캔들 요청에 담을 수 있는 종목 수 */
  candleBatchSymbols: number;
  /** 한 번의 시세 요청에 담을 수 있는 종목 수 */
  priceBatchSymbols: number;

  // 식별자 정책 — §4.3
  clientOrderIdPolicy: TradingClientOrderIdPolicy;
  /** clientOrderId 최대 길이. 미확인이면 null (업비트 identifier 제약은 openQuestion Q3) */
  clientOrderIdMaxLength: number | null;

  // 세션
  sessionModel: TradingSessionModel;
  requiresMarketCalendar: boolean;
  /** 손익 집계·위험 한도 판정의 기본 기준 */
  defaultSessionType: TradingSessionType;

  // 정밀도 — §7.1
  /** 수량 소수 자릿수 기본값. 실제 값은 trading_instruments에서 동적으로 읽는다 */
  defaultQuantityScale: number;
  /** 체결 감지 경로. 스트리밍이 없으면 폴링이다 */
  fillDetection: "stream" | "poll";
};

export type TradingCapabilityKey = keyof TradingProviderCapabilities;

/**
 * 금액·수량 — 자산별 정밀도 (통합 보고서 §7.1).
 * 부동소수를 쓰지 않는다. 문자열로 직렬화하고 내부 연산은 BigInt 최소단위로 통일한다.
 */
export type AssetQuantity = {
  /** "BTC" | "005930" | "KRW" */
  asset: string;
  amount: string;
  /** 최소단위 지수 — KRW: 0, BTC: 8, 주식: 0 */
  scale: number;
};

export type TradingSide = "buy" | "sell";
export type TradingOrderType = "limit" | "market" | "market_quote";

export type ConnectionVerifyResult = {
  valid: boolean;
  /** 자격증명이 아니라 IP 문제인 경우를 구분한다 (예: TOSS_IP_NOT_ALLOWED / UPBIT_IP_NOT_ALLOWED) */
  code?: string;
  message?: string;
  checkedAt: Date;
};

/**
 * 출금 계열 권한이 하나라도 있으면 연결을 invalid로 두고 auto 활성화를 차단한다 (§4.2).
 * 권한 없는 키를 쓰는 것이 아니라, 권한 있는 키를 거부하는 것이 핵심이다.
 */
export type ProviderKeyStatus = {
  expiresAt?: Date;
  permissions: string[];
  /** 조회 자체가 불가능한 provider는 false — 이 경우 auto 승격을 막는다 */
  permissionsIntrospectable: boolean;
};

export type TradingInstrument = {
  provider: TradingProvider;
  assetClass: TradingAssetClass;
  /** provider 표기 그대로. 업비트 "KRW-BTC", 토스 "005930" */
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  quantityScale: number;
  priceScale: number;
  /** 호가 단위·최소 주문금액은 provider가 예고 없이 바꾼다. 코드 상수로 박지 않는다 */
  tickSize: string;
  minOrderAmount: string;
  /** 업비트 유의종목 등 */
  warning: boolean;
  tradable: boolean;
};

export type CandleRequest = {
  symbol: string;
  interval: string;
  /** 이 시각 이전의 봉을 요청한다 */
  to?: Date;
  count: number;
};

/**
 * 리페인팅 방지의 핵심 (통합 보고서 §3.2).
 * 진행 중인 봉으로 전략을 평가하면 백테스트와 라이브가 조용히 어긋난다.
 * evaluator는 isFinal === false를 받으면 throw한다 — 조용히 통과시키지 않는다.
 */
export type Candle = {
  symbol: string;
  interval: string;
  openTime: Date;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  isFinal: boolean;
};

export type Quote = {
  symbol: string;
  price: string;
  at: Date;
};

export type OrderbookLevel = { price: string; size: string };

export type Orderbook = {
  symbol: string;
  bids: readonly OrderbookLevel[];
  asks: readonly OrderbookLevel[];
  at: Date;
};

export type SessionState = {
  open: boolean;
  sessionType: TradingSessionType;
  /** always_on provider는 null */
  nextOpenAt: Date | null;
  nextCloseAt: Date | null;
};

export type ProviderAccount = {
  provider: TradingProvider;
  accountId: string;
  assetClass: TradingAssetClass;
  currency: string;
};

/**
 * managedBy는 실측에서 드러난 요구다 (openQuestion Q11).
 * 계좌에 사람이 직접 산 자산이 이미 들어 있으므로, 구분이 없으면
 * 전략이 수동 보유분을 자기 포지션으로 오인해 청산한다.
 */
export type Holding = {
  accountId: string;
  asset: string;
  quantity: AssetQuantity;
  /** 주문에 묶여 사용할 수 없는 수량 */
  locked: AssetQuantity;
  avgBuyPrice: string | null;
  managedBy: "system" | "manual" | "unknown";
};

export type OrderableRequest = {
  accountId: string;
  symbol: string;
  side: TradingSide;
};

/**
 * 토스는 buying-power + sellable-quantity + commissions 3콜을 어댑터가 합쳐서 반환하고,
 * 업비트는 orders/chance 1콜이면 된다. 콜 수 차이는 어댑터가 흡수한다.
 */
export type OrderableInfo = {
  symbol: string;
  side: TradingSide;
  /** 위험 판정은 available만 쓴다. locked를 더해 판정하면 한도를 초과한다 */
  availableQuote: AssetQuantity;
  availableBase: AssetQuantity;
  minOrderAmount: string;
  tickSize: string;
  quantityScale: number;
  feeRate: string;
};

export type ClientOrderIdSeed = {
  strategyId: string;
  runId: string;
  seq: number;
};

export type TradingOrderIntent = {
  intentId: string;
  provider: TradingProvider;
  accountId: string;
  symbol: string;
  side: TradingSide;
  orderType: TradingOrderType;
  quantity: AssetQuantity | null;
  /** market_quote(금액 지정 시장가 매수)에서 사용 */
  quoteAmount: AssetQuantity | null;
  price: string | null;
  timeInForce: TradingTimeInForce | null;
  clientOrderId: string;
  /** single_use provider에서 폐기된 ID를 전부 누적한다 (감사 추적 + 재사용 차단) */
  clientOrderIdHistory: readonly string[];
};

export type OrderRef = {
  provider: TradingProvider;
  accountId: string;
  providerOrderId: string;
};

export type OrderTestResult = {
  accepted: boolean;
  /** 테스트 성공은 주문 성공의 보증이 아니다. 주문 직전 재검증을 생략할 근거가 되지 않는다 */
  code?: string;
  message?: string;
};

export type SubmitResult = {
  providerOrderId: string;
  clientOrderId: string;
  /** provider가 확정 응답을 주지 못한 경우. findOrderByClientId로 해소해야 한다 */
  status: "accepted" | "rejected" | "unknown";
  code?: string;
  message?: string;
  submittedAt: Date;
};

export type CancelResult = {
  providerOrderId: string;
  status: "cancelled" | "rejected" | "unknown";
  code?: string;
};

export type ReplaceSpec = {
  price?: string;
  quantity?: AssetQuantity;
  /** single_use provider는 새 ID가 필요하다 */
  newClientOrderId?: string;
};

export type ReplaceResult = {
  providerOrderId: string;
  status: "replaced" | "rejected" | "unknown";
  code?: string;
};

export type ProviderOrderState = "open" | "partially_filled" | "filled" | "cancelled" | "rejected";

export type ProviderOrder = {
  providerOrderId: string;
  clientOrderId: string | null;
  symbol: string;
  side: TradingSide;
  state: ProviderOrderState;
  requestedQuantity: AssetQuantity;
  filledQuantity: AssetQuantity;
  price: string | null;
  createdAt: Date;
};

/**
 * 레이트리밋 헤더는 provider마다 이름이 다르다
 * (토스 X-RateLimit-*, 업비트 Remaining-Req). 어댑터가 파싱해 공통 형태로 반환한다.
 */
export type RateLimitSnapshot = {
  provider: TradingProvider;
  group: string;
  remainingPerSecond: number | null;
  remainingPerMinute: number | null;
  observedAt: Date;
};

/**
 * 코어가 호출하는 유일한 표면.
 *
 * 선택적 메서드(`?`)는 반드시 capabilities 플래그와 짝을 이룬다
 * (TRADING_ADAPTER_OPTIONAL_METHOD_PAIRS). 짝이 어긋나면 런타임에 터지므로
 * 계약 테스트로 고정한다.
 */
export interface TradingProviderAdapter {
  readonly provider: TradingProvider;
  readonly assetClass: TradingAssetClass;
  readonly capabilities: TradingProviderCapabilities;

  // 인증·연결
  verifyConnection(): Promise<ConnectionVerifyResult>;
  getKeyStatus(): Promise<ProviderKeyStatus>;

  // 시장 데이터
  listInstruments(): Promise<TradingInstrument[]>;
  getCandles(req: CandleRequest): Promise<Candle[]>;
  getQuotes(symbols: string[]): Promise<Quote[]>;
  getOrderbook(symbol: string): Promise<Orderbook>;
  getSessionState(at: Date): Promise<SessionState>;

  // 계좌
  getAccounts(): Promise<ProviderAccount[]>;
  getHoldings(accountId: string): Promise<Holding[]>;
  getOrderableInfo(req: OrderableRequest): Promise<OrderableInfo>;

  // 주문
  testOrder?(intent: TradingOrderIntent): Promise<OrderTestResult>;
  submitOrder(intent: TradingOrderIntent): Promise<SubmitResult>;
  cancelOrder(ref: OrderRef): Promise<CancelResult>;
  replaceOrder?(ref: OrderRef, next: ReplaceSpec): Promise<ReplaceResult>;
  /** status: "unknown" 해소 경로. 이것이 없으면 미확정 주문을 영원히 못 닫는다 */
  findOrderByClientId(clientOrderId: string): Promise<ProviderOrder | null>;
  listOpenOrders(accountId: string): Promise<ProviderOrder[]>;

  // 식별자
  newClientOrderId(seed: ClientOrderIdSeed): string;
}

/** 어댑터가 반드시 구현해야 하는 메서드 (선택적 메서드 제외) */
export type TradingAdapterRequiredMethod =
  | "verifyConnection"
  | "getKeyStatus"
  | "listInstruments"
  | "getCandles"
  | "getQuotes"
  | "getOrderbook"
  | "getSessionState"
  | "getAccounts"
  | "getHoldings"
  | "getOrderableInfo"
  | "submitOrder"
  | "cancelOrder"
  | "findOrderByClientId"
  | "listOpenOrders"
  | "newClientOrderId";

export type TradingAdapterOptionalMethod = "testOrder" | "replaceOrder";
