/**
 * ChromaKey v2 — 에셋 프로필별 품질 분석기·fallback 판정기 (CK-104)
 *
 * YCbCr 커널 + refine 처리된 RGBA 출력을 분석해:
 * - edgeSpillRatio, opaquePixelRatio, foregroundTouchesBorder 등 품질 지표 산출
 * - 프로필별 pass/warn/fallback/fail 판정
 *
 * @domain game.asset-pipeline.chroma-key
 * @scope global (browser/Node/Worker 공용)
 */

import { CHROMA_KEY_QUALITY_POLICY } from "consts/game/chromaKeyPresets";
import { rgbToYCbCr } from "./chromaKeyKernel";
import type { ChromaKeyQualityType, ChromaKeyProfileType } from "types/game/chroma-key";
import type { ChromaKeyColorPresetType } from "consts/game/chromaKey";

// ---------------------------------------------------------------------------
// 타입
// ---------------------------------------------------------------------------

export type QualityVerdictType = "pass" | "warn" | "fallback" | "fail";

export type QualityEvaluationType = {
  verdict: QualityVerdictType;
  /** fallback eligible reason (verdict=fallback) */
  reason?: string;
  /** 세부 경고 목록 */
  warnings: string[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cbCrDist(a: { cb: number; cr: number }, b: { cb: number; cr: number }): number {
  return Math.sqrt((a.cb - b.cb) ** 2 + (a.cr - b.cr) ** 2);
}

// ---------------------------------------------------------------------------
// 품질 분석 — RGBA raw data에서 모든 지표 산출
// ---------------------------------------------------------------------------

export function analyzeChromaKeyQuality(
  data: Uint8Array, w: number, h: number, ch: number,
  keyColor: ChromaKeyColorPresetType,
  kernelStats: { potentialForegroundLoss: number },
): ChromaKeyQualityType {
  const total = w * h;
  if (ch < 4 || total === 0) {
    return {
      keyConfidence: 0, borderDominantRatio: 0, transparentRatio: 1,
      semiAlphaRatio: 0, borderOpaqueRatio: 0, edgeSpillRatio: 0,
      opaquePixelRatio: 0, foregroundTouchesBorder: false,
      foregroundLossRisk: false, emptyOutput: true,
    };
  }

  const keyYCbCr = rgbToYCbCr(keyColor.r, keyColor.g, keyColor.b);
  let transparent = 0, semiAlpha = 0, opaque = 0;
  let borderTotal = 0, borderOpaque = 0;
  let edgeTotal = 0, edgeSpill = 0;
  let borderTouch = false;

  const OPAQUE_MIN = 8; // alpha > 8 → opaque

  for (let i = 0; i < total; i += 1) {
    const idx = i * ch;
    const a = data[idx + 3];
    const x = i % w, y = Math.floor(i / w);
    const isBorder = x === 0 || x === w - 1 || y === 0 || y === h - 1;

    // alpha 통계
    if (a === 0) transparent += 1;
    else if (a < 255) semiAlpha += 1;
    else opaque += 1;

    // border touch
    if (isBorder) {
      borderTotal += 1;
      if (a > OPAQUE_MIN) {
        borderOpaque += 1;
        borderTouch = true;
      }
    }

    // edge spill: 반투명/불투명 경계 픽셀에서 key 색과 유사한 RGB 검출
    if (a > 0 && a < 255) {
      edgeTotal += 1;
      const pixelYCbCr = rgbToYCbCr(data[idx], data[idx + 1], data[idx + 2]);
      const dist = cbCrDist(pixelYCbCr, keyYCbCr);
      // Cb·Cr 거리가 30 미만이면 spill 의심
      if (dist < 30) edgeSpill += 1;
    }
  }

  const opaquePixelRatio = total > 0 ? opaque / total : 0;
  // foregroundLossRisk: kernel이 내부 픽셀 손실 감지 + 불투명 비율이 너무 낮음
  const fgLossRisk = kernelStats.potentialForegroundLoss > 0 || opaquePixelRatio < 0.01;

  return {
    keyConfidence: 0,
    borderDominantRatio: 0,
    transparentRatio: total > 0 ? transparent / total : 1,
    semiAlphaRatio: total > 0 ? semiAlpha / total : 0,
    borderOpaqueRatio: borderTotal > 0 ? borderOpaque / borderTotal : 0,
    edgeSpillRatio: edgeTotal > 0 ? edgeSpill / edgeTotal : 0,
    opaquePixelRatio,
    foregroundTouchesBorder: borderTouch,
    foregroundLossRisk: fgLossRisk,
    emptyOutput: opaquePixelRatio < CHROMA_KEY_QUALITY_POLICY.emptyOpaqueThreshold,
  };
}

// ---------------------------------------------------------------------------
// 품질 평가 — 품질 지표 → pass/warn/fallback/fail
// ---------------------------------------------------------------------------

export function evaluateChromaKeyQuality(
  quality: ChromaKeyQualityType,
  keyConfidence: number,
  _profile?: ChromaKeyProfileType,
): QualityEvaluationType {
  const P = CHROMA_KEY_QUALITY_POLICY;
  const warnings: string[] = [];
  let verdict: QualityVerdictType = "pass";

  // 1) key confidence
  if (keyConfidence < P.keyConfidenceMin) {
    warnings.push("low_key_confidence");
    verdict = "fallback";
  }

  // 2) empty output
  if (quality.emptyOutput) {
    return { verdict: "fail", reason: "quality_gate_failed", warnings: [...warnings, "empty_output"] };
  }

  // 3) foreground loss risk
  if (quality.foregroundLossRisk) {
    warnings.push("foreground_loss_risk");
    verdict = "fallback";
  }

  // 4) edge spill exceeded
  if (quality.edgeSpillRatio > P.edgeSpillRatioMax) {
    warnings.push("edge_spill_exceeded");
    verdict = verdict === "pass" ? "warn" : verdict;
  }

  // 5) foreground touches border
  if (quality.foregroundTouchesBorder) {
    warnings.push("foreground_touches_border");
    if (verdict === "pass") verdict = "warn";
  }

  // 6) opaque ratio too low (but not empty)
  if (quality.opaquePixelRatio < 0.02) {
    warnings.push("low_opaque_ratio");
    if (verdict === "pass") verdict = "warn";
  }

  if (verdict === "fallback") {
    return { verdict: "fallback", reason: "quality_gate_failed", warnings };
  }
  if (verdict === "warn") {
    return { verdict: "warn", warnings };
  }
  return { verdict: "pass", warnings };
}

