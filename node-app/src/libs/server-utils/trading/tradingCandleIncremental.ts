import "server-only";

import { createHash } from "crypto";
import type { Candle, TradingProviderAdapter } from "types/trading/adapter";
import { logger } from "utils/log";
import { getLatestCandleOpenTime } from "./tradingCandleStore";

/**
 * @docHint
 * @purpose Private Trade Lab — 캔들 증분 갱신 + 연속성 검증
 * @process 확정 봉 증분 배치  날짜·시각 연속성 검증  구멍 발견 시 재백필 큐  전략 paused
 * @domain trading
 * @scope private-trade-lab
 *
 * 설계 정본: 통합 보고서 §5.1 · §7.2.
 * TL-401: 캔들 증분 갱신 + 연속성 검증
 */

const CANDLE_MODEL = "TradingCandle";

async function getModel() {
  const { TradingCandleSchema } = await import("models/trading");
  const mongoose = await import("mongoose");
  return mongoose.models[CANDLE_MODEL] ?? mongoose.model(CANDLE_MODEL, TradingCandleSchema);
}

/** interval → ms duration */
const INTERVAL_DURATION_MS: Record<string, number> = {
  "1m": 60_000, "3m": 180_000, "5m": 300_000, "10m": 600_000,
  "15m": 900_000, "30m": 1_800_000, "60m": 3_600_000,
  "240m": 14_400_000, "1d": 86_400_000, "1w": 604_800_000,
  "1M": 2_592_000_000,
};

function getIntervalMs(interval: string): number {
  return INTERVAL_DURATION_MS[interval] ?? 0;
}

function computeSourceHash(candle: Candle): string {
  const payload = `${candle.symbol}|${candle.interval}|${candle.openTime.toISOString()}|${candle.open}|${candle.high}|${candle.low}|${candle.close}|${candle.volume}`;
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

/* ------------------------------------------------------------------ */
/* 연속성 검증                                                          */
/* ------------------------------------------------------------------ */

export interface ContinuityGap {
  before: Date; after: Date; missingCount: number;
}

export interface ContinuityResult {
  valid: boolean; checkedCount: number; gaps: ContinuityGap[];
}

export async function verifyCandleContinuity(
  provider: string, symbol: string, interval: string,
  opts: { limit?: number } = {},
): Promise<ContinuityResult> {
  const Model = await getModel();
  const limit = opts.limit ?? 200;
  const durationMs = getIntervalMs(interval);
  if (durationMs === 0) {
    return { valid: true, checkedCount: 0, gaps: [] };
  }
  const candles = await Model.find(
    { provider, symbol, interval, isFinal: true },
    { openTime: 1 },
  ).sort({ openTime: 1 }).limit(limit).lean();
  if (candles.length < 2) return { valid: true, checkedCount: candles.length, gaps: [] };

  const gaps: ContinuityGap[] = [];
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1].openTime.getTime();
    const curr = candles[i].openTime.getTime();
    const expected = prev + durationMs;
    if (curr !== expected) {
      gaps.push({
        before: candles[i - 1].openTime,
        after: candles[i].openTime,
        missingCount: curr > expected ? Math.round((curr - expected) / durationMs) : 0,
      });
    }
  }
  return { valid: gaps.length === 0, checkedCount: candles.length, gaps };
}


/* ------------------------------------------------------------------ */
/* 증분 갱신                                                            */
/* ------------------------------------------------------------------ */

export interface IncrementalSyncResult {
  provider: string; symbol: string; interval: string;
  saved: number; skipped: number;
  continuity: ContinuityResult;
  needsBackfill: boolean;
}

