import "server-only";

import { RARITY_ROLL_TOTAL, RARITY_TABLE } from "./characterGenesisRoll";

export const AUDIT_WILSON_Z = 1.96;
export const AUDIT_LOW_FREQUENCY_SAMPLE_THRESHOLD = 1_000;

export interface IAuditConfidenceInterval {
  low: number;
  high: number;
}

export interface IRarityAuditRow {
  tier: string;
  count: number;
  sampleSize: number;
  observedProbability: number;
  expectedProbability: number;
  deviation: number;
  confidenceInterval: IAuditConfidenceInterval;
  expectedWithinCI: boolean;
  lowFrequency: boolean;
}

/**
 * Wilson score interval — 저빈도 tier(mythic·celestial 등)는 단기 표본으로 장애 판정을 내리지
 * 않고 표본 크기와 함께 신뢰구간을 표시한다 (원장 OOC-023).
 */
export function wilsonInterval(successes: number, total: number, z = AUDIT_WILSON_Z): IAuditConfidenceInterval {
  if (!Number.isFinite(successes) || !Number.isFinite(total) || total <= 0) return { low: 0, high: 1 };
  const p = successes / total;
  const denominator = 1 + (z * z) / total;
  const center = (p + (z * z) / (2 * total)) / denominator;
  const margin = (z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total))) / denominator;
  return { low: Math.max(0, center - margin), high: Math.min(1, center + margin) };
}

/**
 * rarity tier별 실제 생성 수와 기대값의 편차·95% 신뢰구간·저빈도 플래그를 계산한다.
 * 색상 없이도 텍스트 필드만으로 판정 가능한 구조를 유지한다.
 */
export function buildRarityAuditSummary(tierCounts: Record<string, number>): IRarityAuditRow[] {
  const sampleSize = Object.values(tierCounts).reduce((sum, count) => sum + (Number.isFinite(count) ? count : 0), 0);
  return RARITY_TABLE.map(({ tier, weight }) => {
    const count = Math.max(0, Math.trunc(Number(tierCounts[tier] || 0)));
    const observedProbability = sampleSize > 0 ? count / sampleSize : 0;
    const expectedProbability = weight / RARITY_ROLL_TOTAL;
    const confidenceInterval = wilsonInterval(count, sampleSize);
    return {
      tier,
      count,
      sampleSize,
      observedProbability,
      expectedProbability,
      deviation: observedProbability - expectedProbability,
      confidenceInterval,
      expectedWithinCI:
        confidenceInterval.low <= expectedProbability && expectedProbability <= confidenceInterval.high,
      lowFrequency: count < AUDIT_LOW_FREQUENCY_SAMPLE_THRESHOLD,
    };
  });
}
