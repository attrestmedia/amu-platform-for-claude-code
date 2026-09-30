/**
 * @docHint
 * @purpose Private Trade Lab — 시간축 가드 (크립토 최소 5m·1m/3m 금지·서버 강제)
 * @process validateStrategyTimeframe  validateIntradayMinutes  getDefaultTimeframe
 * @domain trading
 * @scope private-trade-lab
 *
 * 설계 정본: 통합 보고서 §3.1, 주식 보고서 §6.3.
 *
 * WebSocket이 있으면 시스템이 고빈도 쪽으로 흘러간다. 텀 원칙을 구조로 강제한다:
 * - 크립토 전략 timeframe은 5m 이상만 허용. 1m·3m은 선택 불가.
 * - 인트라데이 트리거 everyMinutes의 최솟값은 5. 그 이하 설정 불가.
 * - 이 제한은 서버에서 검증하며, 설정을 직접 수정해도 우회할 수 없다.
 * - 크립토 기본값은 15m.
 */

import type { TradingAssetClass } from "types/trading/adapter";
import type { StrategyTimeframe } from "types/trading/strategy";
import {
  ALLOWED_INTRADAY_MINUTES,
  CRYPTO_STRATEGY_TIMEFRAMES,
  EQUITY_STRATEGY_TIMEFRAMES,
} from "types/trading/strategy";

/* ------------------------------------------------------------------ */
/* 상수                                                                 */
/* ------------------------------------------------------------------ */

/** 크립토 전략 최소 timeframe */
export const MIN_CRYPTO_TIMEFRAME = "5m";

/** 크립토 전략 기본 timeframe */
export const DEFAULT_CRYPTO_TIMEFRAME: StrategyTimeframe = "15m";

/** 주식 전략 기본 timeframe */
export const DEFAULT_EQUITY_TIMEFRAME: StrategyTimeframe = "1d";

/** 인트라데이 트리거 최소 분 */
export const MIN_INTRADAY_MINUTES = 5;

/** 금지된 크립토 timeframe — 전략에 사용할 수 없다 */
export const FORBIDDEN_CRYPTO_TIMEFRAMES = ["1m", "3m"] as const;
export type ForbiddenCryptoTimeframe = (typeof FORBIDDEN_CRYPTO_TIMEFRAMES)[number];

/* ------------------------------------------------------------------ */
/* 검증 함수                                                             */
/* ------------------------------------------------------------------ */

/** 금지된 timeframe 검증 오류 */
export class TimeframeValidationError extends Error {
  public readonly code: "FORBIDDEN_TIMEFRAME" | "INVALID_TIMEFRAME" | "MIN_INTRADAY_VIOLATION";
  public readonly value: string;
  public readonly assetClass?: TradingAssetClass;

  constructor(
    code: "FORBIDDEN_TIMEFRAME" | "INVALID_TIMEFRAME" | "MIN_INTRADAY_VIOLATION",
    message: string,
    value: string,
    assetClass?: TradingAssetClass,
  ) {
    super(`[trading] TimeframeValidationError(${code}): ${message}`);
    this.name = "TimeframeValidationError";
    this.code = code;
    this.value = value;
    this.assetClass = assetClass;
  }
}

/**
 * 자산군에 맞는 유효한 timeframe인지 검증한다.
 *
 * - equity: 1d, 1w만 허용
 * - crypto: 5m 이상만 허용. 1m·3m은 금지.
 * - 알 수 없는 assetClass는 fail-closed: 거부
 *
 * 이 함수는 설정을 직접 고쳐도 우회할 수 없는 서버 검증이다.
 * UI에서도 같은 규칙을 적용하지만, 서버에서 한 번 더 검증한다.
 */