export async function syncIncrementalCandles(
  adapter: TradingProviderAdapter,
  symbol: string,
  interval: string,
  opts: { countPerPage?: number } = {},
): Promise<IncrementalSyncResult> {
  const Model = await getModel();
  const countPerPage = opts.countPerPage ?? 200;

  const lastOpenTime = await getLatestCandleOpenTime(adapter.provider, symbol, interval);
  if (!lastOpenTime) {
    logger.info("[tradingCandleIncremental] no stored candles — full backfill needed", {
      provider: adapter.provider, symbol, interval,
    });
    return {
      provider: adapter.provider, symbol, interval,
      saved: 0, skipped: 0,
      continuity: { valid: true, checkedCount: 0, gaps: [] },
      needsBackfill: true,
    };
  }

  let saved = 0;
  let skipped = 0;
  let cursor = new Date();
  let reachedExisting = false;

  while (!reachedExisting) {
    const candles: Candle[] = await adapter.getCandles({
      symbol, interval, count: countPerPage, to: cursor,
    });
    if (candles.length === 0) break;

    for (const candle of candles) {
      if (candle.openTime.getTime() <= lastOpenTime.getTime()) {
        reachedExisting = true; break;
      }
      if (!candle.isFinal) { skipped++; continue; }

      try {
        await Model.updateOne(
          {
            provider: adapter.provider, symbol: candle.symbol,
            interval: candle.interval, openTime: candle.openTime,
          },
          { $set: {
            assetClass: adapter.assetClass,
            open: candle.open, high: candle.high, low: candle.low,
            close: candle.close, volume: candle.volume,
            isFinal: true, sourceHash: computeSourceHash(candle),
          } },
          { upsert: true },
        );
        saved++;
      } catch (error) {
        const code = (error as { code?: number }).code;
        const msg = (error as { message?: string }).message ?? "";
        if (code === 11000 || msg.includes("E11000") || msg.includes("duplicate key")) {
          skipped++; continue;
        }
        throw error;
      }
    }

    const oldest = candles[candles.length - 1];
    cursor = new Date(oldest.openTime.getTime() - 1);
    if (candles.length < countPerPage) break;
  }

  const continuity = await verifyCandleContinuity(adapter.provider, symbol, interval);

  logger.info("[tradingCandleIncremental] sync complete", {
    provider: adapter.provider, symbol, interval,
    saved, skipped, valid: continuity.valid, gapCount: continuity.gaps.length,
  });

  return {
    provider: adapter.provider, symbol, interval,
    saved, skipped, continuity,
    needsBackfill: !continuity.valid,
  };
}


/* ------------------------------------------------------------------ */
/* 재백필 큐                                                            */
/* ------------------------------------------------------------------ */

const REQUEUE_SET_KEY = "trading:backfill:requeue";

export async function requeueBackfill(
  provider: string, symbol: string, interval: string,
): Promise<void> {
  try {
    const { getRedisClient } = await import("libs/cache/redisClient");
    const redis = await getRedisClient();
    const entry = JSON.stringify({ provider, symbol, interval,
      queuedAt: new Date().toISOString() });
    await redis.sadd(REQUEUE_SET_KEY, entry);
  } catch (error) {
    logger.error("[tradingCandleIncremental] requeue failed", {
      provider, symbol, interval, error: (error as Error).message,
    });
  }
}

export async function listBackfillQueue(): Promise<
  { provider: string; symbol: string; interval: string; queuedAt: string }[]
> {
  try {
    const { getRedisClient } = await import("libs/cache/redisClient");
    const redis = await getRedisClient();
    const members = await redis.smembers(REQUEUE_SET_KEY);
    return members
      .map((m) => { try { return JSON.parse(m); } catch { return null; } })
      .filter((e): e is { provider: string; symbol: string; interval: string;
        queuedAt: string } => e != null);
  } catch { return []; }
}

export async function removeBackfillQueueEntry(
  provider: string, symbol: string, interval: string,
): Promise<void> {
  try {
    const { getRedisClient } = await import("libs/cache/redisClient");
    const redis = await getRedisClient();
    const members = await redis.smembers(REQUEUE_SET_KEY);
    for (const m of members) {
      try {
        const parsed = JSON.parse(m);
        if (parsed.provider === provider &&
            parsed.symbol === symbol &&
            parsed.interval === interval) {
          await redis.srem(REQUEUE_SET_KEY, m);
        }
      } catch { /* skip */ }
    }
  } catch { /* best-effort */ }
}
