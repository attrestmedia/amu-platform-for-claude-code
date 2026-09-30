import { Schema, type Document } from "mongoose";
import type { TradingAssetClass, TradingProvider } from "types/trading/adapter";

/**
 * @docHint
 * @purpose Private Trade Lab — trading_indicators (지표 사전 계산)
 * @process provider·symbol·interval·openTime unique  SMA/EMA/RSI/ATR/52주·레짐  indicatorVersion
 * @domain trading
 * @scope private-trade-lab
 *
 * 설계 정본: 주식 보고서 §5.4 · 통합 보고서 §7.2.
 *
 * 전략 평가 때마다 200봉을 다시 읽어 지표를 계산하면 Mongo 읽기가
 * 종목 수 × 전략 수로 늘어난다. 캔들 증분 직후 지표를 함께 갱신한다.
 *
 * indicatorVersion이 바뀌면 과거 백테스트가 무효 처리되어야 한다.
 */

export interface ITradingIndicatorDocument extends Document {
  provider: TradingProvider;
  assetClass: TradingAssetClass;
  symbol: string;
  interval: string;
  /** 캔들 봉의 openTime과 동일 — 지표는 이 봉의 데이터를 포함해 계산 */
  openTime: Date;

  // 이동평균
  sma5: string;
  sma20: string;
  sma60: string;
  sma120: string;
  ema12: string;
  ema26: string;

  // 모멘텀
  rsi14: string;

  // 변동성
  atr14: string;

  // 거래량/거래대금
  volumeSma20: string;
  valueSma20: string;

  // 52주 고저
  high52w: string;
  low52w: string;
  distanceFromHigh52w: string;

  // 시장 레짐
  regimeIndexSymbol: string;
  regimeAboveSma200: boolean;
  regimeSma200Slope: "up" | "flat" | "down";

  /** 계산 로직 버전. 변경 시 기존 지표는 재계산 대상 */
  indicatorVersion: number;
  computedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const INDICATOR_VERSION = 1;

export const TradingIndicatorSchema = new Schema<ITradingIndicatorDocument>(
  {
    provider: { type: String, required: true, enum: ["toss_securities", "upbit"] },
    assetClass: { type: String, required: true, enum: ["equity", "crypto"] },
    symbol: { type: String, required: true },
    interval: { type: String, required: true },
    openTime: { type: Date, required: true },

    sma5: { type: String, default: "0" },
    sma20: { type: String, default: "0" },
    sma60: { type: String, default: "0" },
    sma120: { type: String, default: "0" },
    ema12: { type: String, default: "0" },
    ema26: { type: String, default: "0" },

    rsi14: { type: String, default: "0" },

    atr14: { type: String, default: "0" },

    volumeSma20: { type: String, default: "0" },
    valueSma20: { type: String, default: "0" },

    high52w: { type: String, default: "0" },
    low52w: { type: String, default: "0" },
    distanceFromHigh52w: { type: String, default: "0" },

    regimeIndexSymbol: { type: String, default: "" },
    regimeAboveSma200: { type: Boolean, default: false },
    regimeSma200Slope: { type: String, enum: ["up", "flat", "down"], default: "flat" },

    indicatorVersion: { type: Number, required: true, default: INDICATOR_VERSION },
    computedAt: { type: Date, required: true },
  },
  { timestamps: true },
);

TradingIndicatorSchema.index(
  { provider: 1, symbol: 1, interval: 1, openTime: 1 },
  { unique: true },
);

TradingIndicatorSchema.index(
  { provider: 1, symbol: 1, interval: 1, openTime: -1 },
);

TradingIndicatorSchema.index({ indicatorVersion: 1 });
