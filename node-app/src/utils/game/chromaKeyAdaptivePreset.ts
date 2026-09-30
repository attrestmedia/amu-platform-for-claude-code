/**
 * ChromaKey v2 — 참조 이미지 팔레트 기반 adaptive key preset 선택기 (CK-500)
 *
 * anchor(참조 이미지)의 주요 색상 팔레트를 추출하여 green/blue/magenta 키 프리셋 중
 * foreground 색상과 CbCr 거리가 가장 먼(=충돌 위험이 가장 낮은) preset을 선택한다.
 *
 * @domain game.asset-pipeline.chroma-key
 * @scope global (browser/Node/Worker 공용)
 */

import { rgbToYCbCr } from "./chromaKeyKernel";
import {
  CHROMA_KEY_GREEN,
  CHROMA_KEY_BLUE,
  CHROMA_KEY_MAGENTA,
  type ChromaKeyColorPresetType,
} from "consts/game/chromaKey";
import type { ChromaKeyModeType } from "types/game/chroma-key";

// ---------------------------------------------------------------------------
// 정책 상수
// ---------------------------------------------------------------------------

const PALETTE_QUANT_STEP = 32;
const PALETTE_MAX_COLORS = 8;
const BG_WHITE_THRESHOLD = 240;
const BG_BLACK_THRESHOLD = 15;
const PALETTE_CONFIDENCE_MIN = 0.05;
const CBCR_COLLISION_WARN_THRESHOLD = 40;

// ---------------------------------------------------------------------------
// 타입
// ---------------------------------------------------------------------------

export type AdaptivePresetPaletteColorType = {
  r: number; g: number; b: number;
  /** 팔레트 내 비율 (0–1) */
  ratio: number;
};

export type AdaptivePresetCandidateType = {
  preset: Exclude<ChromaKeyModeType, "auto" | "custom">;
  color: ChromaKeyColorPresetType;
  /** preset과 가장 가까운 foreground 색상과의 CbCr 거리 */
  minCbCrDistance: number;
};

export type AdaptivePresetResultType = {
  selectedPreset: Exclude<ChromaKeyModeType, "auto" | "custom">;
  resolvedColor: ChromaKeyColorPresetType;
  confidence: number;
  source: "adaptive" | "fallback";
  candidates: AdaptivePresetCandidateType[];
  palette: AdaptivePresetPaletteColorType[];
  warnings: string[];
};

export type AdaptivePresetInputType = {
  data?: Uint8Array;
  width?: number;
  height?: number;
  channels?: number;
};


// ---------------------------------------------------------------------------
// 팔레트 추출 — quantized histogram + 배경 제외 + ratio 정렬
// ---------------------------------------------------------------------------

function bucketKey(r: number, g: number, b: number): string {
  return `${Math.floor(r / PALETTE_QUANT_STEP)}:${Math.floor(g / PALETTE_QUANT_STEP)}:${Math.floor(b / PALETTE_QUANT_STEP)}`;
}

function extractPalette(
  data: Uint8Array, width: number, height: number, channels: number,
): { palette: AdaptivePresetPaletteColorType[]; coveredRatio: number } {
  const total = width * height;
  const histogram = new Map<string, { count: number; rSum: number; gSum: number; bSum: number }>();

  for (let i = 0; i < total; i += 1) {
    const idx = i * channels;
    const r = data[idx], g = data[idx + 1], b = data[idx + 2], a = data[idx + 3];
    if (a === 0) continue;
    const key = bucketKey(r, g, b);
    const bin = histogram.get(key) || { count: 0, rSum: 0, gSum: 0, bSum: 0 };
    bin.count += 1; bin.rSum += r; bin.gSum += g; bin.bSum += b;
    histogram.set(key, bin);
  }

  const items: AdaptivePresetPaletteColorType[] = [];
  let coveredCount = 0;

  for (const bin of histogram.values()) {
    coveredCount += bin.count;
    const avgR = Math.round(bin.rSum / bin.count);
    const avgG = Math.round(bin.gSum / bin.count);
    const avgB = Math.round(bin.bSum / bin.count);
    if (avgR >= BG_WHITE_THRESHOLD && avgG >= BG_WHITE_THRESHOLD && avgB >= BG_WHITE_THRESHOLD) continue;
    if (avgR <= BG_BLACK_THRESHOLD && avgG <= BG_BLACK_THRESHOLD && avgB <= BG_BLACK_THRESHOLD) continue;
    items.push({ r: avgR, g: avgG, b: avgB, ratio: bin.count / total });
  }

  items.sort((a, b) => b.ratio - a.ratio);
  return { palette: items.slice(0, PALETTE_MAX_COLORS), coveredRatio: coveredCount / total };
}

// ---------------------------------------------------------------------------
// CbCr 거리 계산 헬퍼
// ---------------------------------------------------------------------------

function cbCrDist(aR: number, aG: number, aB: number, bR: number, bG: number, bB: number): number {
  const a = rgbToYCbCr(aR, aG, aB);
  const b = rgbToYCbCr(bR, bG, bB);
  const dcb = a.cb - b.cb, dcr = a.cr - b.cr;
  return Math.sqrt(dcb * dcb + dcr * dcr);
}

