/**
 * @docHint
 * @purpose Private Trade Lab — trading_strategy_runs (전략 평가 실행 기록)
 * @process runKey unique  inputSnapshot 전량 저장  inputSnapshotHash  signals
 * @domain trading
 * @scope private-trade-lab
 *
 * 설계 정본: 주식 보고서 §6.4.
 *
 * 해시만 저장하면 사후 재현이 불가능하다. 입력 스냅샷 전체를 저장한다.
 * 일봉 기준이므로 문서 크기는 문제되지 않는다.
 */

import { Schema, type Document } from "mongoose";
import type { StrategySignal, StrategySnapshot } from "types/trading/strategy";

export interface ITradingStrategyRunDocument extends Document {
  runKey: string;
  strategyId: string;
  strategyVersion: number;
  inputSnapshotHash: string;
  inputSnapshot: StrategySnapshot;
  signals: StrategySignal[];
  evaluatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const StrategySignalSchema = new Schema<StrategySignal>(
  {
    symbol: { type: String, required: true },
    side: { type: String, required: true, enum: ["BUY", "SELL"] },
    reasons: [{ type: String }],
    source: { type: String, required: true, enum: ["entry", "exit", "rebalance_drift"] },
    targetWeight: { type: String },
    currentWeight: { type: String },
  },
  { _id: false },
);

const SnapshotInstrumentSchema = new Schema(
  {
    symbol: { type: String, required: true },
    tradingDate: { type: Date, required: true },
    close: { type: String, required: true },
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
    adjustmentEpoch: { type: Number, default: 0 },
  },
  { _id: false },
);

const SnapshotQuoteSchema = new Schema(
  {
    symbol: { type: String, required: true },
    price: { type: String, required: true },
    fetchedAt: { type: Date, required: true },
  },
  { _id: false },
);

const SnapshotPositionSchema = new Schema(
  {
    symbol: { type: String, required: true },
    quantity: { type: String, required: true },
    averagePrice: { type: String, required: true },
    holdingDays: { type: Number, required: true },
  },
  { _id: false },
);

const SnapshotRegimeSchema = new Schema(
  {
    indexSymbol: { type: String, default: "" },
    indexClose: { type: String, default: "0" },
    indexSma200: { type: String, default: "0" },
    aboveSma200: { type: Boolean, default: false },
    sma200Slope: { type: String, enum: ["up", "flat", "down"], default: "flat" },
  },
  { _id: false },
);

const StrategySnapshotSchema = new Schema<StrategySnapshot>(
  {
    strategyId: { type: String, required: true },
    strategyVersion: { type: Number, required: true },
    indicatorVersion: { type: Number, required: true },
    instruments: { type: Map, of: SnapshotInstrumentSchema, required: true },
    quotes: { type: Map, of: SnapshotQuoteSchema, required: true },
    positions: { type: Map, of: SnapshotPositionSchema, required: true },
    regime: { type: SnapshotRegimeSchema, required: true },
    riskPolicyId: { type: String, required: true },
    riskPolicyVersion: { type: Number, required: true },
  },
  { _id: false },
);

export const TradingStrategyRunSchema = new Schema<ITradingStrategyRunDocument>(
  {
    runKey: { type: String, required: true, unique: true },
    strategyId: { type: String, required: true, index: true },
    strategyVersion: { type: Number, required: true },
    inputSnapshotHash: { type: String, required: true, index: true },
    inputSnapshot: { type: StrategySnapshotSchema, required: true },
    signals: { type: [StrategySignalSchema], default: [] },
    evaluatedAt: { type: Date, required: true },
  },
  { timestamps: true },
);

TradingStrategyRunSchema.index({ strategyId: 1, evaluatedAt: -1 });
TradingStrategyRunSchema.index({ inputSnapshotHash: 1 });
