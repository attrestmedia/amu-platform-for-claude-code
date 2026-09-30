import { resolveEasing, type EasingFn } from './core/easing';
import { compileKeyframes, sampleKeyframes, type CompiledKeyframes } from './core/keyframes';
import { ROOT_STYLE, unitDisplay } from './core/layout';
import { hash01, seededPermutation } from './core/random';
import { segmentText, type TextSegmentation } from './core/segment';
import { composeStyle, mixColor, num } from './core/style';
import { AMU_TEXT_MOTION_TOKENS } from './core/tokens';
import type { MotionEasing, MotionStyle, StaggerFrom, TextMotionFrame, TextMotionPreset, TextMotionUnitFrame, TextSplit } from './core/types';
import { getTextMotionPreset } from './presets/registry';
import type { TextMotionSpec } from './spec';

/**
 * 공통 타임라인 엔진.
 * resolveTextMotion(spec) 로 한 번 해석하고, sampleTextMotion(resolved, timeMs) 로 어느 시점이든 계산한다.
 * - 순수 함수: 타이머·Math.random·Date 에 의존하지 않는다 (영상 프레임 렌더와 결과 동일)
 * - 모든 프리셋의 스태거·지연·루프·총 길이 계산이 이 파일 하나에서 이뤄진다.
 */

export interface ResolvedTiming {
  split: TextSplit;
  durationMs: number;
  staggerMs: number;
  delayMs: number;
  staggerFrom: StaggerFrom;
  easing: MotionEasing;
  seed: number;
  loop: boolean;
  loopDelayMs: number;
}

export interface ResolvedTextMotion {
  preset: TextMotionPreset;
  text: string;
  timing: ResolvedTiming;
  segmentation: TextSegmentation;
  /** unit 별 시작 순번 (0 = 가장 먼저) */
  ranks: number[];
  /** 한 사이클 길이 (지연 포함, 루프 대기 제외) */
  totalMs: number;
  compiled?: CompiledKeyframes;
  easingFn: EasingFn;
}

function computeRanks(count: number, from: StaggerFrom, seed: number): number[] {
  const mid = (count - 1) / 2;
  switch (from) {
    case 'end':
      return Array.from({ length: count }, (_, i) => count - 1 - i);
    case 'center':
      return Array.from({ length: count }, (_, i) => Math.abs(i - mid));
    case 'edges':
      return Array.from({ length: count }, (_, i) => mid - Math.abs(i - mid));
    case 'random': {
      const order = seededPermutation(count, seed);
      const ranks = new Array<number>(count);
      order.forEach((unitIndex, rank) => (ranks[unitIndex] = rank));
      return ranks;
    }
    default:
      return Array.from({ length: count }, (_, i) => i);
  }
}

export function resolveTextMotion(spec: TextMotionSpec): ResolvedTextMotion {
  const preset = getTextMotionPreset(spec.preset);
  // block 은 컨테이너 전체를 덮으므로 항상 whole
  const split = preset.kind === 'block' ? 'whole' : (spec.split ?? preset.defaultSplit);
  const timing: ResolvedTiming = {
    split,
    durationMs: spec.durationMs ?? preset.durationMs,
    staggerMs: spec.staggerMs ?? preset.staggerMs,
    delayMs: spec.delayMs ?? 0,
    // random-reveal 은 순서 자체가 모션이므로 기본이 random
    staggerFrom: spec.staggerFrom ?? (preset.kind === 'shuffle-order' ? 'random' : 'start'),
    easing: spec.easing ?? preset.easing,
    seed: spec.seed ?? 1,
    loop: spec.loop ?? false,
    loopDelayMs: spec.loopDelayMs ?? AMU_TEXT_MOTION_TOKENS.loopDelayMs,
  };
  if (preset.kind === 'scramble' && spec.durationMs === undefined) timing.durationMs = preset.frameMs * preset.scrambleFrames;

  const segmentation = segmentText(spec.text, split);
  const ranks = computeRanks(segmentation.units.length, timing.staggerFrom, timing.seed);
  const maxRank = ranks.reduce((max, r) => Math.max(max, r), 0);

  return {
    preset,
    text: spec.text,
    timing,
    segmentation,
    ranks,
    totalMs: timing.delayMs + maxRank * timing.staggerMs + timing.durationMs,
    compiled: preset.kind === 'keyframes' ? compileKeyframes(preset, timing.easing) : undefined,
    easingFn: resolveEasing(timing.easing),
  };
}

/** 루프 포함 한 사이클 (영상 씬 길이 산정에 사용) */
export function getTextMotionCycleMs(resolved: ResolvedTextMotion): number {
  return resolved.totalMs + (resolved.timing.loop ? resolved.timing.loopDelayMs : 0);
}

/** 컨테이너에 필요한 정적 스타일 (프리셋 종류에 따라) */
export function getRootStyle(resolved: ResolvedTextMotion): MotionStyle {
  if (resolved.preset.kind === 'block') {
    return { ...ROOT_STYLE, display: 'inline-block', overflow: 'hidden', 'vertical-align': 'top' };
  }
  return ROOT_STYLE;
}

/** 단위 i 의 로컬 진행도 (0 미만 = 시작 전) */
function unitProgress(resolved: ResolvedTextMotion, index: number, t: number): number {
  const { delayMs, staggerMs, durationMs } = resolved.timing;
  const start = delayMs + (resolved.ranks[index] ?? 0) * staggerMs;
  if (durationMs <= 0) return t >= start ? 1 : -1;
  return (t - start) / durationMs;
}

const isSpace = (text: string) => /^\s+$/.test(text);