function computeMinCbCrDistance(
  presetColor: ChromaKeyColorPresetType,
  palette: AdaptivePresetPaletteColorType[],
): number {
  let minDist = Infinity;
  for (const pc of palette) {
    const dist = cbCrDist(presetColor.r, presetColor.g, presetColor.b, pc.r, pc.g, pc.b);
    if (dist < minDist) minDist = dist;
  }
  return palette.length === 0 ? Infinity : minDist;
}

function findNearestPaletteColor(
  presetColor: ChromaKeyColorPresetType,
  palette: AdaptivePresetPaletteColorType[],
): AdaptivePresetPaletteColorType | null {
  if (palette.length === 0) return null;
  let nearest = palette[0];
  let minD = cbCrDist(presetColor.r, presetColor.g, presetColor.b, nearest.r, nearest.g, nearest.b);
  for (let i = 1; i < palette.length; i++) {
    const d = cbCrDist(presetColor.r, presetColor.g, presetColor.b, palette[i].r, palette[i].g, palette[i].b);
    if (d < minD) { minD = d; nearest = palette[i]; }
  }
  return nearest;
}

// ---------------------------------------------------------------------------
// fallback 결과 생성
// ---------------------------------------------------------------------------

function buildFallbackResult(reason: string): AdaptivePresetResultType {
  return {
    selectedPreset: "magenta",
    resolvedColor: CHROMA_KEY_MAGENTA,
    confidence: 0,
    source: "fallback",
    candidates: [],
    palette: [],
    warnings: [reason],
  };
}

// ---------------------------------------------------------------------------
// 메인: adaptive preset 선택
// ---------------------------------------------------------------------------

/**
 * 참조 이미지(anchor)의 팔레트를 분석해 green/blue/magenta 중
 * foreground 색상과 CbCr 거리가 가장 먼(=충돌 위험 최저) preset을 선택한다.
 *
 * - anchor data undefined·채널 부족 → magenta fallback
 * - 추출된 팔레트 신뢰도 부족 → magenta fallback
 * - 3개 preset의 minCbCrDistance 중 최대값을 가진 preset 선택
 * - 모든 preset의 minCbCrDistance가 임계 미만이면 충돌 경고
 * - 동일 입력(동일 anchor SHA)에 대해 결정적 결과를 보장
 */
export function selectAdaptiveChromaKeyPreset(
  input: AdaptivePresetInputType,
): AdaptivePresetResultType {
  const { data, width, height, channels } = input;

  // --- anchor 미존재: magenta fallback ---
  if (data === undefined || width === undefined || height === undefined || channels === undefined) {
    return buildFallbackResult("anchor_missing");
  }
  if (channels < 4 || width <= 0 || height <= 0) {
    return buildFallbackResult("anchor_invalid");
  }

  // --- 팔레트 추출 ---
  const { palette, coveredRatio } = extractPalette(data, width, height, channels);

  // --- 팔레트 신뢰도 부족 ---
  if (coveredRatio < PALETTE_CONFIDENCE_MIN || palette.length === 0) {
    return buildFallbackResult("low_palette_confidence");
  }

  // --- 3개 preset 각각의 최소 CbCr 거리 산출 ---
  const presets: { preset: Exclude<ChromaKeyModeType, "auto" | "custom">; color: ChromaKeyColorPresetType }[] = [
    { preset: "green", color: CHROMA_KEY_GREEN },
    { preset: "blue", color: CHROMA_KEY_BLUE },
    { preset: "magenta", color: CHROMA_KEY_MAGENTA },
  ];

  const candidates: AdaptivePresetCandidateType[] = presets.map((p) => ({
    preset: p.preset,
    color: p.color,
    minCbCrDistance: computeMinCbCrDistance(p.color, palette),
  }));

  // minCbCrDistance 내림차순 정렬
  candidates.sort((a, b) => b.minCbCrDistance - a.minCbCrDistance);

  const top = candidates[0];
  const second = candidates[1];
  const warnings: string[] = [];

  // --- 충돌 위험 검사 ---
  if (top.minCbCrDistance < CBCR_COLLISION_WARN_THRESHOLD) {
    warnings.push("high_collision_risk");
  }

  const nearestPaletteColor = findNearestPaletteColor(top.color, palette);
  if (nearestPaletteColor && nearestPaletteColor.ratio >= 0.1
      && top.minCbCrDistance < CBCR_COLLISION_WARN_THRESHOLD) {
    warnings.push("dominant_fg_near_key");
  }

  // --- confidence 계산 ---
  const paletteConf = Math.min(1.0, coveredRatio / 0.3);
  const distDiff = top.minCbCrDistance - second.minCbCrDistance;
  const distConf = Math.min(1.0, distDiff / 30);
  const absConf = Math.min(1.0, top.minCbCrDistance / 60);
  let confidence = paletteConf * 0.3 + distConf * 0.3 + absConf * 0.4;
  const penalty = 0.1 * warnings.length;
  confidence = Math.max(0, Math.min(1.0, confidence - penalty));

  return {
    selectedPreset: top.preset,
    resolvedColor: top.color,
    confidence,
    source: "adaptive",
    candidates,
    palette,
    warnings,
  };
}

