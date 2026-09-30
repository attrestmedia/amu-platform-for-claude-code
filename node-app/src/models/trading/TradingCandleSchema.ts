import { Schema, type Document } from "mongoose";
import type { TradingAssetClass, TradingProvider } from "types/trading/adapter";

/**
 * @docHint
 * @purpose Private Trade Lab — trading_candles (캔들 데이터 웨어하우스)
 * @process provider·symbol·interval·openTime unique  isFinal  sourceHash  백필 체크포인트
 * @domain trading
 * @scope private-trade-lab
 *
 * 설계 정본: 통합 보고서 §7.2 컬렉션 목록.
 *
 * 전략 평가의 입력을 영속화한다. 매 평가마다 캔들을 다시 받는 구조는
 * 평가 대상 × 전략 수만큼 API 호출이 늘어나므로 DB에 저장해 재사용한다.
 *
 * {provider, symbol, interval, openTime}은 유일해야 한다.
 * sourceHash는 향후 adjusted 재작성 감지(TL-403, 토스)에 사용한다.
 */

export interface ITradingCandleDocument extends Document {
  provider: TradingProvider;
  assetClass: TradingAssetClass;
  symbol: string;
  interval: string;
  /** 봉 시작 시각 (업비트 candle_date_time_utc, 토스 candleDateTimeUtc) */
  openTime: Date;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  /** 확정봉 여부. 미확정 봉은 전략 평가에 사용하지 않는다 (리페인팅 방지 §3.2) */
  isFinal: boolean;
  /** 원본 데이터 무결성 검증용. adjusted 재작성 감지(TL-403)의 근거 */
  sourceHash: string;
  /** 백필로 저장된 시각. 실시간 증분 저장과 구분한다 */
  backfilledAt?: Date;
  /** 액면분할·병합 등으로 provider가 과거 데이터를 재작성할 때마다 증가하는 epoch.
   *  같은 symbol+interval의 모든 캔들은 동일한 최신 epoch를 공유한다.
   *  sourceHash 변화가 감지될 때 epoch가 증가하고 전체 재백필이 트리거된다 (§5.3). */
  adjustmentEpoch: number;
  createdAt: Date;
  updatedAt: Date;
}

export const TradingCandleSchema = new Schema<ITradingCandleDocument>(
  {
    provider: { type: String, required: true, enum: ["toss_securities", "upbit"] },
    assetClass: { type: String, required: true, enum: ["equity", "crypto"] },
    symbol: { type: String, required: true },
    interval: { type: String, required: true },
    openTime: { type: Date, required: true },
    open: { type: String, required: true },
    high: { type: String, required: true },
    low: { type: String, required: true },
    close: { type: String, required: true },
    volume: { type: String, required: true },
    isFinal: { type: Boolean, required: true, index: true },
    sourceHash: { type: String, required: true },
    backfilledAt: { type: Date, default: undefined },
    adjustmentEpoch: { type: Number, required: true, default: 0 },
  },
  { timestamps: true },
);

/** provider×symbol×interval×openTime은 유일해야 한다 */
TradingCandleSchema.index(
  { provider: 1, symbol: 1, interval: 1, openTime: 1 },
  { unique: true },
);

/** 백필 진행 상황 조회용 */
TradingCandleSchema.index({ provider: 1, symbol: 1, interval: 1, openTime: -1 });

/** isFinal 필터링 + 시계열 정렬 */
TradingCandleSchema.index({ provider: 1, symbol: 1, interval: 1, isFinal: 1, openTime: -1 });
