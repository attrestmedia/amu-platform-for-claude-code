/**
 * AMU Text Motion Library
 *
 * 레이어 (의존 방향: 위 → 아래)
 *   react/TextMotion   React 어댑터 ('use client')
 *   runtime            브라우저 런타임: DOM 반영 · rAF 플레이어 · 트리거 · 바닐라 mount
 *   timeline / spec    공통 엔진: 스펙 검증 → 해석 → 임의 시점 샘플링 (순수 함수)
 *   presets            99개 프리셋 데이터 (원본 001–100, 026·029 통합)
 *   core               토큰 · 이징 · 분할 · 키프레임 보간 · 스타일 합성 · 결정적 난수
 */

export { AMU_TEXT_MOTION_TOKENS, AMU_EASINGS } from './core/tokens';
export { resolveEasing, isMotionEasing } from './core/easing';
export { segmentText, type TextLayoutNode, type TextSegmentation } from './core/segment';
export { TEXT_MOTION_DATA_ATTR } from './core/layout';
export type * from './core/types';

export {
  TEXT_MOTION_PRESETS,
  TEXT_MOTION_PRESET_IDS,
  TEXT_MOTION_PRESET_LIST,
  getTextMotionPreset,
  getTextMotionPresetByLegacyId,
  isTextMotionPresetId,
  listTextMotionPresets,
  type TextMotionPresetId,
} from './presets/registry';

export {
  parseTextMotionSpec,
  STAGGER_FROMS,
  TEXT_SPLITS,
  type TextMotionOptions,
  type TextMotionSpec,
  type TextMotionSpecResult,
} from './spec';

export {
  getRootStyle,
  getStaticTextMotionFrame,
  getTextMotionCycleMs,
  getTextMotionDurationMs,
  resolveTextMotion,
  sampleTextMotion,
  sampleTextMotionAtProgress,
  type ResolvedTextMotion,
  type ResolvedTiming,
} from './timeline';

export {
  applyTextMotionFrame,
  collectTextMotionElements,
  createTextMotionPlayer,
  mountTextMotion,
  observeInView,
  prefersReducedMotion,
  type MountTextMotionOptions,
  type MountedTextMotion,
  type ReducedMotionPolicy,
  type TextMotionElements,
  type TextMotionHandle,
  type TextMotionPlayer,
  type TextMotionTrigger,
} from './runtime';

export { TextMotion, type TextMotionProps } from './react/TextMotion';
