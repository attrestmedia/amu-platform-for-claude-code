/**
 * @docHint
 * @purpose Private Trade Lab — 지표 계산 유틸 (순수 함수 · server-only 없음)
 * @process SMA  EMA  RSI  ATR  52주 고저  시장 레짐  결정론적 계산
 * @domain trading
 * @scope private-trade-lab
 *
 * 설계 정본: 주식 보고서 §5.4.
 * TL-402: 지표 사전 계산 — trading_indicators
 */

import type { Candle } from "types/trading/adapter";

/* ------------------------------------------------------------------ */
/* 헬퍼 — BigInt 산술                                                   */
/* ------------------------------------------------------------------ */

function mul(a: string, b: string): string {
  return (BigInt(a) * BigInt(b)).toString();
}

function div(a: string, b: string, scale: number = 8): string {
  if (BigInt(b) === BigInt(0)) return "0";
  const numerator = BigInt(a) * BigInt(10) ** BigInt(scale);
  return (numerator / BigInt(b)).toString();
}

function _maxStr(a: string, b: string): string {
  return BigInt(a) > BigInt(b) ? a : b;
}

function _minStr(a: string, b: string): string {
  return BigInt(a) < BigInt(b) ? a : b;
}

function sortedByTime<T extends Pick<Candle, "openTime">>(candles: T[]): T[] {
  return [...candles].sort((a, b) => a.openTime.getTime() - b.openTime.getTime());
}

/* ------------------------------------------------------------------ */
/* SMA                                                                 */
/* ------------------------------------------------------------------ */

export function computeSMA(
  candles: Pick<Candle, "close">[], period: number,
): string {
  const slice = candles.slice(-period);
  if (slice.length === 0) return "0";
  let sum = BigInt(0);
  for (const c of slice) sum += BigInt(c.close);
  return (sum / BigInt(slice.length)).toString();
}


/* ------------------------------------------------------------------ */
/* EMA                                                                 */
/* ------------------------------------------------------------------ */

const SCALE = BigInt("10000000000");

export function computeEMA(
  candles: Pick<Candle, "close" | "openTime">[], period: number,
): string {
  if (candles.length === 0) return "0";
  const sorted = sortedByTime(candles);
  if (sorted.length < period) return "0";

  const multiplier = (BigInt(2) * SCALE) / BigInt(period + 1);
  let sum = BigInt(0);
  for (let i = 0; i < period; i++) sum += BigInt(sorted[i].close) * SCALE;
  let ema = sum / BigInt(period);

  for (let i = period; i < sorted.length; i++) {
    const closeScaled = BigInt(sorted[i].close) * SCALE;
    ema = ((closeScaled - ema) * multiplier) / SCALE + ema;
  }
  return (ema / SCALE).toString();
}

/* ------------------------------------------------------------------ */
/* RSI — Wilder's smoothing                                            */
/* ------------------------------------------------------------------ */

export function computeRSI(
  candles: Pick<Candle, "close" | "openTime">[], period: number = 14,
): string {
  if (candles.length < period + 1) return "0";
  const sorted = sortedByTime(candles);

  let avgGain = BigInt(0), avgLoss = BigInt(0);
  for (let i = 1; i <= period; i++) {
    const ch = BigInt(sorted[i].close) * SCALE - BigInt(sorted[i - 1].close) * SCALE;
    if (ch > BigInt(0)) avgGain += ch; else avgLoss += -ch;
  }
  avgGain /= BigInt(period); avgLoss /= BigInt(period);

  for (let i = period + 1; i < sorted.length; i++) {
    const ch = BigInt(sorted[i].close) * SCALE - BigInt(sorted[i - 1].close) * SCALE;
    avgGain = ((avgGain * BigInt(period - 1)) + (ch > BigInt(0) ? ch : BigInt(0))) / BigInt(period);
    avgLoss = ((avgLoss * BigInt(period - 1)) + (ch < BigInt(0) ? -ch : BigInt(0))) / BigInt(period);
  }

  if (avgLoss === BigInt(0)) return "100";
  const rs = (avgGain * SCALE) / avgLoss;
  const rsi = BigInt(100) * SCALE - (BigInt(100) * SCALE * SCALE) / (SCALE + rs);
  return (rsi / SCALE).toString();
}

/* ------------------------------------------------------------------ */
/* ATR                                                                 */
/* ------------------------------------------------------------------ */

export function computeATR(
  candles: Pick<Candle, "high" | "low" | "close" | "openTime">[], period: number = 14,
): string {
  if (candles.length < period + 1) return "0";
  const sorted = sortedByTime(candles);

  function tr(prev: Pick<Candle, "close">, curr: Pick<Candle, "high" | "low">): bigint {
    const h = BigInt(curr.high), l = BigInt(curr.low), p = BigInt(prev.close);
    const hl = h - l, hp = h > p ? h - p : p - h, lp = l > p ? l - p : p - l;
    let m = hl; if (hp > m) m = hp; if (lp > m) m = lp; return m;
  }

  let atr = BigInt(0);
  for (let i = 1; i <= period; i++) atr += tr(sorted[i - 1], sorted[i]);
  atr /= BigInt(period);
  for (let i = period + 1; i < sorted.length; i++)
    atr = ((atr * BigInt(period - 1)) + tr(sorted[i - 1], sorted[i])) / BigInt(period);
  return atr.toString();
}


