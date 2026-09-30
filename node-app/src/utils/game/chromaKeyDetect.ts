/**
 * ChromaKey v2 — 키 색 결정기 (CK-101)
 *
 * 이미지 경계 링에서 quantized histogram을 구축해 지배 키 색을 결정한다.
 * 명시 키(custom)·프리셋(green/blue/magenta)·자동 감지(auto) 우선순위로
 * resolvedColor·confidence·candidate 목록을 반환한다.
 *
 * 설계 §5.1 "키 색 결정" — border ring 기반, YCbCr에서는 Y를 주축에서 제외.
 * 이 모듈은 RGB 도메인에서 후보를 추출하고, YCbCr 분석·거리 계산은 CK-102 커널이 담당한다.
 *
 * @domain game.asset-pipeline.chroma-key
 * @scope global (browser/Node/Worker 공용)
 */

import {
  CHROMA_KEY_COLOR_PRESETS,
  type ChromaKeyColorPresetType,
} from "consts/game/chromaKey";
import type {
  ChromaKeyColorType,
  ChromaKeyModeType,
} from "types/game/chroma-key";

// ---------------------------------------------------------------------------
// 정책 상수
// ---------------------------------------------------------------------------

/** border ring 폭 (px) — 기존 SPRITE_CHROMA_KEY_POLICY와 동일 */
const BORDER_RING_PX = 2;

/** histogram quantize 단계 — 32단계로 RGB 양자화 */
const QUANT_STEP = 32;

/**
 * 지배색 최소 비율 — border ring 픽셀 중 가장 많은 bin의 비율이 이 값 미만이면
 * 단색 배경이 아니라고 판정해 key_not_detected 처리.
 */
const DOMINANT_RATIO_MIN = 0.6;

/**
 * 무채색 판정 임계 — YCbCr의 Cb/Cr 크기가 이 값 미만이면 회색조 배경으로 간주.
 */
const ACHROMATIC_CB_CR_THRESHOLD = 30;

/**
 * 복수 배경 후보 판정 임계 — 2순위 bin의 비율이 1순위의 이 비율 이상이면
 * 두 개 이상의 주요 배경색이 존재한다고 판정.
 */
const MULTI_BG_RATIO = 0.5;

// ---------------------------------------------------------------------------
// 타입
// ---------------------------------------------------------------------------

export type KeyDetectInputType = {
  /** RGBA raw 픽셀 데이터 */
  data: Uint8Array;
  /** 이미지 너비 */
  width: number;
  /** 이미지 높이 */
  height: number;
  /** 채널 수 (4=RGBA) */
  channels: number;
  /** 키 결정 모드 */
  keyMode: ChromaKeyModeType;
  /** custom 모드에서만 사용할 명시 키 색상 */
  keyColor?: ChromaKeyColorType;
};

export type KeyDetectCandidateType = {
  color: ChromaKeyColorPresetType;
  /** border ring 내 해당 bin의 비율 (0–1) */
  ratio: number;
};

export type KeyDetectResultType = {
  /** 결정된 키 색상 */
  resolvedColor: ChromaKeyColorPresetType;
  /** 신뢰도 (0–1). custom/preset = 1.0, auto-detected = 지배 비율 기반 */
  confidence: number;
  /** 결정 출처 */
  source: "preset" | "custom" | "auto";
  /** auto 모드에서 상위 후보 목록 (최대 3개, ratio 내림차순) */
  candidates: KeyDetectCandidateType[];
  /** 경고: low_dominance, achromatic_key, multi_background, key_not_detected */
  warnings: string[];
};

// ---------------------------------------------------------------------------
// RGB → YCbCr 변환 (ITU-R BT.601)
// ---------------------------------------------------------------------------

function rgbToYCbCr(r: number, g: number, b: number): { y: number; cb: number; cr: number } {
  const y  =  0.299 * r + 0.587 * g + 0.114 * b;
  const cb = -0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr =  0.5 * r - 0.418688 * g - 0.081312 * b;
  return { y, cb, cr };
}

// ---------------------------------------------------------------------------
// Histogram bucket 식별자
// ---------------------------------------------------------------------------

function bucketKey(r: number, g: number, b: number): string {
  return `${Math.floor(r / QUANT_STEP)}:${Math.floor(g / QUANT_STEP)}:${Math.floor(b / QUANT_STEP)}`;
}

// ---------------------------------------------------------------------------
// Border ring pixel 수집 + histogram 집계
// ---------------------------------------------------------------------------

type HistogramBin = {
  count: number;
  sumR: number;
  sumG: number;
  sumB: number;
};

