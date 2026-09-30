/**
 * @docHint
 * @purpose Private Trade Lab — 결정론적 전략 평가기 (순수 함수 · I/O 없음)
 * @process evaluateStrategy  evaluateCondition  evaluateRuleGroup  computeSnapshotHash
 * @domain trading
 * @scope private-trade-lab
 *
 * 설계 정본: 주식 보고서 §6.4.
 *
 * 순수 함수만 포함. DB·네트워크·Math.random() 없음.
 * 같은 입력 → 항상 같은 출력. 백테스트 신뢰성의 전제.
 * 백테스트 엔진과 라이브 평가 엔진은 같은 evaluateStrategy()를 호출해야 한다.
 */

import { createHash } from "node:crypto";
import type {
  StrategyCondition,
  StrategyDefinition,
  StrategyEvalOutput,
  StrategyRuleGroup,
  StrategySignal,
  StrategySnapshot,
} from "types/trading/strategy";

/* ------------------------------------------------------------------ */
/* 스냅샷 해시 (결정론적)                                                 */
/* ------------------------------------------------------------------ */

export function computeSnapshotHash(snapshot: StrategySnapshot): string {
  const normalized = normalizeSnapshot(snapshot);
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

function normalizeSnapshot(snapshot: StrategySnapshot): unknown {
  return {
    strategyId: snapshot.strategyId,
    strategyVersion: snapshot.strategyVersion,
    indicatorVersion: snapshot.indicatorVersion,
    instruments: sortRecord(snapshot.instruments, (i) => ({
      symbol: i.symbol, tradingDate: i.tradingDate.toISOString(),
      close: i.close, sma20: i.sma20, sma60: i.sma60, sma120: i.sma120,
      ema12: i.ema12, ema26: i.ema26,
      rsi14: i.rsi14, atr14: i.atr14,
      volumeSma20: i.volumeSma20, valueSma20: i.valueSma20,
      high52w: i.high52w, low52w: i.low52w, distanceFromHigh52w: i.distanceFromHigh52w,
      adjustmentEpoch: i.adjustmentEpoch,
    })),
    quotes: sortRecord(snapshot.quotes, (q) => ({
      symbol: q.symbol, price: q.price, fetchedAt: q.fetchedAt.toISOString(),
    })),
    positions: sortRecord(snapshot.positions, (p) => ({
      symbol: p.symbol, quantity: p.quantity,
      averagePrice: p.averagePrice, holdingDays: p.holdingDays,
    })),
    regime: {
      indexSymbol: snapshot.regime.indexSymbol, indexClose: snapshot.regime.indexClose,
      indexSma200: snapshot.regime.indexSma200,
      aboveSma200: snapshot.regime.aboveSma200, sma200Slope: snapshot.regime.sma200Slope,
    },
    riskPolicyId: snapshot.riskPolicyId, riskPolicyVersion: snapshot.riskPolicyVersion,
  };
}

function sortRecord<T, U>(record: Record<string, T>, mapFn: (v: T) => U): Record<string, U> {
  const result: Record<string, U> = {};
  for (const key of Object.keys(record).sort()) result[key] = mapFn(record[key]);
  return result;
}


/* ------------------------------------------------------------------ */
/* runKey 생성                                                          */
/* ------------------------------------------------------------------ */

export function computeRunKey(strategyId: string, snapshotHash: string, evaluatedAt: Date): string {
  return createHash("sha256").update(`${strategyId}:${snapshotHash}:${evaluatedAt.toISOString()}`).digest("hex");
}

/* ------------------------------------------------------------------ */
/* BigInt 비교 헬퍼                                                      */
/* ------------------------------------------------------------------ */

function cmpBigInt(a: string, b: string): number {
  const diff = BigInt(a) - BigInt(b);
  return diff > BigInt(0) ? 1 : diff < BigInt(0) ? -1 : 0;
}

function computeTotalPortfolioValue(snapshot: StrategySnapshot): bigint {
  let total = BigInt(0);
  for (const symbol of Object.keys(snapshot.positions)) {
    const pos = snapshot.positions[symbol];
    const quote = snapshot.quotes[symbol];
    if (pos && quote) total = total + BigInt(pos.quantity) * BigInt(quote.price);
  }
  return total;
}

/* ------------------------------------------------------------------ */
/* 조건 값 해석                                                          */
/* ------------------------------------------------------------------ */

function resolveConditionValue(
  condition: StrategyCondition,
  snapshot: StrategySnapshot,
  symbol: string,
): string | null {
  const inst = snapshot.instruments[symbol];
  const quote = snapshot.quotes[symbol];
  const pos = snapshot.positions[symbol];

  switch (condition.source) {
    case "price": return quote?.price ?? inst?.close ?? null;
    case "volume": return inst?.volumeSma20 ?? null;
    case "moving_average": {
      if (!inst) return null;
      const p = condition.period ?? 20;
      const t = condition.maType ?? "sma";
      if (t === "ema") return p === 12 ? inst.ema12 : p === 26 ? inst.ema26 : null;
      if (p === 5) return inst.sma5 ?? null;
      if (p === 20) return inst.sma20;
      if (p === 60) return inst.sma60;
      if (p === 120) return inst.sma120;
      return null;
    }
    case "position": {
      if (!pos) return "0";
      return (BigInt(pos.quantity) * BigInt(pos.averagePrice)).toString();
    }
    case "profit_rate": {
      if (!pos || !quote || BigInt(pos.averagePrice) === BigInt(0)) return null;
      const profit = BigInt(quote.price) - BigInt(pos.averagePrice);
      return ((profit * BigInt("100000000")) / BigInt(pos.averagePrice)).toString();
    }
    case "market_index": return snapshot.regime.indexClose || null;
    case "rsi": return inst?.rsi14 ?? null;
    case "atr_ratio": {
      if (!inst || BigInt(inst.close) === BigInt(0)) return null;
      return ((BigInt(inst.atr14) * BigInt("100000000")) / BigInt(inst.close)).toString();
    }
    case "distance_from_high_52w": return inst?.distanceFromHigh52w ?? null;
    case "liquidity_value_sma20": return inst?.valueSma20 ?? null;
    case "holding_days": return pos ? String(pos.holdingDays) : "0";
    case "market_regime": return snapshot.regime.aboveSma200 ? "1" : "0";
    case "position_weight": {
      if (!pos || !quote) return "0";
      const total = computeTotalPortfolioValue(snapshot);
      if (total === BigInt(0)) return "0";
      const posValue = BigInt(pos.quantity) * BigInt(quote.price);
      return ((posValue * BigInt("100000000")) / total).toString();
    }
    case "sector_exposure": return "0";
    default: return null;
  }
}

/* ------------------------------------------------------------------ */
/* 조건 평가                                                             */
/* ------------------------------------------------------------------ */

function evaluateCondition(
  condition: StrategyCondition,
  snapshot: StrategySnapshot,
  symbol: string,
): boolean {
  const value = resolveConditionValue(condition, snapshot, symbol);
  if (value == null) return false;
  const cmp = cmpBigInt(value, condition.value);
  switch (condition.operator) {
    case "gt": return cmp > 0;
    case "gte": return cmp >= 0;
    case "lt": return cmp < 0;
    case "lte": return cmp <= 0;
    case "eq": return cmp === 0;
    case "cross_above":
    case "cross_below":
      return false; // 이전 봉 필요 → 백테스트 엔진에서 구현
    default: return false;
  }
}

/* ------------------------------------------------------------------ */
/* 규칙 그룹 평가                                                        */
/* ------------------------------------------------------------------ */

function evaluateRuleGroup(
  group: StrategyRuleGroup,
  snapshot: StrategySnapshot,
  symbol: string,
): { matched: boolean; reasons: string[] } {
  const reasons: string[] = [];

  for (const cond of group.conditions) {
    const matched = evaluateCondition(cond, snapshot, symbol);
    if (matched) reasons.push(`${cond.source} ${cond.operator} ${cond.value}`);
    if (group.logic === "and" && !matched) return { matched: false, reasons: [] };
    if (group.logic === "or" && matched) return { matched: true, reasons };
  }

  if (group.groups) {
    for (const sub of group.groups) {
      const subResult = evaluateRuleGroup(sub, snapshot, symbol);
      if (subResult.matched) {
        reasons.push(...subResult.reasons);
        if (group.logic === "or") return { matched: true, reasons };
      } else if (group.logic === "and") {
        return { matched: false, reasons: [] };
      }
    }
  }

  return {
    matched: group.logic === "and",
    reasons: group.logic === "and" ? reasons : [],
  };
}

/* ------------------------------------------------------------------ */
/* 전략 평가 메인                                                        */
/* ------------------------------------------------------------------ */

export function evaluateStrategy(
  strategy: StrategyDefinition,
  snapshot: StrategySnapshot,
  evaluatedAt: Date,
): StrategyEvalOutput {
  const snapshotHash = computeSnapshotHash(snapshot);
  const runKey = computeRunKey(strategy.name + snapshot.strategyId, snapshotHash, evaluatedAt);

  let signals: StrategySignal[];
  if (strategy.kind === "rebalance" && strategy.rebalancePolicy) {
    signals = evaluateRebalance(strategy, snapshot);
  } else if (strategy.kind === "signal") {
    signals = evaluateSignal(strategy, snapshot);
  } else {
    signals = [];
  }

  return { runKey, inputSnapshotHash: snapshotHash, signals, evaluatedAt, strategyVersion: strategy.version };
}

function evaluateSignal(strategy: StrategyDefinition, snapshot: StrategySnapshot): StrategySignal[] {
  const signals: StrategySignal[] = [];
  for (const symbol of strategy.instruments) {
    if (strategy.entryRules) {
      const r = evaluateRuleGroup(strategy.entryRules, snapshot, symbol);
      if (r.matched) signals.push({ symbol, side: "BUY", reasons: r.reasons, source: "entry" });
    }
    if (strategy.exitRules) {
      const r = evaluateRuleGroup(strategy.exitRules, snapshot, symbol);
      if (r.matched) signals.push({ symbol, side: "SELL", reasons: r.reasons, source: "exit" });
    }
  }
  return signals;
}

function evaluateRebalance(strategy: StrategyDefinition, snapshot: StrategySnapshot): StrategySignal[] {
  const signals: StrategySignal[] = [];
  const policy = strategy.rebalancePolicy!;
  const totalValue = computeTotalPortfolioValue(snapshot);
  if (totalValue === BigInt(0)) return signals;

  const toleranceBps = BigInt(policy.toleranceBandBps);
  const scale = BigInt("10000");

  for (const target of policy.targets) {
    const pos = snapshot.positions[target.symbol];
    const quote = snapshot.quotes[target.symbol];
    const posValue = pos && quote ? BigInt(pos.quantity) * BigInt(quote.price) : BigInt(0);
    const currentW = (posValue * scale) / totalValue;
    const targetW = BigInt(Math.floor(Number(target.targetWeight) * 10000));
    const drift = currentW > targetW ? currentW - targetW : targetW - currentW;
    if (drift <= toleranceBps) continue;

    const currentWStr = (Number(currentW) / 10000).toString();
    if (currentW < targetW) {
      signals.push({
        symbol: target.symbol, side: "BUY",
        reasons: [`rebalance: ${currentWStr} < ${target.targetWeight} (drift ${drift}bps)`],
        source: "rebalance_drift", targetWeight: target.targetWeight, currentWeight: currentWStr,
      });
    } else {
      signals.push({
        symbol: target.symbol, side: "SELL",
        reasons: [`rebalance: ${currentWStr} > ${target.targetWeight} (drift ${drift}bps)`],
        source: "rebalance_drift", targetWeight: target.targetWeight, currentWeight: currentWStr,
      });
    }
  }
  return signals;
}