/* ------------------------------------------------------------------ */
/* Volume / Value SMA                                                   */
/* ------------------------------------------------------------------ */

export function computeVolumeSMA(
  candles: Pick<Candle, "volume">[], period: number = 20,
): string {
  return computeSMA(candles.map(c => ({ close: c.volume })), period);
}

export function computeValueSMA(
  candles: Pick<Candle, "close" | "volume">[], period: number = 20,
): string {
  return computeSMA(candles.map(c => ({ close: mul(c.close, c.volume) })), period);
}

/* ------------------------------------------------------------------ */
/* 52주 고저                                                            */
/* ------------------------------------------------------------------ */

export interface HighLow52W {
  high52w: string; low52w: string; distanceFromHigh52w: string;
}

export function compute52WeekHighLow(
  candles: Pick<Candle, "high" | "low" | "close">[], latestClose: string,
): HighLow52W {
  let high = "0", low = candles.length > 0 ? candles[0].low : "0";
  for (const c of candles) {
    if (BigInt(c.high) > BigInt(high)) high = c.high;
    if (BigInt(c.low) < BigInt(low)) low = c.low;
  }
  const distance = BigInt(high) > BigInt(0)
    ? div((BigInt(high) - BigInt(latestClose)).toString(), high, 4) : "0";
  return { high52w: high, low52w: low, distanceFromHigh52w: distance };
}

/* ------------------------------------------------------------------ */
/* 시장 레짐                                                            */
/* ------------------------------------------------------------------ */

export type RegimeSlope = "up" | "flat" | "down";

export interface MarketRegime {
  indexSymbol: string; aboveSma200: boolean; sma200Slope: RegimeSlope;
}

export function computeRegime(
  indexSymbol: string,
  indexCandles: Pick<Candle, "close" | "openTime">[],
  currentClose: string,
): MarketRegime {
  const sorted = sortedByTime(indexCandles);
  const sma200 = computeSMA(sorted.map(c => ({ close: c.close })), 200);
  const aboveSma200 = BigInt(currentClose) > BigInt(sma200);

  const prevSlice = sorted.slice(0, Math.max(1, sorted.length - 20));
  const sma200Prev = computeSMA(prevSlice.map(c => ({ close: c.close })), 200);

  const diff = BigInt(sma200) - BigInt(sma200Prev);
  const threshold = BigInt(sma200Prev) / BigInt(200);
  let slope: RegimeSlope;
  if (diff > threshold) slope = "up";
  else if (diff < -threshold) slope = "down";
  else slope = "flat";

  return { indexSymbol, aboveSma200, sma200Slope: slope };
}

/* ------------------------------------------------------------------ */
/* 통합 계산                                                            */
/* ------------------------------------------------------------------ */

export interface ComputedIndicators {
  sma5: string; sma20: string; sma60: string; sma120: string;
  ema12: string; ema26: string;
  rsi14: string; atr14: string;
  volumeSma20: string; valueSma20: string;
  high52w: string; low52w: string; distanceFromHigh52w: string;
  regimeIndexSymbol: string; regimeAboveSma200: boolean; regimeSma200Slope: RegimeSlope;
}

export function computeAllIndicators(
  candles: (Pick<Candle, "high" | "low" | "close" | "volume" | "openTime">)[],
  indexSymbol: string = "",
  indexCandles: Pick<Candle, "close" | "openTime">[] = [],
): ComputedIndicators {
  const sorted = sortedByTime(candles);
  const latestClose = sorted.length > 0 ? sorted[sorted.length - 1].close : "0";

  const regime = indexSymbol && indexCandles.length > 0
    ? computeRegime(indexSymbol, indexCandles, latestClose)
    : { indexSymbol: "", aboveSma200: false, sma200Slope: "flat" as RegimeSlope };

  const hl = compute52WeekHighLow(candles, latestClose);

  return {
    sma5: computeSMA(sorted.map(c => ({ close: c.close })), 5),
    sma20: computeSMA(sorted.map(c => ({ close: c.close })), 20),
    sma60: computeSMA(sorted.map(c => ({ close: c.close })), 60),
    sma120: computeSMA(sorted.map(c => ({ close: c.close })), 120),
    ema12: computeEMA(sorted, 12),
    ema26: computeEMA(sorted, 26),
    rsi14: computeRSI(sorted, 14),
    atr14: computeATR(sorted, 14),
    volumeSma20: computeVolumeSMA(sorted, 20),
    valueSma20: computeValueSMA(sorted, 20),
    high52w: hl.high52w, low52w: hl.low52w,
    distanceFromHigh52w: hl.distanceFromHigh52w,
    regimeIndexSymbol: regime.indexSymbol,
    regimeAboveSma200: regime.aboveSma200,
    regimeSma200Slope: regime.sma200Slope,
  };
}