function buildBorderRingHistogram(
  data: Uint8Array,
  width: number,
  height: number,
  channels: number,
): { histogram: Map<string, HistogramBin>; borderCount: number } {
  const histogram = new Map<string, HistogramBin>();
  let borderCount = 0;

  for (let y = 0; y < height; y += 1) {
    const isBorderRow = y < BORDER_RING_PX || y >= height - BORDER_RING_PX;
    for (let x = 0; x < width; x += 1) {
      if (!isBorderRow && x >= BORDER_RING_PX && x < width - BORDER_RING_PX) continue;

      const idx = (y * width + x) * channels;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];
      if (a <= 8) continue;

      const key = bucketKey(r, g, b);
      const bin = histogram.get(key) ?? ({ count: 0, sumR: 0, sumG: 0, sumB: 0 } as HistogramBin);
      bin.count += 1;
      bin.sumR += r;
      bin.sumG += g;
      bin.sumB += b;
      histogram.set(key, bin);
      borderCount += 1;
    }
  }

  return { histogram, borderCount };
}

// ---------------------------------------------------------------------------
// Bin → 후보 변환
// ---------------------------------------------------------------------------

function binToCandidate(bin: HistogramBin, borderCount: number): KeyDetectCandidateType {
  return {
    color: {
      r: Math.round(bin.sumR / bin.count),
      g: Math.round(bin.sumG / bin.count),
      b: Math.round(bin.sumB / bin.count),
    },
    ratio: borderCount > 0 ? bin.count / borderCount : 0,
  };
}

// ---------------------------------------------------------------------------
// 무채색 판정
// ---------------------------------------------------------------------------

function isAchromatic(color: ChromaKeyColorPresetType): boolean {
  const { cb, cr } = rgbToYCbCr(color.r, color.g, color.b);
  return Math.sqrt(cb * cb + cr * cr) < ACHROMATIC_CB_CR_THRESHOLD;
}

// ---------------------------------------------------------------------------
// 메인: 키 색 결정
// ---------------------------------------------------------------------------

export function detectKeyColor(input: KeyDetectInputType): KeyDetectResultType {
  const { data, width, height, channels, keyMode, keyColor } = input;

  if (channels < 4) {
    return {
      resolvedColor: { r: 0, g: 0, b: 0 },
      confidence: 0,
      source: "auto",
      candidates: [],
      warnings: ["key_not_detected"],
    };
  }

  // --- custom 모드: 사용자 명시 키 색상 ---
  if (keyMode === "custom") {
    if (!keyColor) {
      return {
        resolvedColor: { r: 0, g: 0, b: 0 },
        confidence: 0,
        source: "custom",
        candidates: [],
        warnings: ["key_not_detected"],
      };
    }
    return {
      resolvedColor: { ...keyColor },
      confidence: 1.0,
      source: "custom",
      candidates: [],
      warnings: [],
    };
  }

  // --- preset 모드 (green/blue/magenta): 정의된 프리셋 색상 ---
  if (keyMode !== "auto") {
    const preset = CHROMA_KEY_COLOR_PRESETS[keyMode];
    if (!preset) {
      return {
        resolvedColor: { r: 0, g: 0, b: 0 },
        confidence: 0,
        source: "preset",
        candidates: [],
        warnings: ["key_not_detected"],
      };
    }
    return {
      resolvedColor: { ...preset },
      confidence: 1.0,
      source: "preset",
      candidates: [],
      warnings: [],
    };
  }

  // --- auto 모드: 경계 링 histogram 기반 감지 ---
  const { histogram, borderCount } = buildBorderRingHistogram(data, width, height, channels);

  if (borderCount === 0 || histogram.size === 0) {
    return {
      resolvedColor: { r: 0, g: 0, b: 0 },
      confidence: 0,
      source: "auto",
      candidates: [],
      warnings: ["key_not_detected"],
    };
  }

  // histogram → 후보 목록, count 내림차순 정렬
  const candidates: KeyDetectCandidateType[] = [];
  for (const bin of histogram.values()) {
    candidates.push(binToCandidate(bin, borderCount));
  }
  candidates.sort((a, b) => b.ratio - a.ratio);

  const topCandidate = candidates[0];
  const warnings: string[] = [];

  // 지배도 검사
  if (topCandidate.ratio < DOMINANT_RATIO_MIN) {
    warnings.push("low_dominance");
  }

  // 무채색 배경 검사
  if (isAchromatic(topCandidate.color)) {
    warnings.push("achromatic_key");
  }

  // 복수 배경 후보 검사
  if (candidates.length > 1 && candidates[1].ratio >= topCandidate.ratio * MULTI_BG_RATIO) {
    warnings.push("multi_background");
  }

  // 신뢰도 계산: 지배 비율을 DOMINANT_RATIO_MIN 기준으로 정규화
  const rawConfidence = Math.min(1.0, topCandidate.ratio / DOMINANT_RATIO_MIN);
  const penalty = 0.15 * warnings.length;
  const confidence = Math.max(0, rawConfidence - penalty);

  return {
    resolvedColor: topCandidate.color,
    confidence,
    source: "auto",
    candidates: candidates.slice(0, 3),
    warnings,
  };
}

