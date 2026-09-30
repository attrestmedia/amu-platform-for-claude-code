/**
 * @docHint
 * @purpose Private Trade Lab — trading_strategies (전략 정의)
 * @process ownerUserId+name unique  kind(signal|rebalance)  entryRules·exitRules·rebalancePolicy
 * @domain trading
 * @scope private-trade-lab
 *
 * 설계 정본: 주식 보고서 §6.1·§6.2, 업비트 초안 §5.3.
 *
 * signal: entryRules → 매수, exitRules → 매도
 * rebalance: rebalancePolicy의 목표 비중과 현재 비중의 괴리를 주문으로 환산
 */

import { Schema, type Document } from "mongoose";
import type { TradingProvider, TradingAssetClass, TradingExecutionMode } from "types/trading/adapter";
import type {
  StrategyKind, StrategyTimeframe, StrategyTrigger, StrategyStatus,
  StrategyRuleGroup, RebalancePolicy, SizingPolicy, OrderPolicy,
} from "types/trading/strategy";
import {
  STRATEGY_KINDS, STRATEGY_STATUSES,
  ORDER_TYPES, SIZING_MODES,
  SELF_MATCH_PREVENTIONS, REPRICE_POLICIES,
} from "types/trading/strategy";

export interface ITradingStrategyDocument extends Document {
  ownerUserId: string;
  provider: TradingProvider;
  assetClass: TradingAssetClass;
  name: string;
  description?: string;
  instruments: string[];
  kind: StrategyKind;
  timeframe: StrategyTimeframe;
  trigger: StrategyTrigger;
  executionMode: TradingExecutionMode;
  status: StrategyStatus;
  entryRules?: StrategyRuleGroup;
  exitRules?: StrategyRuleGroup;
  rebalancePolicy?: RebalancePolicy;
  sizingPolicy: SizingPolicy;
  orderPolicy: OrderPolicy;
  riskPolicyId: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const StrategyRuleGroupSchema = new Schema<StrategyRuleGroup>(
  {
    logic: { type: String, required: true, enum: ["and", "or"] },
    conditions: [{
      source: { type: String, required: true },
      operator: { type: String, required: true },
      value: { type: String, required: true },
      period: { type: Number },
      maType: { type: String, enum: ["sma", "ema"] },
      indexSymbol: { type: String },
      targetWeight: { type: String },
      sectorCode: { type: String },
    }],
    groups: { type: [Schema.Types.Mixed], default: undefined },
  },
  { _id: false },
);

const RebalanceTargetSchema = new Schema(
  {
    symbol: { type: String, required: true },
    targetWeight: { type: String, required: true },
  },
  { _id: false },
);

const RebalancePolicySchema = new Schema<RebalancePolicy>(
  {
    targets: { type: [RebalanceTargetSchema], required: true },
    toleranceBandBps: { type: Number, required: true },
    minOrderAmount: { type: String, required: true },
    cadence: { type: String, required: true, enum: ["monthly", "quarterly", "on_drift"] },
    cashBufferRatio: { type: String, required: true },
  },
  { _id: false },
);

const SizingPolicySchema = new Schema<SizingPolicy>(
  {
    mode: { type: String, required: true, enum: SIZING_MODES },
    value: { type: String, required: true },
  },
  { _id: false },
);

const OrderPolicySchema = new Schema<OrderPolicy>(
  {
    type: { type: String, required: true, enum: ORDER_TYPES },
    timeInForce: { type: String, enum: ["ioc", "fok", "post_only"] },
    selfMatchPrevention: { type: String, enum: SELF_MATCH_PREVENTIONS },
    maxWaitSeconds: { type: Number },
    repricePolicy: { type: String, enum: REPRICE_POLICIES },
    maxRepriceCount: { type: Number },
  },
  { _id: false },
);

export const TradingStrategySchema = new Schema<ITradingStrategyDocument>(
  {
    ownerUserId: { type: String, required: true, index: true },
    provider: { type: String, required: true, enum: ["toss_securities", "upbit"] },
    assetClass: { type: String, required: true, enum: ["equity", "crypto"] },
    name: { type: String, required: true },
    description: { type: String, default: "" },
    instruments: [{ type: String, required: true }],
    kind: { type: String, required: true, enum: STRATEGY_KINDS },
    timeframe: { type: String, required: true },
    trigger: { type: Schema.Types.Mixed, required: true },
    executionMode: { type: String, required: true },
    status: { type: String, required: true, enum: STRATEGY_STATUSES, default: "draft" },
    entryRules: { type: StrategyRuleGroupSchema },
    exitRules: { type: StrategyRuleGroupSchema },
    rebalancePolicy: { type: RebalancePolicySchema },
    sizingPolicy: { type: SizingPolicySchema, required: true },
    orderPolicy: { type: OrderPolicySchema, required: true },
    riskPolicyId: { type: String, required: true },
    version: { type: Number, required: true, default: 1 },
  },
  { timestamps: true },
);

TradingStrategySchema.index({ ownerUserId: 1, name: 1 }, { unique: true });
TradingStrategySchema.index({ ownerUserId: 1, status: 1 });
TradingStrategySchema.index({ ownerUserId: 1, kind: 1, status: 1 });
