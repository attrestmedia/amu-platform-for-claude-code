import type { CubicBezier, NamedEasing } from './types';

/**
 * AMU Text Motion 디자인 토큰 (단일 소스).
 * 프리셋·스펙 검증·React/DOM/영상 어댑터가 모두 이 값을 참조한다.
 */
export const AMU_TEXT_MOTION_TOKENS = {
  duration: {
    instant: 150,
    fast: 300,
    quick: 400,
    normal: 500,
    medium: 600,
    slow: 800,
    slower: 1000,
    slowest: 1200,
    long: 1500,
    extended: 2000,
  },
  stagger: {
    none: 0,
    tight: 30,
    normal: 50,
    relaxed: 60,
    loose: 80,
    dramatic: 100,
  },
  /** 루프 재생 시 한 사이클 후 대기 (원본 라이브러리 공통값) */
  loopDelayMs: 2500,
  /** 3D 계열 기본 원근 */
  perspective: {
    near: 400,
    normal: 500,
    far: 800,
  },
  /** 색상은 모두 CSS 변수 + fallback. 테마(라이트/다크)는 currentColor 기반으로 자동 추종 */
  color: {
    accent: 'var(--amu-text-motion-accent, #22d3ee)',
    splitA: 'var(--amu-text-motion-split-a, #ff2a55)',
    splitB: 'var(--amu-text-motion-split-b, #2a6bff)',
    extrude: 'var(--amu-text-motion-extrude, color-mix(in srgb, currentColor 35%, transparent))',
  },
  /** 스펙 검증 한계값 */
  limits: {
    maxTextLength: 500,
    maxDurationMs: 20_000,
    maxStaggerMs: 2_000,
    maxDelayMs: 60_000,
    maxLoopDelayMs: 60_000,
  },
} as const;

export const AMU_EASINGS: Record<NamedEasing, CubicBezier> = {
  linear: [0, 0, 1, 1],
  ease: [0.25, 0.1, 0.25, 1],
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1],
  'amu-standard': [0.2, 0, 0, 1],
  'amu-emphasized': [0.3, 0, 0, 1],
  'amu-decelerate': [0, 0, 0, 1],
  'amu-accelerate': [0.3, 0, 1, 1],
  'amu-anticipate': [0.86, 0, 0.07, 1],
  'amu-expo': [0.16, 1, 0.3, 1],
};
