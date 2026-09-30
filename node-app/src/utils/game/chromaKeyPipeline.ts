/**
 * ChromaKey v2 — 통합 파이프라인 orchestrator (CK-105)
 *
 * detectKeyColor → kernel → refine → quality 순서로 실행하는 단일 진입점.
 * 환경 중립(browser/Node/Worker)이며, raw RGBA Uint8Array를 입출력으로 사용한다.
 *
 * @domain game.asset-pipeline.chroma-key
 * @scope global
 */

import type { ChromaKeyOptionsType, ChromaKeyQualityType } from "types/game/chroma-key";
import { detectKeyColor } from "./chromaKeyDetect";
import type { KeyDetectResultType } from "./chromaKeyDetect";
import { applyChromaKeyKernel } from "./chromaKeyKernel";
import type { ChromaKeyKernelStatsType } from "./chromaKeyKernel";
import { applyChromaKeyRefinements } from "./chromaKeyRefine";
import type { ChromaKeyRefineStatsType } from "./chromaKeyRefine";
import { analyzeChromaKeyQuality, evaluateChromaKeyQuality } from "./chromaKeyQuality";
import type { QualityEvaluationType } from "./chromaKeyQuality";

// ---------------------------------------------------------------------------
// 타입
// ---------------------------------------------------------------------------

export type ChromaKeyPipelineInputType = {
  data: Uint8Array;
  width: number;
  height: number;
  channels: number;
  options: ChromaKeyOptionsType;
  sourceKeyConfidence?: number;
};

export type ChromaKeyPipelineResultType = {
  /** 처리된 RGBA 데이터 (in-place 수정된 입력) */
  data: Uint8Array;
  /** 키 감지 결과 */
  detection: KeyDetectResultType;
  /** 커널 통계 */
  kernel: ChromaKeyKernelStatsType;
  /** refine 통계 */
  refine: ChromaKeyRefineStatsType;
  /** 품질 지표 */
  quality: ChromaKeyQualityType;
  /** 품질 평가 */
  evaluation: QualityEvaluationType;
};

// ---------------------------------------------------------------------------
// 메인 파이프라인
// ---------------------------------------------------------------------------

export function runChromaKeyPipeline(input: ChromaKeyPipelineInputType): ChromaKeyPipelineResultType {
  const { data, width, height, channels, options } = input;

  // 1) 키 색 결정
  const detection = detectKeyColor({
    data, width, height, channels,
    keyMode: options.keyMode,
    keyColor: options.keyColor,
  });

  // 2) YCbCr 소프트 알파 커널
  const kernel = applyChromaKeyKernel({
    data, width, height, channels,
    keyColor: detection.resolvedColor,
    similarity: options.similarity,
    softness: options.softness,
    coverageMode: options.coverageMode,
  });

  // 3) feather·choke·despill
  const refine = applyChromaKeyRefinements({
    data, width, height, channels,
    keyColor: detection.resolvedColor,
    feather: options.feather,
    choke: options.choke,
    despill: options.despill,
  });

  // 4) 품질 분석 + 평가
  const quality = analyzeChromaKeyQuality(data, width, height, channels, detection.resolvedColor, kernel);
  quality.keyConfidence = detection.confidence;
  quality.borderDominantRatio = detection.candidates[0]?.ratio ?? 0;

  const evaluation = evaluateChromaKeyQuality(quality, detection.confidence, options.profile);

  return { data, detection, kernel, refine, quality, evaluation };
}
