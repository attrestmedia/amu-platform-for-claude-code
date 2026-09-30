/**
 * @docHint
 * @purpose Private Trade Lab - Paper Trading (realistic fill model)
 * @domain trading
 * @scope private-trade-lab
 */

import { computeExecutionCost } from "libs/trading/tradingFeeModel";
import { evaluateStrategy } from "libs/trading/tradingStrategyEvaluator";
import { toSnapshot } from "libs/trading/tradingBacktestService";
import { type StrategyDefinition, type StrategyEvalOutput } from "types/trading/strategy";
import { type Candle } from "types/trading/adapter";

export interface PaperSessionParams {
  strategy: StrategyDefinition; candles: Candle[]; indexCandles: Candle[];
  initialCapital: string; slippageBps?: number; maxVolumeFillRatio?: number;
}

export interface PaperFill {
  timestamp: Date; symbol: string; side: "BUY" | "SELL";
  requestedQty: string; filledQty: string; unfilledQty: string;
  limitPrice: string; fillPrice: string;
  cost: { grossAmount: string; fee: string; tax: string; netAmount: string };
  signalReasons: string[];
}

export interface PaperEquityPoint {
  timestamp: Date; cash: string; holdingsValue: string; totalEquity: string;
}

export interface PaperSessionResult {
  sessionId: string; strategyId: string; strategyVersion: number;
  startTime: Date; endTime: Date;
  initialCapital: string; finalEquity: string; totalReturnBps: string;
  fills: PaperFill[]; equityCurve: PaperEquityPoint[];
  evaluationCount: number; unfilledCount: number;
}

type Holding = { quantity: bigint; averagePrice: bigint; firstBoughtAt: Date; lastBoughtAt: Date };
type PF = { cash: bigint; holdings: Map<string, Holding> };

function pf(c: string): PF { return { cash: BigInt(c), holdings: new Map() }; }
function hv(p: PF, prices: Map<string, bigint>): bigint {
  let t = BigInt(0);
  for (const [s, h] of p.holdings) t = t + h.quantity * (prices.get(s) ?? BigInt(0));
  return t;
}
function eqs(p: PF, prices: Map<string, bigint>): string { return (p.cash + hv(p, prices)).toString(); }
function mid(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
  return Math.abs(h).toString(16).padStart(16, "0");
}

export function simulateFill(
  side: "BUY" | "SELL", limitPrice: string, requestedQty: string,
  candle: Candle, maxVolumeFillRatio: number = 0.1,
): { filledQty: string; unfilledQty: string; fillPrice: string } {
  const price = BigInt(limitPrice);
  const qty = BigInt(requestedQty);
  const can = side === "BUY" ? price >= BigInt(candle.low) : price <= BigInt(candle.high);
  if (!can) return { filledQty: "0", unfilledQty: requestedQty, fillPrice: limitPrice };
  const max = BigInt(candle.volume) * BigInt(Math.floor(maxVolumeFillRatio * 100)) / BigInt(100);
  const eff = max > BigInt(0) ? max : BigInt(1);
  const filled = qty <= eff ? qty : eff;
  return { filledQty: filled.toString(), unfilledQty: (qty - filled).toString(), fillPrice: limitPrice };
}

