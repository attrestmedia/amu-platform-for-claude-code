/**
 * @docHint
 * @purpose Private Trade Lab — 전략 DSL 타입 정의 (조건 소스·리밸런싱·시간축)
 * @process StrategyConditionSource 14종  StrategyKind(signal|rebalance)  TimeframeGuard
 * @domain trading
 * @scope private-trade-lab
 *
 * 설계 정본: 주식 보고서 §6.1·§6.2·§6.3, 통합 보고서 §3.1.
 *
 * 초안 DSL의 6종 조건 소스를 중장기 전략에 필요한 8종 추가로 14종으로 확장한다.
 * 특히 holding_days·market_regime이 중요하다 — 중장기 전략은 "언제 사는가"보다
 * "언제까지 들고 가는가"와 "시장 전체가 하락 추세일 때 아예 진입하지 않는가"에서 성과가 갈린다.
 *
 * 리밸런싱 전략 타입을 신설한다. toleranceBandBps가 없으면 매일 잔돈 주문이 발생해
 * 수수료로 수익이 사라진다.
 */

import type { TradingProvider, TradingAssetClass, TradingExecutionMode, TradingTimeInForce } from "./adapter";

/* ------------------------------------------------------------------ */
/* 조건 소스 (14종)                                                      */
/* ------------------------------------------------------------------ */

/**
 * 전략 조건 소스 — 초안 6종 + 중장기 8종 추가.
 */
export const STRATEGY_CONDITION_SOURCES = [
  "price", "volume", "moving_average", "position", "profit_rate", "market_index",
  "rsi", "atr_ratio", "distance_from_high_52w", "liquidity_value_sma20",
  "holding_days", "market_regime", "position_weight", "sector_exposure",
] as const;

export type StrategyConditionSource = (typeof STRATEGY_CONDITION_SOURCES)[number];

/* ------------------------------------------------------------------ */
/* 조건 연산자                                                           */
/* ------------------------------------------------------------------ */

export const STRATEGY_CONDITION_OPERATORS = [
  "gt", "gte", "lt", "lte", "eq", "cross_above", "cross_below",
] as const;

export type StrategyConditionOperator = (typeof STRATEGY_CONDITION_OPERATORS)[number];

/* ------------------------------------------------------------------ */
/* 단일 조건                                                            */
/* ------------------------------------------------------------------ */

export type StrategyCondition = {
  source: StrategyConditionSource;
  operator: StrategyConditionOperator;
  value: string;
  period?: number;
  maType?: "sma" | "ema";
  indexSymbol?: string;
  targetWeight?: string;
  sectorCode?: string;
};

/* ------------------------------------------------------------------ */
/* 규칙 그룹 — AND/OR 중첩                                                */
/* ------------------------------------------------------------------ */

export const STRATEGY_RULE_GROUP_LOGICS = ["and", "or"] as const;
export type StrategyRuleGroupLogic = (typeof STRATEGY_RULE_GROUP_LOGICS)[number];


/* ------------------------------------------------------------------ */
/* 전략 종류                                                             */
/* ------------------------------------------------------------------ */

export const STRATEGY_KINDS = ["signal", "rebalance"] as const;
export type StrategyKind = (typeof STRATEGY_KINDS)[number];

/* ------------------------------------------------------------------ */
/* 리밸런싱 정책                                                         */
/* ------------------------------------------------------------------ */

export const REBALANCE_CADENCES = ["monthly", "quarterly", "on_drift"] as const;
export type RebalanceCadence = (typeof REBALANCE_CADENCES)[number];

export type RebalanceTarget = {
  symbol: string;
  targetWeight: string;
};

export type RebalancePolicy = {
  targets: RebalanceTarget[];
  toleranceBandBps: number;
  minOrderAmount: string;
  cadence: RebalanceCadence;
  cashBufferRatio: string;
};

/* ------------------------------------------------------------------ */
/* 시간축·트리거 (주식 보고서 §6.3 + 통합 보고서 §3.1)                      */
/* ------------------------------------------------------------------ */

export const EQUITY_STRATEGY_TIMEFRAMES = ["1d", "1w"] as const;
export type EquityStrategyTimeframe = (typeof EQUITY_STRATEGY_TIMEFRAMES)[number];

export const CRYPTO_STRATEGY_TIMEFRAMES = [
  "5m", "10m", "15m", "30m", "60m", "240m", "1d", "1w",
] as const;
export type CryptoStrategyTimeframe = (typeof CRYPTO_STRATEGY_TIMEFRAMES)[number];

export type StrategyTimeframe = EquityStrategyTimeframe | CryptoStrategyTimeframe;

export const ALLOWED_INTRADAY_MINUTES = [5, 10, 15, 30, 60] as const;
export type AllowedIntradayMinutes = (typeof ALLOWED_INTRADAY_MINUTES)[number];

export type Weekday = 1 | 2 | 3 | 4 | 5;

export type StrategyTrigger =
  | { kind: "daily_close"; atKst: string }
  | { kind: "pre_close"; atKst: string }
  | { kind: "intraday"; everyMinutes: AllowedIntradayMinutes }
  | { kind: "weekly"; weekday: Weekday; atKst: string }
  | { kind: "monthly"; dayOfMonth: number; atKst: string };

/* ------------------------------------------------------------------ */
/* 사이징 정책                                                           */
/* ------------------------------------------------------------------ */

export const SIZING_MODES = [
  "fixed_quantity", "fixed_quote_amount", "portfolio_ratio", "risk_based",
] as const;
export type SizingMode = (typeof SIZING_MODES)[number];