export function validateStrategyTimeframe(
  timeframe: string,
  assetClass: TradingAssetClass,
): StrategyTimeframe {
  if (assetClass === "equity") {
    if ((EQUITY_STRATEGY_TIMEFRAMES as readonly string[]).includes(timeframe)) {
      return timeframe as StrategyTimeframe;
    }
    throw new TimeframeValidationError(
      "INVALID_TIMEFRAME",
      `주식(equity) 전략 timeframe은 ${EQUITY_STRATEGY_TIMEFRAMES.join("/")}만 허용됩니다. 입력: "${timeframe}"`,
      timeframe,
      assetClass,
    );
  }

  if (assetClass === "crypto") {
    // 1m·3m 금지
    if ((FORBIDDEN_CRYPTO_TIMEFRAMES as readonly string[]).includes(timeframe)) {
      throw new TimeframeValidationError(
        "FORBIDDEN_TIMEFRAME",
        `크립토(crypto) 전략에 ${timeframe}은 사용할 수 없습니다. 최소 ${MIN_CRYPTO_TIMEFRAME} 이상이어야 합니다.`,
        timeframe,
        assetClass,
      );
    }

    if ((CRYPTO_STRATEGY_TIMEFRAMES as readonly string[]).includes(timeframe)) {
      return timeframe as StrategyTimeframe;
    }

    throw new TimeframeValidationError(
      "INVALID_TIMEFRAME",
      `크립토(crypto) 전략 timeframe은 ${CRYPTO_STRATEGY_TIMEFRAMES.join("/")}만 허용됩니다. 입력: "${timeframe}"`,
      timeframe,
      assetClass,
    );
  }

  // 알 수 없는 assetClass — fail-closed
  throw new TimeframeValidationError(
    "INVALID_TIMEFRAME",
    `알 수 없는 assetClass "${assetClass}"입니다. timeframe을 검증할 수 없습니다.`,
    timeframe,
    assetClass,
  );
}

/**
 * 인트라데이 트리거 everyMinutes 검증.
 *
 * 최솟값 5분. 1/2/3/4분은 허용하지 않는다.
 * 이 제한은 서버에서 검증하며, 설정을 직접 수정해도 우회할 수 없다.
 */
export function validateIntradayMinutes(minutes: number): number {
  if (!Number.isInteger(minutes) || minutes < MIN_INTRADAY_MINUTES) {
    throw new TimeframeValidationError(
      "MIN_INTRADAY_VIOLATION",
      `인트라데이 트리거 everyMinutes는 최소 ${MIN_INTRADAY_MINUTES}분 이상이어야 합니다. 입력: ${minutes}`,
      String(minutes),
    );
  }

  if (!(ALLOWED_INTRADAY_MINUTES as readonly number[]).includes(minutes)) {
    throw new TimeframeValidationError(
      "MIN_INTRADAY_VIOLATION",
      `인트라데이 트리거 everyMinutes는 ${ALLOWED_INTRADAY_MINUTES.join("/")}분만 허용됩니다. 입력: ${minutes}`,
      String(minutes),
    );
  }

  return minutes;
}

/**
 * 자산군별 기본 timeframe 반환.
 *
 * - crypto: 15m (통합 보고서 §3.1)
 * - equity: 1d (주식 보고서 §6.3)
 */
export function getDefaultTimeframe(assetClass: TradingAssetClass): StrategyTimeframe {
  if (assetClass === "crypto") return DEFAULT_CRYPTO_TIMEFRAME;
  return DEFAULT_EQUITY_TIMEFRAME;
}

/**
 * timeframe이 전략 평가에 사용 가능한지 빠르게 확인 (throw 없음).
 * UI에서 옵션 필터링에 사용한다.
 */
export function isTimeframeAllowedForAssetClass(
  timeframe: string,
  assetClass: TradingAssetClass,
): boolean {
  try {
    validateStrategyTimeframe(timeframe, assetClass);
    return true;
  } catch {
    return false;
  }
}

/**
 * 크립토 1m·3m 금지 목록 확인 (throw 없음).
 * UI에서 해당 옵션을 비활성화하거나 숨기는 용도.
 */
export function isForbiddenCryptoTimeframe(timeframe: string): timeframe is ForbiddenCryptoTimeframe {
  return (FORBIDDEN_CRYPTO_TIMEFRAMES as readonly string[]).includes(timeframe);
}
