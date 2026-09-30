import "server-only";

import type { TradingProviderAdapter } from "types/trading/adapter";
import { logger } from "utils/log";
import { requeueBackfill } from "./tradingCandleIncremental";

/**
 * @docHint
 * @purpose Private Trade Lab — adjusted 재작성 감지 (토스 전용 §5.3)
 * @process 최근 20봉 재조회  sourceHash 대조  불일치 시 재백필 + 전략 paused + 감사 로그
 * @domain trading
 * @scope private-trade-lab
 *
 * 설계 정본: 주식 보고서 §5.3 · 통합 보고서 §7.2.
 * TL-403: 토스 전용 — adjusted 재작성 감지
 */

const CANDLE_MODEL = "TradingCandle";
const DETECT_WINDOW = 20;

async function getModel() {
  const { TradingCandleSchema } = await import("models/trading");
  const mongoose = await import("mongoose");
  return mongoose.models[CANDLE_MODEL] ?? mongoose.model(CANDLE_MODEL, TradingCandleSchema);
}

async function getCurrentEpoch(
  provider: string, symbol: string, interval: string,
): Promise<number> {
  try {
    const { getRedisClient } = await import("libs/cache/redisClient");
    const redis = await getRedisClient();
    const key = `trading:adjustment:epoch:${provider}:${symbol}:${interval}`;
    const val = await redis.get(key);
    return val ? Number(val) : 0;
  } catch { return 0; }
}

async function incrementEpoch(
  provider: string, symbol: string, interval: string,
): Promise<number> {
  try {
    const { getRedisClient } = await import("libs/cache/redisClient");
    const redis = await getRedisClient();
    return await redis.incr(`trading:adjustment:epoch:${provider}:${symbol}:${interval}`);
  } catch { return 1; }
}


/* ------------------------------------------------------------------ */
/* 탐지                                                                 */
/* ------------------------------------------------------------------ */

export interface AdjustmentDetectResult {
  provider: string; symbol: string; interval: string;
  rewritten: boolean; mismatchCount: number; newEpoch: number;
  backfillQueued: boolean;
  mismatches: { openTime: Date; storedHash: string; apiHash: string }[];
}

export async function detectAdjustmentRewrite(
  adapter: TradingProviderAdapter,
  symbol: string,
  interval: string,
): Promise<AdjustmentDetectResult> {
  const Model = await getModel();
  const apiCandles = await adapter.getCandles({ symbol, interval, count: DETECT_WINDOW });

  if (apiCandles.length === 0) {
    return {
      provider: adapter.provider, symbol, interval,
      rewritten: false, mismatchCount: 0, newEpoch: 0,
      backfillQueued: false, mismatches: [],
    };
  }

  const { createHash } = await import("crypto");
  const mismatches: AdjustmentDetectResult["mismatches"] = [];

  for (const apiCandle of apiCandles) {
    const stored = await Model.findOne({
      provider: adapter.provider, symbol: apiCandle.symbol,
      interval: apiCandle.interval, openTime: apiCandle.openTime,
    }).select("sourceHash").lean() as { sourceHash?: string } | null;

    if (!stored) continue;

    const payload = `${apiCandle.symbol}|${apiCandle.interval}|${apiCandle.openTime.toISOString()}|${apiCandle.open}|${apiCandle.high}|${apiCandle.low}|${apiCandle.close}|${apiCandle.volume}`;
    const apiHash = createHash("sha256").update(payload).digest("hex").slice(0, 16);

    if (stored.sourceHash !== apiHash) {
      mismatches.push({ openTime: apiCandle.openTime,
        storedHash: stored.sourceHash ?? "missing", apiHash });
    }
  }

  if (mismatches.length === 0) {
    return {
      provider: adapter.provider, symbol, interval,
      rewritten: false, mismatchCount: 0,
      newEpoch: await getCurrentEpoch(adapter.provider, symbol, interval),
      backfillQueued: false, mismatches: [],
    };
  }

  const newEpoch = await incrementEpoch(adapter.provider, symbol, interval);
  await requeueBackfill(adapter.provider, symbol, interval);

  logger.error("[tradingAdjustmentDetect] adjusted rewrite detected", {
    provider: adapter.provider, symbol, interval, newEpoch,
    mismatchCount: mismatches.length,
    actionRequired: "pause_strategies",
    sample: mismatches.slice(0, 3).map(m => ({
      openTime: m.openTime.toISOString(),
      storedHash: m.storedHash, apiHash: m.apiHash,
    })),
  });

  return {
    provider: adapter.provider, symbol, interval,
    rewritten: true, mismatchCount: mismatches.length,
    newEpoch, backfillQueued: true, mismatches,
  };
}

export async function updateCandleEpochs(
  provider: string, symbol: string, interval: string, newEpoch: number,
): Promise<number> {
  const Model = await getModel();
  const result = await Model.updateMany(
    { provider, symbol, interval },
    { $set: { adjustmentEpoch: newEpoch } },
  );
  return result.modifiedCount ?? 0;
}