export type SizingPolicy = { mode: SizingMode; value: string };

/* ------------------------------------------------------------------ */
/* 주문 정책                                                             */
/* ------------------------------------------------------------------ */

export const ORDER_TYPES = ["LIMIT", "MARKET", "BEST"] as const;
export type StrategyOrderType = (typeof ORDER_TYPES)[number];

export const SELF_MATCH_PREVENTIONS = ["cancel_maker", "cancel_taker", "reduce"] as const;
export type SelfMatchPrevention = (typeof SELF_MATCH_PREVENTIONS)[number];

export const REPRICE_POLICIES = ["none", "cancel_and_new"] as const;
export type RepricePolicy = (typeof REPRICE_POLICIES)[number];

export type OrderPolicy = {
  type: StrategyOrderType;
  timeInForce?: TradingTimeInForce;
  selfMatchPrevention?: SelfMatchPrevention;
  maxWaitSeconds?: number;
  repricePolicy?: RepricePolicy;
  maxRepriceCount?: number;
};

/* ------------------------------------------------------------------ */
/* 전략 상태                                                             */
/* ------------------------------------------------------------------ */

export const STRATEGY_STATUSES = ["draft", "active", "paused", "archived"] as const;
export type StrategyStatus = (typeof STRATEGY_STATUSES)[number];

/* ------------------------------------------------------------------ */
/* 전략 정의 전체                                                        */
/* ------------------------------------------------------------------ */

export type StrategyDefinition = {
  provider: TradingProvider;
  assetClass: TradingAssetClass;
  name: string;
  description?: string;
  instruments: string[];
  kind: StrategyKind;
  timeframe: StrategyTimeframe;
  trigger: StrategyTrigger;
  executionMode: TradingExecutionMode;
  status: StrategyStatus;
  entryRules?: StrategyRuleGroup;
  exitRules?: StrategyRuleGroup;
  rebalancePolicy?: RebalancePolicy;
  sizingPolicy: SizingPolicy;
  orderPolicy: OrderPolicy;
  riskPolicyId: string;
  version: number;
};

export type StrategyRuleGroup = {
  logic: StrategyRuleGroupLogic;
  conditions: StrategyCondition[];
  groups?: StrategyRuleGroup[];
};

/* ------------------------------------------------------------------ */
/* 전략 평가 스냅샷 (주식 보고서 §6.4)                                     */
/* ------------------------------------------------------------------ */

/** 종목별 지표 스냅샷 */
export type StrategySnapshotInstrument = {
  symbol: string;
  /** 거래일 또는 봉 openTime */
  tradingDate: Date;
  /** 종가 (지표 기준) */
  close: string;
  sma5: string;
  sma20: string;
  sma60: string;
  sma120: string;
  ema12: string;
  ema26: string;
  rsi14: string;
  atr14: string;
  volumeSma20: string;
  valueSma20: string;
  high52w: string;
  low52w: string;
  distanceFromHigh52w: string;
  /** 액면분할 등으로 인한 조정 epoch */
  adjustmentEpoch: number;
};

/** 현재가 스냅샷 */
export type StrategySnapshotQuote = {
  symbol: string;
  price: string;
  fetchedAt: Date;
};

/** 포지션 스냅샷 */
export type StrategySnapshotPosition = {
  symbol: string;
  quantity: string;
  averagePrice: string;
  holdingDays: number;
};

/** 시장 레짐 스냅샷 */
export type StrategySnapshotRegime = {
  indexSymbol: string;
  indexClose: string;
  indexSma200: string;
  aboveSma200: boolean;
  sma200Slope: "up" | "flat" | "down";
};

/**
 * 전략 평가 1회의 입력 스냅샷 전체.
 *
 * 해시만 저장하면 사후 재현이 불가능하므로, 이 구조체 전체를
 * trading_strategy_runs에 저장한다. 일봉 기준이므로 크기는 문제되지 않는다.
 */
export type StrategySnapshot = {
  strategyId: string;
  strategyVersion: number;

  /** 지표 계산 로직 버전. 버전 불일치 시 평가를 거부해야 한다 */
  indicatorVersion: number;

  /** 종목별 지표 (symbol → indicator) */
  instruments: Record<string, StrategySnapshotInstrument>;

  /** 현재가 (symbol → quote) */
  quotes: Record<string, StrategySnapshotQuote>;

  /** 현재 포지션 (symbol → position). 미보유 종목은 없음 */
  positions: Record<string, StrategySnapshotPosition>;

  /** 시장 레짐 */
  regime: StrategySnapshotRegime;

  /** 참조한 위험 정책 */
  riskPolicyId: string;
  riskPolicyVersion: number;
};

/* ------------------------------------------------------------------ */
/* 전략 평가 결과                                                        */
/* ------------------------------------------------------------------ */

export type StrategySignal = {
  symbol: string;
  side: "BUY" | "SELL";
  /** 신호를 발생시킨 조건들 */
  reasons: string[];
  /** signal: 진입/청산. rebalance: 목표 대비 괴리 */
  source: "entry" | "exit" | "rebalance_drift";
  /** rebalance 전용: 목표 비중 */
  targetWeight?: string;
  /** rebalance 전용: 현재 비중 */
  currentWeight?: string;
};

export type StrategyEvalOutput = {
  /** 전략 평가 실행 키 — sha256(strategyId + inputSnapshotHash + evaluatedAt) */
  runKey: string;
  inputSnapshotHash: string;
  signals: StrategySignal[];
  evaluatedAt: Date;
  /** 평가에 사용된 strategy version */
  strategyVersion: number;
};

