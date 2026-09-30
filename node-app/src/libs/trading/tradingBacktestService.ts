/**
 * @docHint
 * @purpose Private Trade Lab — 백테스트 엔진
 * @domain trading
 * @scope private-trade-lab
 *
 * 라이브 평가와 동일한 evaluateStrategy() 호출. 별도 구현 금지.
 */

import { computeAllIndicators } from "libs/trading/tradingIndicatorCompute";
import { computeExecutionCost } from "libs/trading/tradingFeeModel";
import { evaluateStrategy } from "libs/trading/tradingStrategyEvaluator";
import { type StrategyDefinition, type StrategyEvalOutput, type StrategySnapshot, type StrategySnapshotInstrument, type StrategySnapshotPosition } from "types/trading/strategy";
import { type Candle, type TradingProvider, type TradingAssetClass } from "types/trading/adapter";

export interface BacktestParams {
  strategy: StrategyDefinition; candles: Candle[]; indexCandles: Candle[];
  initialCapital: string; slippageBps?: number;
}

export interface BacktestTrade {
  timestamp: Date; symbol: string; side: "BUY" | "SELL";
  quantity: string; price: string;
  cost: { grossAmount: string; fee: string; tax: string; netAmount: string };
  signalReasons: string[];
}

export interface BacktestEquityPoint {
  timestamp: Date; cash: string; holdingsValue: string; totalEquity: string;
}

export interface BacktestResult {
  backtestId: string; strategyId: string; strategyVersion: number;
  startTime: Date; endTime: Date;
  initialCapital: string; finalEquity: string; totalReturnBps: string;
  trades: BacktestTrade[]; equityCurve: BacktestEquityPoint[];
  evaluationCount: number;
}

/* ------------------------------------------------------------------ */
/* 포트폴리오 상태                                                       */
/* ------------------------------------------------------------------ */

type Holding = { quantity: bigint; averagePrice: bigint; firstBoughtAt: Date; lastBoughtAt: Date };
type Portfolio = { cash: bigint; holdings: Map<string, Holding> };

function makePortfolio(initialCapital: string): Portfolio {
  return { cash: BigInt(initialCapital), holdings: new Map() };
}

function holdingsValue(p: Portfolio, prices: Map<string, bigint>): bigint {
  let total = BigInt(0);
  for (const [sym, h] of p.holdings) total = total + h.quantity * (prices.get(sym) ?? BigInt(0));
  return total;
}

function equityStr(p: Portfolio, prices: Map<string, bigint>): string {
  return (p.cash + holdingsValue(p, prices)).toString();
}

/* ------------------------------------------------------------------ */
/* ID 생성                                                              */
/* ------------------------------------------------------------------ */

function makeId(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) { h = ((h << 5) - h) + input.charCodeAt(i); h |= 0; }
  return Math.abs(h).toString(16).padStart(16, "0");
}

/* ------------------------------------------------------------------ */
/* 캔들 → 스냅샷                                                         */
/* ------------------------------------------------------------------ */

export function toSnapshot(
  strategy: StrategyDefinition, candles: Candle[], indexCandles: Candle[],
  p: Portfolio, prices: Map<string, bigint>, symbol: string,
): StrategySnapshot {
  const indices = computeAllIndicators(candles, strategy.instruments[0], indexCandles);
  const last = candles[candles.length - 1];

  const inst: StrategySnapshotInstrument = {
    symbol, tradingDate: last.openTime, close: last.close,
    sma5: indices.sma5, sma20: indices.sma20, sma60: indices.sma60, sma120: indices.sma120,
    ema12: indices.ema12, ema26: indices.ema26,
    rsi14: indices.rsi14, atr14: indices.atr14,
    volumeSma20: indices.volumeSma20, valueSma20: indices.valueSma20,
    high52w: indices.high52w, low52w: indices.low52w,
    distanceFromHigh52w: indices.distanceFromHigh52w, adjustmentEpoch: 0,
  };

  const pos: Record<string, StrategySnapshotPosition> = {};
  for (const [sym, h] of p.holdings) {
    const ap = h.quantity > BigInt(0) ? (h.averagePrice / h.quantity).toString() : "0";
    const days = h.firstBoughtAt ? Math.floor((last.openTime.getTime() - h.firstBoughtAt.getTime()) / 86400000) : 0;
    pos[sym] = { symbol: sym, quantity: h.quantity.toString(), averagePrice: ap, holdingDays: days };
  }

  const quotes: Record<string, { symbol: string; price: string; fetchedAt: Date }> = {};
  for (const sym of strategy.instruments) {
    quotes[sym] = { symbol: sym, price: (prices.get(sym) ?? BigInt(0)).toString(), fetchedAt: last.openTime };
  }

  const instruments: Record<string, StrategySnapshotInstrument> = {};
  for (const sym of strategy.instruments) instruments[sym] = sym === symbol ? inst : { ...inst, symbol: sym, close: "0" };

  return {
    strategyId: strategy.name, strategyVersion: strategy.version, indicatorVersion: 1,
    instruments, quotes, positions: pos,
    regime: { indexSymbol: indices.regimeIndexSymbol, indexClose: last.close,
      indexSma200: indices.sma120, aboveSma200: indices.regimeAboveSma200, sma200Slope: indices.regimeSma200Slope },
    riskPolicyId: "risk-default", riskPolicyVersion: 1,
  };
}

