/**
 * @docHint
 * @purpose Private Trade Lab — 스트림 신선도 가드 (Stream Freshness Guard)
 * @process Redis stream:health 조회 → maxAgeMs 초과 검사 → 차단 판정
 * @domain trading
 * @scope private-trade-lab
 *
 * 설계 정본: 통합 보고서 §5.2 — 스트림이 끊긴 줄 모르고 낡은 가격으로 주문하는 사고를 막는다.
 * TL-303: 스트림 신선도 가드 + REST 재조정
 *
 * trading:stream:health Hash에 저장된 각 스트림의 마지막 수신 시각을 조회해
 * maxAgeMs를 초과한 스트림이 하나라도 있으면 { fresh: false }를 반환한다.
 * 호출자는 이 결과를 보고 주문 제출을 차단하거나 전략을 paused로 강등한다.
 */

import type { RedisReader } from "./upbitStreamReconcile";

/* ------------------------------------------------------------------ */
/* 상수                                                                */
/* ------------------------------------------------------------------ */

/** ticker가 이 시간보다 오래되었으면 신선하지 않음 */
export const DEFAULT_MAX_TICKER_AGE_MS = 30_000; // 30초
/** orderbook이 이 시간보다 오래되었으면 신선하지 않음 */
export const DEFAULT_MAX_ORDERBOOK_AGE_MS = 60_000; // 60초
/** candle이 이 시간보다 오래되었으면 신선하지 않음 */
export const DEFAULT_MAX_CANDLE_AGE_MS = 300_000; // 5분

/* ------------------------------------------------------------------ */
/* 타입                                                                */
/* ------------------------------------------------------------------ */

export type StreamType = "ticker" | "orderbook" | "candle";

export type StreamFreshnessThresholds = {
  maxTickerAgeMs: number;
  maxOrderbookAgeMs: number;
  maxCandleAgeMs: number;
};

export type StreamFreshnessResult = {
  /** 모든 스트림이 threshold 이내로 수신되었는지 */
  fresh: boolean;
  /** 신선하지 않은 스트림 목록 */
  staleStreams: StreamType[];
  /** 각 스트림별 마지막 수신 경과 시간 (ms). 수신 기록이 없으면 null */
  ages: Record<StreamType, number | null>;
  /** 검사 시각 */
  checkedAt: Date;
};

/* ------------------------------------------------------------------ */
/* 신선도 검사                                                          */
/* ------------------------------------------------------------------ */

const HEALTH_KEY = "trading:stream:health";
const FIELD_MAP: Record<StreamType, string> = {
  ticker: "lastTickerAt",
  orderbook: "lastOrderbookAt",
  candle: "lastCandleAt",
};

const AGE_MAP: Record<StreamType, keyof StreamFreshnessThresholds> = {
  ticker: "maxTickerAgeMs",
  orderbook: "maxOrderbookAgeMs",
  candle: "maxCandleAgeMs",
};

/**
 * 스트림 신선도를 검사한다.
 *
 * trading:stream:health Hash에서 각 스트림의 마지막 수신 시각을 읽고,
 * threshold를 초과한 스트림이 하나라도 있으면 fresh: false를 반환한다.
 */
export async function checkStreamFreshness(
  redis: RedisReader,
  thresholds: Partial<StreamFreshnessThresholds> = {},
  nowMs?: number,
): Promise<StreamFreshnessResult> {
  const max: StreamFreshnessThresholds = {
    maxTickerAgeMs: thresholds.maxTickerAgeMs ?? DEFAULT_MAX_TICKER_AGE_MS,
    maxOrderbookAgeMs: thresholds.maxOrderbookAgeMs ?? DEFAULT_MAX_ORDERBOOK_AGE_MS,
    maxCandleAgeMs: thresholds.maxCandleAgeMs ?? DEFAULT_MAX_CANDLE_AGE_MS,
  };

  const now = nowMs ?? Date.now();
  const staleStreams: StreamType[] = [];
  const ages: Record<StreamType, number | null> = {
    ticker: null,
    orderbook: null,
    candle: null,
  };

  for (const streamType of ["ticker", "orderbook", "candle"] as StreamType[]) {
    const field = FIELD_MAP[streamType];
    const raw = await redis.hget(HEALTH_KEY, field);
    if (!raw) {
      staleStreams.push(streamType);
      continue;
    }
    const lastAt = new Date(raw).getTime();
    if (Number.isNaN(lastAt)) {
      staleStreams.push(streamType);
      continue;
    }
    const age = now - lastAt;
    ages[streamType] = age;
    if (age > max[AGE_MAP[streamType]]) {
      staleStreams.push(streamType);
    }
  }

  return {
    fresh: staleStreams.length === 0,
    staleStreams,
    ages,
    checkedAt: new Date(now),
  };
}
