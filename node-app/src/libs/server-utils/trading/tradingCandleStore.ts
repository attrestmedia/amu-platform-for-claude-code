import "server-only";

import { createHash } from "crypto";
import type { Candle, CandleRequest, TradingProviderAdapter } from "types/trading/adapter";
import { logger } from "utils/log";

/**
 * @docHint
 * @purpose Private Trade Lab — trading_candles 백필 스토어 (체크포인트 재개)
 * @process 증분 페이지네이션  upsert  진행률 체크포인트  sourceHash 무결성
 * @domain trading
 * @scope private-trade-lab
 *
 * 설계 정본: 통합 보고서 §5.1 · 토스 증권 로드맵 §5.
 * TL-400: trading_candles 스키마 + 백필 (체크포인트 재개)
 */

const CANDLE_MODEL = "TradingCandle";
const CHECKPOINT_TTL = 7 * 24 * 60 * 60;

async function getModel() {
  const { TradingCandleSchema } = await import("models/trading");
  const mongoose = await import("mongoose");
  return mongoose.models[CANDLE_MODEL] ?? mongoose.model(CANDLE_MODEL, TradingCandleSchema);
}

function computeSourceHash(candle: Candle): string {
  const payload = `${candle.symbol}|${candle.interval}|${candle.openTime.toISOString()}|${candle.open}|${candle.high}|${candle.low}|${candle.close}|${candle.volume}`;
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

function encodeCheckpointKey(provider: string, symbol: string, interval: string): string {
  return `trading:backfill:checkpoint:${provider}:${symbol}:${interval}`;
}

async function loadCheckpoint(
  provider: string, symbol: string, interval: string,
): Promise<Date | null> {
  try {
    const { getRedisClient } = await import("libs/cache/redisClient");
    const redis = await getRedisClient();
    const val = await redis.get(encodeCheckpointKey(provider, symbol, interval));
    if (!val) return null;
    return new Date(val);
  } catch { return null; }
}

async function saveCheckpoint(
  provider: string, symbol: string, interval: string, openTime: Date,
): Promise<void> {
  try {
    const { getRedisClient } = await import("libs/cache/redisClient");
    const redis = await getRedisClient();
    await redis.setex(
      encodeCheckpointKey(provider, symbol, interval),
      CHECKPOINT_TTL,
      openTime.toISOString(),
    );
  } catch (error) {
    logger.warn("[tradingCandleStore] checkpoint save failed", {
      provider, symbol, interval,
      error: (error as Error).message,
    });
  }
}

async function clearCheckpoint(
  provider: string, symbol: string, interval: string,
): Promise<void> {
  try {
    const { getRedisClient } = await import("libs/cache/redisClient");
    await (await getRedisClient()).del(encodeCheckpointKey(provider, symbol, interval));
  } catch { /* best-effort */ }
}

/* ------------------------------------------------------------------ */
/* 공개 API                                                            */
/* ------------------------------------------------------------------ */

export interface BackfillProgress {
  provider: string;
  symbol: string;
  interval: string;
  saved: number;
  skipped: number;
  lastSavedOpenTime: Date | null;
  complete: boolean;
}

/**
 * 심볼×인터벌의 캔들을 백필한다.
 * checkpoint가 있으면 중단된 지점부터 재개한다.
 */
export async function backfillCandles(
  adapter: TradingProviderAdapter,
  symbol: string,
  interval: string,
  opts: {
    countPerPage?: number;
    to?: Date;
    maxTotal?: number;
    onProgress?: (progress: { saved: number; skipped: number; totalFetched: number }) => void;
  } = {},
): Promise<BackfillProgress> {
  const Model = await getModel();
  const countPerPage = opts.countPerPage ?? 200;
  const maxTotal = opts.maxTotal ?? Number.POSITIVE_INFINITY;

  const checkpoint = await loadCheckpoint(adapter.provider, symbol, interval);
  let cursor: Date;
  if (checkpoint) {
    cursor = checkpoint;
    logger.info("[tradingCandleStore] resuming from checkpoint", {
      provider: adapter.provider, symbol, interval,
      checkpoint: checkpoint.toISOString(),
    });
  } else {
    cursor = opts.to ?? new Date();
  }

  const oldestDoc = await Model.findOne(
    { provider: adapter.provider, symbol, interval },
    { openTime: 1 },
  ).sort({ openTime: 1 }).lean() as { openTime: Date } | null;

  let saved = 0;
  let skipped = 0;
  let totalFetched = 0;
  let lastSavedOpenTime: Date | null = null;

  while (saved < maxTotal) {
    const req: CandleRequest = { symbol, interval, count: countPerPage, to: cursor };
    const candles = await adapter.getCandles(req);
    totalFetched += candles.length;
    if (candles.length === 0) break;

    const sorted = [...candles].sort((a, b) => a.openTime.getTime() - b.openTime.getTime());

    for (const candle of sorted) {
      const sourceHash = computeSourceHash(candle);
      try {
        const existing = await Model.findOne({
          provider: adapter.provider,
          symbol: candle.symbol,
          interval: candle.interval,
          openTime: candle.openTime,
        }).select("sourceHash").lean() as { sourceHash?: string } | null;

        if (existing?.sourceHash === sourceHash) { skipped++; continue; }

        await Model.updateOne(
          {
            provider: adapter.provider,
            symbol: candle.symbol,
            interval: candle.interval,
            openTime: candle.openTime,
          },
          {
            $set: {
              assetClass: adapter.assetClass,
              open: candle.open, high: candle.high, low: candle.low,
              close: candle.close, volume: candle.volume,
              isFinal: candle.isFinal, sourceHash,
              backfilledAt: new Date(),
            },
          },
          { upsert: true },
        );
        saved++;
        lastSavedOpenTime = candle.openTime;
      } catch (error) {
        const code = (error as { code?: number }).code;
        const msg = (error as { message?: string }).message ?? "";
        if (code === 11000 || msg.includes("E11000") || msg.includes("duplicate key")) {
          skipped++; continue;
        }
        throw error;
      }
    }

    cursor = sorted[0].openTime;
    if (lastSavedOpenTime) {
      await saveCheckpoint(adapter.provider, symbol, interval, lastSavedOpenTime);
    }
    opts.onProgress?.({ saved, skipped, totalFetched });
    if (candles.length < countPerPage) break;
    if (oldestDoc && sorted[0].openTime <= oldestDoc.openTime) break;
  }

  const complete = totalFetched > 0 && totalFetched < countPerPage;
  if (complete) await clearCheckpoint(adapter.provider, symbol, interval);

  logger.info("[tradingCandleStore] backfill complete", {
    provider: adapter.provider, symbol, interval,
    saved, skipped, totalFetched, complete,
  });

  return { provider: adapter.provider, symbol, interval,
    saved, skipped, lastSavedOpenTime, complete };
}

/**
 * 가장 최근에 저장된 캔들의 openTime을 조회한다.
 * 증분 동기화(TL-401)의 시작점으로 사용한다.
 */
export async function getLatestCandleOpenTime(
  provider: string, symbol: string, interval: string,
): Promise<Date | null> {
  const Model = await getModel();
  const doc = await Model.findOne(
    { provider, symbol, interval, isFinal: true },
    { openTime: 1 },
  ).sort({ openTime: -1 }).lean() as { openTime?: Date } | null;
  return doc?.openTime ?? null;
}

/**
 * 특정 심볼·인터벌의 저장된 확정봉 개수
 */
export async function getStoredCandleCount(
  provider: string, symbol: string, interval: string,
): Promise<number> {
  const Model = await getModel();
  return Model.countDocuments({ provider, symbol, interval, isFinal: true });
}

