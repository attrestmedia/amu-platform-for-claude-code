/**
 * ChromaKey v2 — GameAsset publish 게이트 확장 (CK-303)
 *
 * 배경 잔여나 품질 미확정 파생물이 published로 승격되면 런타임에서 halo가 고착되므로,
 * chromaKey post-production meta가 있는 asset은 품질 verdict를 검증한 후에만 publish를 허용한다.
 *
 * - verdict="fail" → 차단 (로컬 엔진 실패, 유효한 전경 없음)
 * - verdict="fallback" → 허용 (AI provider가 처리했으므로 유효)
 * - verdict="warn" → 허용 (경고는 있지만 수용 가능한 품질)
 * - verdict="pass" → 허용
 * - meta 없음 → 허용 (legacy asset, 기존 동작 유지)
 *
 * @domain game.asset-pipeline.chroma-key
 * @scope server-only
 */

import { toUnknownRecord } from "utils/common";
import type { GameAssetType } from "types/game/asset";
import type { ChromaKeyQualityType } from "types/game/chroma-key";
import type { QualityEvaluationType } from "utils/game/chromaKeyQuality";

// ---------------------------------------------------------------------------
// 타입
// ---------------------------------------------------------------------------

export type ChromaKeyPublishGateInputType = {
  assetMeta?: Record<string, unknown> | null;
  assetType: GameAssetType;
};

export type ChromaKeyPublishGateResultType = {
  /** publish 허용 여부 */
  allowed: boolean;
  /** 차단 사유 (allowed=false일 때) */
  reason?: string;
  /** 오류 코드 */
  errorCode?: string;
  /** 검증된 chroma key meta (있는 경우) */
  chromaKeyMeta?: {
    method: string;
    engineVersion: string;
    sourceSha256: string;
    outputSha256: string;
    quality: ChromaKeyQualityType;
    evaluation: QualityEvaluationType;
    completedAt: string;
  };
  /** legacy asset 여부 (chromaKey meta 없음) */
  isLegacy: boolean;
};

// ---------------------------------------------------------------------------
// Publish 게이트 검증
// ---------------------------------------------------------------------------

/**
 * chromaKey post-production 품질을 기준으로 publish 허용 여부를 판정한다.
 *
 * legacy asset(chromaKey meta 없음)은 기존 동작을 유지하며,
 * verdict="fail"인 asset만 차단한다.
 */
export function evaluateChromaKeyPublishGate(
  input: ChromaKeyPublishGateInputType,
): ChromaKeyPublishGateResultType {
  const meta = toUnknownRecord(input.assetMeta);
  const postProduction = toUnknownRecord(meta?.postProduction);
  const chromaKey = postProduction?.chromaKey as Record<string, unknown> | undefined;

  // legacy asset: chromaKey meta 없음 → 허용 (기존 동작)
  if (!chromaKey) {
    return { allowed: true, isLegacy: true };
  }

  const evaluation = chromaKey.evaluation as QualityEvaluationType | undefined;
  const quality = chromaKey.quality as ChromaKeyQualityType | undefined;
  const method = String(chromaKey.method || "");
  const engineVersion = String(chromaKey.engineVersion || "");
  const sourceSha256 = String(chromaKey.sourceSha256 || "");
  const outputSha256 = String(chromaKey.outputSha256 || "");
  const completedAt = String(chromaKey.completedAt || "");

  // verdict 검증
  if (!evaluation?.verdict) {
    // verdict 없음 → 허용 (불완전한 메타이지만 차단보다 허용이 안전)
    return {
      allowed: true,
      isLegacy: false,
      chromaKeyMeta: buildChromaKeyMeta(method, engineVersion, sourceSha256, outputSha256, quality, evaluation, completedAt),
    };
  }

  if (evaluation.verdict === "fail") {
    return {
      allowed: false,
      reason: `chroma_key_quality_fail: ${evaluation.warnings?.join(", ") || "empty_output_or_quality_gate_failed"}`,
      errorCode: "CHROMA_KEY_QUALITY_FAIL",
      isLegacy: false,
      chromaKeyMeta: buildChromaKeyMeta(method, engineVersion, sourceSha256, outputSha256, quality, evaluation, completedAt),
    };
  }

  // fallback / warn / pass → 허용
  return {
    allowed: true,
    isLegacy: false,
    chromaKeyMeta: buildChromaKeyMeta(method, engineVersion, sourceSha256, outputSha256, quality, evaluation, completedAt),
  };
}

function buildChromaKeyMeta(
  method: string,
  engineVersion: string,
  sourceSha256: string,
  outputSha256: string,
  quality?: ChromaKeyQualityType,
  evaluation?: QualityEvaluationType,
  completedAt?: string,
): ChromaKeyPublishGateResultType["chromaKeyMeta"] {
  return {
    method: method || "unknown",
    engineVersion: engineVersion || "unknown",
    sourceSha256: sourceSha256 || "",
    outputSha256: outputSha256 || "",
    quality: quality || {
      keyConfidence: 0,
      borderDominantRatio: 0,
      transparentRatio: 0,
      semiAlphaRatio: 0,
      borderOpaqueRatio: 0,
      edgeSpillRatio: 0,
      opaquePixelRatio: 0,
      foregroundTouchesBorder: false,
      foregroundLossRisk: false,
      emptyOutput: false,
    },
    evaluation: evaluation || { verdict: "pass", warnings: [] },
    completedAt: completedAt || "",
  };
}
