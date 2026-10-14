/**
 * @docHint
 * @purpose 생성 카탈로그의 revision과 원가 출처를 공개 모니터 shape으로 바꾼다
 * @process modality profile별 검증 근거를 복사하고 tracker 비교 미수집 상태를 명시한다
 * @domain ai
 * @scope server
 */

import { AI_MODEL_CATALOG, AI_MODEL_CATALOG_REVISIONS } from "consts/ai/generated/modelCatalog.generated";
import type { AiCostMonitorCatalogProvenance, AiCostMonitorProvenanceItem } from "types/ai";

function nullableText(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

export function buildCatalogProvenance(): AiCostMonitorCatalogProvenance {
  const items: AiCostMonitorProvenanceItem[] = AI_MODEL_CATALOG.models.flatMap((model) =>
    model.modalities.map((profile) => {
      const providerCost = profile.pricing.providerCost;
      const evidence = providerCost?.trackerEvidence as
        | { trackerRunId?: unknown; changeRecordPath?: unknown }
        | undefined;
      return {
        modelId: model.id,
        modality: profile.modality,
        providerCost: providerCost
          ? {
              certainty: nullableText(providerCost.certainty),
              verifiedAt: nullableText(providerCost.verifiedAt),
              source: nullableText(providerCost.sourceUrl),
              trackerRunId: nullableText(evidence?.trackerRunId),
              changeRecordPath: nullableText(evidence?.changeRecordPath),
            }
          : null,
      };
    }),
  );

  return {
    ...AI_MODEL_CATALOG_REVISIONS,
    items,
    trackerComparison: { status: "unavailable", reason: "TRACKER_PROPOSAL_NOT_INGESTED" },
  };
}
