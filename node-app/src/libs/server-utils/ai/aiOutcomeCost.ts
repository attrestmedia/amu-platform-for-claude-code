export type AiOutcomeCostRow = {
  resultStatus: "success" | "partial" | "failed" | "skipped";
  providerCostAmountUsd: number | null;
  coinCharged: number;
};

export type AiOutcomeCostSummary = {
  successfulOutcomes: number;
  knownProviderCostUsd: number;
  unknownCostRows: number;
  coinCharged: number;
  costPerSuccessfulOutcomeUsd: number | null;
};

/**
 * 성공 결과를 분모로 삼아 provider COGS와 사용자 코인 청구를 분리해 집계한다.
 * 원가가 하나라도 확인되지 않으면 단가를 추정하지 않고 null로 둔다.
 */
export function calculateCostPerSuccessfulOutcome(rows: readonly AiOutcomeCostRow[]): AiOutcomeCostSummary {
  let successfulOutcomes = 0;
  let knownProviderCostUsd = 0;
  let unknownCostRows = 0;
  let coinCharged = 0;

  for (const row of rows) {
    coinCharged += Math.max(0, Number(row.coinCharged) || 0);
    if (row.resultStatus !== "success") continue;
    successfulOutcomes += 1;
    if (typeof row.providerCostAmountUsd !== "number" || !Number.isFinite(row.providerCostAmountUsd)) {
      unknownCostRows += 1;
      continue;
    }
    knownProviderCostUsd += Math.max(0, row.providerCostAmountUsd);
  }

  return {
    successfulOutcomes,
    knownProviderCostUsd,
    unknownCostRows,
    coinCharged,
    costPerSuccessfulOutcomeUsd:
      successfulOutcomes > 0 && unknownCostRows === 0 ? knownProviderCostUsd / successfulOutcomes : null,
  };
}