function sampleUnits(resolved: ResolvedTextMotion, t: number): Pick<TextMotionFrame, 'units' | 'overlay' | 'cursor'> {
  const { preset, segmentation, timing } = resolved;
  const { units } = segmentation;

  switch (preset.kind) {
    case 'keyframes': {
      const compiled = resolved.compiled!;
      return { units: units.map((_, i) => ({ style: sampleKeyframes(compiled, unitProgress(resolved, i, t)) })) };
    }

    case 'type': {
      const frameUnits = units.map<TextMotionUnitFrame>((text, i) => ({
        style: { display: unitProgress(resolved, i, t) >= 0 ? unitDisplay(isSpace(text)) : 'none' },
      }));
      if (!preset.cursor) return { units: frameUnits };
      const blink = preset.cursorBlinkMs;
      const on = blink <= 0 || ((t % blink) + blink) % blink < blink / 2;
      return { units: frameUnits, cursor: { opacity: on ? '1' : '0' } };
    }

    case 'scramble': {
      const { charset, frameMs } = preset;
      return {
        units: units.map<TextMotionUnitFrame>((text, i) => {
          const p = unitProgress(resolved, i, t);
          if (isSpace(text) || p >= 1) return { style: { visibility: 'visible' }, text };
          if (p < 0) return { style: { visibility: 'hidden' }, text };
          const step = Math.floor((p * timing.durationMs) / frameMs);
          const glyph = charset[Math.floor(hash01(timing.seed, i, step) * charset.length)];
          return { style: { visibility: 'visible' }, text: glyph };
        }),
      };
    }

    case 'shuffle-order':
      return {
        units: units.map((_, i) => ({ style: { opacity: unitProgress(resolved, i, t) >= 0 ? '1' : '0' } })),
      };

    case 'block': {
      // 전반: 블록이 왼쪽→오른쪽으로 덮음 / 후반: 텍스트 노출 + 블록이 오른쪽으로 걷힘
      const p = unitProgress(resolved, 0, t);
      const firstHalf = p < 0.5;
      const local = firstHalf ? Math.max(0, p) * 2 : Math.min(1, (p - 0.5) * 2);
      const eased = resolved.easingFn(local);
      return {
        units: units.map(() => ({ style: { opacity: firstHalf ? '0' : '1' } })),
        overlay: {
          transform: `scaleX(${num(firstHalf ? eased : 1 - eased)})`,
          'transform-origin': firstHalf ? 'left' : 'right',
        },
      };
    }

    case 'sweep':
      return {
        units: units.map((_, i) => {
          const p = unitProgress(resolved, i, t);
          if (p >= 1) {
            return {
              style: {
                'background-image': 'none',
                'background-size': 'auto',
                'background-position': '0 0',
                '-webkit-background-clip': 'border-box',
                'background-clip': 'border-box',
                '-webkit-text-fill-color': 'currentColor',
              },
            };
          }
          const clamped = Math.max(0, p);
          // 마지막 20% 구간에서 어두운 부분이 원래 색으로 수렴 → 종료 시 끊김 없음
          const dim = clamped < 0.8 ? 0.25 : 0.25 + 0.75 * ((clamped - 0.8) / 0.2);
          const dimColor = mixColor('currentColor', dim);
          return {
            style: {
              'background-image': `linear-gradient(to right, ${dimColor} 0%, currentColor 50%, ${dimColor} 100%)`,
              'background-size': '200% 100%',
              'background-position': `${num(100 - 100 * resolved.easingFn(clamped))}% 0`,
              '-webkit-background-clip': 'text',
              'background-clip': 'text',
              '-webkit-text-fill-color': 'transparent',
            },
          };
        }),
      };
  }
}

/** 임의 시점(ms)의 프레임. 웹 재생/스크럽/영상 렌더 공통 진입점 */
export function sampleTextMotion(resolved: ResolvedTextMotion, timeMs: number): TextMotionFrame {
  const { totalMs, timing } = resolved;
  let t = Math.max(0, timeMs);
  let done = false;
  if (timing.loop) {
    const cycle = getTextMotionCycleMs(resolved);
    t = cycle > 0 ? t % cycle : 0;
  } else if (t >= totalMs) {
    t = totalMs;
    done = true;
  }
  return { ...sampleUnits(resolved, t), timeMs: t, done };
}

/** 0..1 진행도로 샘플 (스크롤 연동 등) */
export function sampleTextMotionAtProgress(resolved: ResolvedTextMotion, progress: number): TextMotionFrame {
  const p = Math.min(1, Math.max(0, progress));
  return sampleTextMotion({ ...resolved, timing: { ...resolved.timing, loop: false } }, p * resolved.totalMs);
}

/**
 * 모션 감소(prefers-reduced-motion) 시 보여줄 정지 프레임.
 * - transient(등장 후 사라짐)는 사라진 상태 대신 "읽을 수 있는 원래 모습"을 보여준다.
 * - 그 외는 최종 프레임.
 */
export function getStaticTextMotionFrame(resolved: ResolvedTextMotion): TextMotionFrame {
  if (resolved.preset.kind === 'keyframes' && resolved.preset.category === 'transient') {
    const style = composeStyle({}, resolved.compiled!.styleContext);
    return { units: resolved.segmentation.units.map(() => ({ style })), timeMs: resolved.totalMs, done: true };
  }
  return sampleTextMotion({ ...resolved, timing: { ...resolved.timing, loop: false } }, resolved.totalMs);
}

/** 스펙의 1회 재생 길이 (ms). 영상 씬/자막 타이밍 배치용 */
export function getTextMotionDurationMs(spec: TextMotionSpec): number {
  return resolveTextMotion(spec).totalMs;
}
