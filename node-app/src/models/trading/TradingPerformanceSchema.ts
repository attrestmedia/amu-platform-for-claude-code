/**
 * @docHint
 * @purpose Private Trade Lab — trading_strategy_performance (전략 성과 롤업)
 * @process strategyId+mode+period unique  신호수·승률·손익비·평균보유기간·기여도
 * @domain trading
 * @scope private-trade-lab
 *
 * Paper와 실거래를 같은 스키마로 집계한다.
 * 두 모드의 괴리 자체가 가장 중요한 진단 지표다.
 */

import { Schema, type Document } from "mongoose";

export const PERFORMANCE_MODES = ["backtest", "paper", "live"] as const;
export type PerformanceMode = (typeof PERFORMANCE_MODES)[number];

export interface ITradingPerformanceDocument extends Document {
  strategyId: string;
  strategyVersion: number;
  mode: PerformanceMode;
  periodStart: Date;
  periodEnd: Date;

  signalCount: number;
  tradeCount: number;
  winCount: number;
  lossCount: number;
  winRateBps: string;

  grossReturnBps: string;
  feeTotal: string;
  taxTotal: string;
  slippageTotalBps: string;
  netReturnBps: string;

  avgWinAmount: string;
  avgLossAmount: string;
  profitLossRatio: string;

  avgHoldingDays: string;
  maxDrawdownBps: string;
  sharpeRatio: string;

  contributions: Array<{
    symbol: string;
    tradeCount: number;
    winCount: number;
    netReturnBps: string;
  }>;

  createdAt: Date;
  updatedAt: Date;
}

const ContribSchema = new Schema({
  symbol: { type: String, required: true },
  tradeCount: { type: Number, required: true },
  winCount: { type: Number, required: true },
  netReturnBps: { type: String, required: true },
}, { _id: false });

export const TradingPerformanceSchema = new Schema<ITradingPerformanceDocument>({
  strategyId: { type: String, required: true },
  strategyVersion: { type: Number, required: true },
  mode: { type: String, required: true, enum: PERFORMANCE_MODES },
  periodStart: { type: Date, required: true },
  periodEnd: { type: Date, required: true },

  signalCount: { type: Number, default: 0 },
  tradeCount: { type: Number, default: 0 },
  winCount: { type: Number, default: 0 },
  lossCount: { type: Number, default: 0 },
  winRateBps: { type: String, default: "0" },

  grossReturnBps: { type: String, default: "0" },
  feeTotal: { type: String, default: "0" },
  taxTotal: { type: String, default: "0" },
  slippageTotalBps: { type: String, default: "0" },
  netReturnBps: { type: String, default: "0" },

  avgWinAmount: { type: String, default: "0" },
  avgLossAmount: { type: String, default: "0" },
  profitLossRatio: { type: String, default: "0" },

  avgHoldingDays: { type: String, default: "0" },
  maxDrawdownBps: { type: String, default: "0" },
  sharpeRatio: { type: String, default: "0" },

  contributions: { type: [ContribSchema], default: [] },
}, { timestamps: true });

TradingPerformanceSchema.index({ strategyId: 1, mode: 1, periodStart: -1 }, { unique: true });
