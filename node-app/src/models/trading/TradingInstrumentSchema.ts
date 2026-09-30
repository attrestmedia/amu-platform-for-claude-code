import { Schema, type Document } from "mongoose";
import type { TradingAssetClass, TradingProvider } from "types/trading/adapter";

/**
 * @docHint
 * @purpose Private Trade Lab — trading_instruments (종목 마스터)
 * @process provider·symbol unique  호가 단위·최소 주문금액  경고·거래 상태  동기화 타임스탬프
 * @domain trading
 * @scope private-trade-lab
 *
 * 설계 정본: 통합 보고서 §7.1 · §7.2 컬렉션 목록.
 *
 * 호가 단위와 최소 주문금액을 코드 상수로 박지 않고 이 컬렉션에 동적으로 저장한다.
 * 업비트가 예고 없이 바꿀 수 있으므로 주기적 크론으로 갱신한다.
 */

export interface ITradingInstrumentDocument extends Document {
  provider: TradingProvider;
  assetClass: TradingAssetClass;
  /** provider 표기 그대로. 업비트 "KRW-BTC" */
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  /** 소수점 자릿수. 크립토 8, KRW 0 */
  quantityScale: number;
  priceScale: number;
  /** 호가 단위 (provider가 예고 없이 바꾼다) */
  tickSize: string;
  /** 최소 주문금액 (quoteAsset 기준) */
  minOrderAmount: string;
  /** 업비트 유의종목 등 */
  warning: boolean;
  /** 거래 가능 여부 */
  tradable: boolean;
  /** 마지막으로 provider API에서 동기화한 시각 */
  lastSyncedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const TradingInstrumentSchema = new Schema<ITradingInstrumentDocument>(
  {
    provider: { type: String, required: true, enum: ["toss_securities", "upbit"] },
    assetClass: { type: String, required: true, enum: ["equity", "crypto"] },
    symbol: { type: String, required: true },
    baseAsset: { type: String, required: true },
    quoteAsset: { type: String, required: true },
    quantityScale: { type: Number, required: true, default: 8 },
    priceScale: { type: Number, required: true, default: 0 },
    tickSize: { type: String, required: true },
    minOrderAmount: { type: String, required: true },
    warning: { type: Boolean, required: true, default: false },
    tradable: { type: Boolean, required: true, default: true },
    lastSyncedAt: { type: Date, required: true },
  },
  { timestamps: true },
);

/** provider×symbol은 유일해야 한다 */
TradingInstrumentSchema.index({ provider: 1, symbol: 1 }, { unique: true });
/** provider×tradable로 필터링하는 쿼리가 많다 */
TradingInstrumentSchema.index({ provider: 1, tradable: 1 });
