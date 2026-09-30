import "server-only";
import type {
  IGameAssetPipelineDoc,
  SpritePipelineDirectionStateType,
  SpritePipelineStepKeyType,
} from "types/game/asset-pipeline";
import { resolveImageAssetDisplayUrl } from "libs/server-utils/lab/imageAssetDisplay";
import { toUnknownRecord } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose 파이프라인 상태를 클라이언트 안전 응답으로 변환 (CK-205 확장)
 *
 * ## CK-205 확장
 * - step3Summary: 방향별 method 집계 + 품질 경고
 * - nextStepMayCharge: STEP3 유료 fallback 가능성
 * - storage sanitization: stripStorage 제거, URL만 유지
 * - directionMethods: 방향별 method badge 정보
 *
 * @domain game.asset-pipeline
 * @scope server
 */

export type PresentedPipelineType = IGameAssetPipelineDoc & {
  /** CK-205: STEP3 비용·처리 방식 요약 */
  step3Summary?: Step3SummaryType;
  /** CK-205: 다음 STEP이 과금될 가능성이 있는지 */
  nextStepMayCharge: boolean;
  /** CK-205: 방법별 방향 카운트 */
  methodCounts?: Record<string, number>;
  /** CK-205: 품질 경고 */
  qualityWarnings?: string[];
};

export type Step3SummaryType = {
  nativeAlpha: number;
  chromaKeyV2: number;
  chromaKeyLegacy: number;
  aiFallback: number;
  totalDirections: number;
  estimatedMaxCoins: number;
};

// STEP3이 필요할 수 있는 단계들 (remove-bg step)
const STEP3_STEP_KEY: SpritePipelineStepKeyType = "step3-removebg";

// AI fallback 예상 최대 금액 (direction 단위)
const FALLBACK_ESTIMATE_PER_DIRECTION = 5;

export async function presentSpritePipelineForClient(
  pipeline: IGameAssetPipelineDoc,
): Promise<PresentedPipelineType> {
  // Sanitize direction storage → signed URL로 대체, stripStorage 제거
  const entries = await Promise.all(
    Object.entries(pipeline.directions || {}).map(async ([direction, state]) => {
      const storage = toUnknownRecord(state.stripStorage);
      if (Object.keys(storage).length === 0) return [direction, sanitizeDirection(state)] as const;
      const display = await resolveImageAssetDisplayUrl(
        { assetId: "", visibility: "private", storage },
        { delivery: "signed" },
      ).catch(() => null);
      return [
        direction,
        sanitizeDirection({
          ...state,
          stripAssetRef: String(display?.url || state.stripAssetRef || ""),
        } satisfies SpritePipelineDirectionStateType),
      ] as const;
    }),
  );

  // CK-205: 비용·방법 요약 계산
  const step3Summary = buildStep3Summary(pipeline);
  const methodCounts = buildMethodCounts(pipeline);
  const qualityWarnings = buildQualityWarnings(pipeline);
  const nextStepMayCharge = computeNextStepMayCharge(pipeline);

  return {
    ...pipeline,
    directions: Object.fromEntries(entries),
    step3Summary,
    nextStepMayCharge,
    methodCounts,
    ...(qualityWarnings.length > 0 ? { qualityWarnings } : {}),
  };
}

// ---------------------------------------------------------------------------
// CK-205 helpers
// ---------------------------------------------------------------------------

/** stripStorage 제거 → 클라이언트에 민감 정보 노출 방지 */
function sanitizeDirection(state: SpritePipelineDirectionStateType): SpritePipelineDirectionStateType {
  const { stripStorage: _strip, ...rest } = state as SpritePipelineDirectionStateType & { stripStorage?: unknown };
  return rest;
}

/** 방향별 method 집계 */
function buildStep3Summary(pipeline: IGameAssetPipelineDoc): Step3SummaryType {
  let nativeAlpha = 0;
  let chromaKeyV2 = 0;
  let chromaKeyLegacy = 0;
  let aiFallback = 0;

  for (const state of Object.values(pipeline.directions || {})) {
    const method = state.method;
    if (method === "native-alpha") nativeAlpha += 1;
    else if (method === "chroma-key-v2") chromaKeyV2 += 1;
    else if (method === "chroma-key") chromaKeyLegacy += 1;
    else if (method) aiFallback += 1; // provider name
  }

  const totalDirections = nativeAlpha + chromaKeyV2 + chromaKeyLegacy + aiFallback;
  const estimatedMaxCoins = aiFallback > 0 ? aiFallback * FALLBACK_ESTIMATE_PER_DIRECTION : 0;

  return { nativeAlpha, chromaKeyV2, chromaKeyLegacy, aiFallback, totalDirections, estimatedMaxCoins };
}

/** 방법별 카운트 (UI badge용) */
function buildMethodCounts(pipeline: IGameAssetPipelineDoc): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const state of Object.values(pipeline.directions || {})) {
    const method = state.method;
    if (method) counts[method] = (counts[method] || 0) + 1;
  }
  return counts;
}

/** 품질 경고 수집 */
function buildQualityWarnings(pipeline: IGameAssetPipelineDoc): string[] {
  const warnings: string[] = [];
  const step3 = pipeline.steps[STEP3_STEP_KEY];

  // STEP3 실패 여부 확인
  if (step3?.status === "failed") {
    warnings.push("step3_background_removal_failed");
  }

  // 방향별 실패
  const failedDirections = Object.entries(pipeline.directions || {})
    .filter(([, state]) => state.status === "failed")
    .map(([dir]) => dir);
  if (failedDirections.length > 0) {
    warnings.push(`directions_failed:${failedDirections.join(",")}`);
  }

  return warnings;
}

/** 다음 STEP이 과금될 가능성이 있는지 */
function computeNextStepMayCharge(pipeline: IGameAssetPipelineDoc): boolean {
  const step3 = pipeline.steps[STEP3_STEP_KEY];
  // STEP3이 pending이고 아직 native/local로 처리되지 않은 방향이 있으면 charge 가능
  if (!step3 || step3.status === "success") return false;
  if (step3.status === "pending" || step3.status === "running") {
    // 방향 중 method가 없는 (아직 처리 안 된) 것이 있으면 fallback 가능
    const unprocessed = Object.values(pipeline.directions || {}).filter((s) => !s.method);
    return unprocessed.length > 0;
  }
  return false;
}