export function runPaperSession(params: PaperSessionParams): PaperSessionResult {
  const { strategy, candles, indexCandles, initialCapital, slippageBps = 5, maxVolumeFillRatio = 0.1 } = params;
  const p = pf(initialCapital);
  const fills: PaperFill[] = [];
  const curve: PaperEquityPoint[] = [];
  let evals = 0;
  let unfTot = 0;

  const srt = [...candles].sort((a, b) => a.openTime.getTime() - b.openTime.getTime());
  const sidx = [...indexCandles].sort((a, b) => a.openTime.getTime() - b.openTime.getTime());
  const L = 200;

  if (srt.length < L) {
    return { sessionId: mid(strategy.name + initialCapital), strategyId: strategy.name, strategyVersion: strategy.version,
      startTime: srt[0]?.openTime ?? new Date(0), endTime: srt[srt.length - 1]?.openTime ?? new Date(0),
      initialCapital, finalEquity: initialCapital, totalReturnBps: "0", fills: [], equityCurve: [], evaluationCount: 0, unfilledCount: 0 };
  }

  for (let i = L; i < srt.length; i++) {
    const win = srt.slice(0, i);
    const widx = sidx.slice(0, Math.min(i, sidx.length));
    const cur = srt[i];
    if (!cur.isFinal) continue;

    const prices = new Map<string, bigint>();
    prices.set(cur.symbol, BigInt(cur.close));

    const snap = toSnapshot(strategy, win, widx, p, prices, cur.symbol);
    const result = evaluateStrategy(strategy, snap, cur.openTime);
    evals++;

    for (const sig of result.signals) {
      const qty = strategy.kind === "rebalance" ? rq(strategy, sig, p, prices) : strategy.sizingPolicy.value;
      const fill = simulateFill(sig.side, cur.close, qty, cur, maxVolumeFillRatio);

      if (BigInt(fill.filledQty) > BigInt(0)) {
        const cost = computeExecutionCost(strategy.provider, strategy.assetClass, sig.side, fill.filledQty, fill.fillPrice, slippageBps);
        const net = BigInt(cost.netAmount);
        if (sig.side === "BUY" && p.cash >= net) {
          p.cash = p.cash - net;
          const ex = p.holdings.get(sig.symbol);
          if (ex) { ex.quantity = ex.quantity + BigInt(fill.filledQty); ex.averagePrice = ex.averagePrice + BigInt(cost.grossAmount); }
          else p.holdings.set(sig.symbol, { quantity: BigInt(fill.filledQty), averagePrice: BigInt(cost.grossAmount), firstBoughtAt: cur.openTime, lastBoughtAt: cur.openTime });
        } else if (sig.side === "SELL") {
          const h = p.holdings.get(sig.symbol);
          if (h && h.quantity >= BigInt(fill.filledQty)) {
            h.quantity = h.quantity - BigInt(fill.filledQty);
            if (h.quantity === BigInt(0)) p.holdings.delete(sig.symbol);
            p.cash = p.cash + net;
          }
        }
        fills.push({ timestamp: cur.openTime, symbol: sig.symbol, side: sig.side,
          requestedQty: qty, filledQty: fill.filledQty, unfilledQty: fill.unfilledQty,
          limitPrice: fill.fillPrice, fillPrice: fill.fillPrice,
          cost: { grossAmount: cost.grossAmount, fee: cost.fee, tax: cost.tax, netAmount: cost.netAmount },
          signalReasons: sig.reasons });
      }
      if (BigInt(fill.unfilledQty) > BigInt(0)) unfTot++;
    }
    curve.push({ timestamp: cur.openTime, cash: p.cash.toString(), holdingsValue: hv(p, prices).toString(), totalEquity: eqs(p, prices) });
  }

  const id = mid(strategy.name + initialCapital + String(Date.now()));
  const fin = curve.length > 0 ? curve[curve.length - 1].totalEquity : initialCapital;
  const iB = BigInt(initialCapital);
  const ret = iB === BigInt(0) ? "0" : ((BigInt(fin) - iB) * BigInt(10000) / iB).toString();

  return { sessionId: id, strategyId: strategy.name, strategyVersion: strategy.version,
    startTime: srt[L]?.openTime ?? srt[0].openTime, endTime: srt[srt.length - 1].openTime,
    initialCapital, finalEquity: fin, totalReturnBps: ret, fills, equityCurve: curve, evaluationCount: evals, unfilledCount: unfTot };
}

function rq(strategy: StrategyDefinition, sig: StrategyEvalOutput["signals"][number], p: PF, prices: Map<string, bigint>): string {
  const total = p.cash + hv(p, prices);
  const tW = BigInt(Math.floor(Number(sig.targetWeight ?? "0") * 10000));
  const tV = total * tW / BigInt(10000);
  const cV = (p.holdings.get(sig.symbol)?.quantity ?? BigInt(0)) * (prices.get(sig.symbol) ?? BigInt(0));
  const d = sig.side === "BUY" ? tV - cV : cV - tV;
  return d > BigInt(0) ? d.toString() : "0";
}
