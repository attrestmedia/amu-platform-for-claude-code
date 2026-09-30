/**
 * @docHint
 * @purpose Private Trade Lab — 성과 롤업 계산 (backtest·paper·live 공통)
 * @process computePerformance  computeContributions  computeDrawdown
 * @domain trading
 * @scope private-trade-lab
 *
 * Paper와 실거래를 같은 함수로 집계한다. 두 모드의 괴리 자체가 진단 지표.
 */

import type { BacktestTrade } from "libs/trading/tradingBacktestService";
import type { PaperFill } from "libs/trading/tradingPaperExecutionService";
import type { PerformanceMode } from "models/trading/TradingPerformanceSchema";

/* ------------------------------------------------------------------ */
/* 공통 trade 타입                                                       */
/* ------------------------------------------------------------------ */

export type TradeRecord = {
  timestamp: Date;
  symbol: string;
  side: "BUY" | "SELL";
  netAmount: string;
  fee: string;
  tax: string;
  filledQty?: string;
};

/* ------------------------------------------------------------------ */
/* 롤업 결과                                                             */
/* ------------------------------------------------------------------ */

export interface PerformanceRollup {
  strategyId: string;
  strategyVersion: number;
  mode: PerformanceMode;
  periodStart: Date;
  periodEnd: Date;

  signalCount: number;
  tradeCount: number;
  winCount: number;
  lossCount: number;
  winRateBps: string;

  grossReturnBps: string;
  feeTotal: string;
  taxTotal: string;
  netReturnBps: string;

  avgWinAmount: string;
  avgLossAmount: string;
  profitLossRatio: string;

  avgHoldingDays: string;
  maxDrawdownBps: string;

  contributions: Array<{
    symbol: string;
    tradeCount: number;
    winCount: number;
    netReturnBps: string;
  }>;
}

/* ------------------------------------------------------------------ */
/* 변환                                                                 */
/* ------------------------------------------------------------------ */

export function backtestTradesToRecords(trades: BacktestTrade[]): TradeRecord[] {
  return trades.map((t) => ({
    timestamp: t.timestamp, symbol: t.symbol, side: t.side,
    netAmount: t.cost.netAmount, fee: t.cost.fee, tax: t.cost.tax,
    filledQty: t.quantity,
  }));
}

export function paperFillsToRecords(fills: PaperFill[]): TradeRecord[] {
  return fills.map((f) => ({
    timestamp: f.timestamp, symbol: f.symbol, side: f.side,
    netAmount: f.cost.netAmount, fee: f.cost.fee, tax: f.cost.tax,
    filledQty: f.filledQty,
  }));
}

/* ------------------------------------------------------------------ */
/* 계산                                                                 */
/* ------------------------------------------------------------------ */

export function computePerformance(
  strategyId: string,
  strategyVersion: number,
  mode: PerformanceMode,
  periodStart: Date,
  periodEnd: Date,
  signalCount: number,
  records: TradeRecord[],
  equityCurve?: Array<{ timestamp: Date; totalEquity: string }>,
): PerformanceRollup {
  const wins = records.filter((r) => BigInt(r.netAmount) > BigInt(0));
  const losses = records.filter((r) => BigInt(r.netAmount) < BigInt(0));

  const winCount = wins.length;
  const lossCount = losses.length;
  const tradeCount = records.length;
  const winRateBps = tradeCount > 0
    ? (BigInt(winCount) * BigInt(10000) / BigInt(tradeCount)).toString()
    : "0";

  const feeTotal = records.reduce((s, r) => (BigInt(s) + BigInt(r.fee)).toString(), "0");
  const taxTotal = records.reduce((s, r) => (BigInt(s) + BigInt(r.tax)).toString(), "0");

  // netReturnBps = sum(netAmount) / initialCapital... but we don't have initialCapital.
  // Use total net return from trades.
  const netReturn = records.reduce((s, r) => (BigInt(s) + BigInt(r.netAmount)).toString(), "0");

  const avgWin = winCount > 0
    ? (wins.reduce((s, r) => BigInt(s) + BigInt(r.netAmount), BigInt(0)) / BigInt(winCount)).toString()
    : "0";
  const avgLoss = lossCount > 0
    ? (losses.reduce((s, r) => BigInt(s) + BigInt(r.netAmount), BigInt(0)) / BigInt(lossCount)).toString()
    : "0";

  const absAvgLoss = avgLoss.startsWith("-") ? avgLoss.slice(1) : avgLoss;
  const plRatio = BigInt(absAvgLoss) > BigInt(0)
    ? (BigInt(avgWin) * BigInt(100) / BigInt(absAvgLoss)).toString()
    : "0";

  const contributions = computeContributions(records);

  const maxDd = equityCurve ? computeMaxDrawdownBps(equityCurve) : "0";

  return {
    strategyId, strategyVersion, mode, periodStart, periodEnd,
    signalCount, tradeCount, winCount, lossCount, winRateBps,
    grossReturnBps: netReturn,
    feeTotal, taxTotal,
    netReturnBps: netReturn,
    avgWinAmount: avgWin, avgLossAmount: avgLoss, profitLossRatio: plRatio,
    avgHoldingDays: "0",
    maxDrawdownBps: maxDd,
    contributions,
  };
}

function computeContributions(records: TradeRecord[]): PerformanceRollup["contributions"] {
  const bySymbol = new Map<string, TradeRecord[]>();
  for (const r of records) {
    const arr = bySymbol.get(r.symbol) ?? [];
    arr.push(r);
    bySymbol.set(r.symbol, arr);
  }

  return [...bySymbol.entries()].map(([symbol, trades]) => {
    const wc = trades.filter((r) => BigInt(r.netAmount) > BigInt(0)).length;
    const nr = trades.reduce((s, r) => (BigInt(s) + BigInt(r.netAmount)).toString(), "0");
    return { symbol, tradeCount: trades.length, winCount: wc, netReturnBps: nr };
  });
}

function computeMaxDrawdownBps(equityCurve: Array<{ timestamp: Date; totalEquity: string }>): string {
  if (equityCurve.length < 2) return "0";
  let peak = BigInt(equityCurve[0].totalEquity);
  let maxDd = BigInt(0);

  for (const point of equityCurve) {
    const v = BigInt(point.totalEquity);
    if (v > peak) peak = v;
    const dd = peak > BigInt(0) ? (peak - v) * BigInt(10000) / peak : BigInt(0);
    if (dd > maxDd) maxDd = dd;
  }

  return maxDd.toString();
}