/* ------------------------------------------------------------------ */
/* 시뮬레이션 주문                                                        */
/* ------------------------------------------------------------------ */

function simTrade(
  provider: TradingProvider, assetClass: TradingAssetClass,
  side: "BUY" | "SELL", symbol: string, price: string,
  p: Portfolio, sizingValue: string, slippageBps: number,
  timestamp: Date, reasons: string[],
): BacktestTrade | null {
  const cost = computeExecutionCost(provider, assetClass, side, sizingValue, price, slippageBps);
  const net = BigInt(cost.netAmount);
  const qty = BigInt(sizingValue);

  if (side === "BUY") {
    if (p.cash < net) return null;
    p.cash = p.cash - net;
    const ex = p.holdings.get(symbol);
    if (ex) {
      ex.quantity = ex.quantity + qty;
      ex.averagePrice = ex.averagePrice + BigInt(cost.grossAmount);
      ex.lastBoughtAt = timestamp;
    } else {
      p.holdings.set(symbol, { quantity: qty, averagePrice: BigInt(cost.grossAmount), firstBoughtAt: timestamp, lastBoughtAt: timestamp });
    }
  } else {
    const h = p.holdings.get(symbol);
    if (!h || h.quantity < qty) return null;
    h.quantity = h.quantity - qty;
    if (h.quantity === BigInt(0)) p.holdings.delete(symbol);
    p.cash = p.cash + net;
  }

  return { timestamp, symbol, side, quantity: sizingValue, price: cost.grossAmount,
    cost: { grossAmount: cost.grossAmount, fee: cost.fee, tax: cost.tax, netAmount: cost.netAmount },
    signalReasons: reasons };
}

/* ------------------------------------------------------------------ */
/* 백테스트 메인                                                          */
/* ------------------------------------------------------------------ */

export function runBacktest(params: BacktestParams): BacktestResult {
  const { strategy, candles, indexCandles, initialCapital, slippageBps = 5 } = params;
  const p = makePortfolio(initialCapital);
  const trades: BacktestTrade[] = [];
  const curve: BacktestEquityPoint[] = [];
  let evals = 0;

  const sorted = [...candles].sort((a, b) => a.openTime.getTime() - b.openTime.getTime());
  const sortedIdx = [...indexCandles].sort((a, b) => a.openTime.getTime() - b.openTime.getTime());
  const L = 200;

  if (sorted.length < L) {
    return { backtestId: makeId(strategy.name + initialCapital), strategyId: strategy.name, strategyVersion: strategy.version,
      startTime: sorted[0]?.openTime ?? new Date(0), endTime: sorted[sorted.length - 1]?.openTime ?? new Date(0),
      initialCapital, finalEquity: initialCapital, totalReturnBps: "0", trades: [], equityCurve: [], evaluationCount: 0 };
  }

  for (let i = L; i < sorted.length; i++) {
    const win = sorted.slice(0, i);
    const winIdx = sortedIdx.slice(0, Math.min(i, sortedIdx.length));
    const cur = sorted[i];
    if (!cur.isFinal) continue;

    const prices = new Map<string, bigint>();
    prices.set(cur.symbol, BigInt(cur.close));

    const snap = toSnapshot(strategy, win, winIdx, p, prices, cur.symbol);
    const result = evaluateStrategy(strategy, snap, cur.openTime);
    evals++;

    for (const sig of result.signals) {
      const qty = strategy.kind === "rebalance"
        ? rebalanceQty(strategy, sig, p, prices)
        : strategy.sizingPolicy.value;
      const t = simTrade(strategy.provider, strategy.assetClass, sig.side, sig.symbol, cur.close, p, qty, slippageBps, cur.openTime, sig.reasons);
      if (t) trades.push(t);
    }

    curve.push({ timestamp: cur.openTime, cash: p.cash.toString(), holdingsValue: holdingsValue(p, prices).toString(), totalEquity: equityStr(p, prices) });
  }

  const id = makeId(strategy.name + initialCapital + String(Date.now()));
  const fin = curve.length > 0 ? curve[curve.length - 1].totalEquity : initialCapital;
  const ret = retBps(initialCapital, fin);

  return { backtestId: id, strategyId: strategy.name, strategyVersion: strategy.version,
    startTime: sorted[L]?.openTime ?? sorted[0].openTime, endTime: sorted[sorted.length - 1].openTime,
    initialCapital, finalEquity: fin, totalReturnBps: ret, trades, equityCurve: curve, evaluationCount: evals };
}

function rebalanceQty(
  strategy: StrategyDefinition, sig: StrategyEvalOutput["signals"][number],
  p: Portfolio, prices: Map<string, bigint>,
): string {
  const total = p.cash + holdingsValue(p, prices);
  const tW = BigInt(Math.floor(Number(sig.targetWeight ?? "0") * 10000));
  const tV = total * tW / BigInt(10000);
  const cV = (p.holdings.get(sig.symbol)?.quantity ?? BigInt(0)) * (prices.get(sig.symbol) ?? BigInt(0));
  const d = sig.side === "BUY" ? tV - cV : cV - tV;
  return d > BigInt(0) ? d.toString() : "0";
}

function retBps(initial: string, final: string): string {
  const i = BigInt(initial);
  if (i === BigInt(0)) return "0";
  return ((BigInt(final) - i) * BigInt(10000) / i).toString();
}
