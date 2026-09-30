/**
 * @docHint
 * @purpose Private Trade Lab — 캔들 확정봉 판별 (리페인팅 방지)
 * @process candle_date_time_utc + interval_duration < now → isFinal
 * @domain trading
 * @scope private-trade-lab
 *
 * 설계 정본: .agent/docs/project/2026/08/20260807_103627__private-trade-lab-multi-asset-integration-design.md §3.2
 * TL-300 실측 결과: 업비트 WebSocket candle 스트림에는 명시적 isFinal 필드가 없다.
 *   stream_type("SNAPSHOT"/"REALTIME")은 초기 스냅샷/실시간 구분일 뿐 확정 여부를 나타내지 않는다.
 *   같은 candle_date_time_utc 데이터가 여러 번 전송되며, 마지막 수신값이 최신이다.
 *   판별 규칙: candle_date_time_utc + interval_duration < now → 확정봉.
 *
 * 이 규칙은 REST getCandles와 WebSocket candle 스트림 양쪽에서 동일하게 적용한다.
 * 전략 평가기(strategyEvaluator)는 isFinal === false인 봉을 받으면 throw해야 하며,
 * requireFinalizedCandle()이 그 게이트다.
 */

import type { Candle } from "types/trading/adapter";

/**
 * 업비트 캔들 interval → 밀리초 duration.
 * REST·WebSocket 양쪽에서 확정봉 판별에 사용한다.
 *
 * 1M(월)은 30일로 근사 — 실제 월 길이는 업비트가 candle_date_time_utc로 결정한다.
 */
export const INTERVAL_DURATION_MS: Record<string, number> = {
  "1m": 60_000,
  "3m": 180_000,
  "5m": 300_000,
  "10m": 600_000,
  "15m": 900_000,
  "30m": 1_800_000,
  "60m": 3_600_000,
  "240m": 14_400_000,
  "1d": 86_400_000,
  "1w": 604_800_000,
  "1M": 2_592_000_000, // 30일 근사
};

/**
 * 캔들 확정 여부를 시간 경과로 판별한다.
 *
 * 규칙: openTime + interval duration ≤ now → 확정
 * - interval이 INTERVAL_DURATION_MS에 없으면 true (fail-safe: 알 수 없으면 확정으로 간주)
 * - openTime이 미래면 false (방어)
 *
 * REST getCandles는 확정된 봉만 반환하지만, WebSocket은 진행 중인 봉도 스트리밍한다.
 * 동일한 함수로 양쪽을 검증해 계약을 통일한다.
 */
export function computeCandleFinality(openTime: Date, interval: string, nowMs?: number): boolean {
  const intervalMs = INTERVAL_DURATION_MS[interval];
  if (intervalMs == null) return true; // 미지원 interval → fail-safe: 확정으로 간주
  const now = nowMs ?? Date.now();
  const closeTime = openTime.getTime() + intervalMs;
  // 미래 봉이면 확정 불가 (방어)
  if (closeTime > now) return false;
  // 닫힌 시점 ≤ 현재 → 확정
  return closeTime <= now;
}

/**
 * 전략 평가 게이트 — isFinal === false인 봉을 받으면 throw한다.
 *
 * 리페인팅 방지의 핵심. 미확정 봉으로 전략을 평가하면 백테스트와 라이브가 조용히 어긋난다.
 * 조용히 통과시키지 않고 명시적으로 실패시킨다 (통합 보고서 §3.2).
 */
export function requireFinalizedCandle(candle: Candle): void {
  if (!candle.isFinal) {
    throw new CandleNotFinalizedError(candle.symbol, candle.interval, candle.openTime);
  }
}

export class CandleNotFinalizedError extends Error {
  public readonly symbol: string;
  public readonly interval: string;
  public readonly openTime: Date;

  constructor(symbol: string, interval: string, openTime: Date) {
    super(
      `[trading] CandleNotFinalized: ${symbol} ${interval} 봉 (openTime=${openTime.toISOString()})은 아직 확정되지 않았습니다. 확정봉만 전략 평가에 사용하세요.`,
    );
    this.name = "CandleNotFinalizedError";
    this.symbol = symbol;
    this.interval = interval;
    this.openTime = openTime;
  }
}
