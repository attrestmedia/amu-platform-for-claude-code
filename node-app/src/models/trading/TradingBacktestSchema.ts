/**
 * @docHint
 * @purpose Private Trade Lab — trading_backtests (백테스트 실행 결과)
 * @process backtestId unique  strategyId index  trades  equityCurve
 * @domain trading
 * @scope private-trade-lab
 */

import { Schema, type Document } from "mongoose";

export interface ITradingBacktestDocument extends Document {
  backtestId: string;
  strategyId: string;
  strategyVersion: number;
  startTime: Date;
  endTime: Date;
  initialCapital: string;
  finalEquity: string;
  totalReturnBps: string;
  candleInterval: string;
  candleCount: number;
  evaluationCount: number;
  tradeCount: number;
  trades: Array<{
    timestamp: Date; symbol: string; side: string;
    quantity: string; price: string;
    costGross: string; costFee: string; costTax: string; costNet: string;
    signalReasons: string[];
  }>;
  equityCurve: Array<{
    timestamp: Date; cash: string; holdingsValue: string; totalEquity: string;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const TradeSchema = new Schema({
  timestamp: { type: Date, required: true },
  symbol: { type: String, required: true },
  side: { type: String, required: true, enum: ["BUY", "SELL"] },
  quantity: { type: String, required: true },
  price: { type: String, required: true },
  costGross: { type: String, required: true },
  costFee: { type: String, required: true },
  costTax: { type: String, required: true },
  costNet: { type: String, required: true },
  signalReasons: [{ type: String }],
}, { _id: false });

const EquityPointSchema = new Schema({
  timestamp: { type: Date, required: true },
  cash: { type: String, required: true },
  holdingsValue: { type: String, required: true },
  totalEquity: { type: String, required: true },
}, { _id: false });

export const TradingBacktestSchema = new Schema<ITradingBacktestDocument>({
  backtestId: { type: String, required: true, unique: true },
  strategyId: { type: String, required: true, index: true },
  strategyVersion: { type: Number, required: true },
  startTime: { type: Date, required: true },
  endTime: { type: Date, required: true },
  initialCapital: { type: String, required: true },
  finalEquity: { type: String, required: true },
  totalReturnBps: { type: String, required: true },
  candleInterval: { type: String, required: true },
  candleCount: { type: Number, required: true },
  evaluationCount: { type: Number, required: true },
  tradeCount: { type: Number, required: true },
  trades: { type: [TradeSchema], default: [] },
  equityCurve: { type: [EquityPointSchema], default: [] },
}, { timestamps: true });

TradingBacktestSchema.index({ strategyId: 1, endTime: -1 });
