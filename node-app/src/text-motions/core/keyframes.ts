import { resolveEasing, type EasingFn } from './easing';
import { ALL_CHANNELS, NEUTRAL, channelGroup, composeStyle, num, type ChannelValues, type StyleContext } from './style';
import type { KeyframeTextMotionPreset, MotionChannel, MotionEasing, MotionKeyframe, MotionLength, MotionStyle } from './types';

/**
 * 키프레임 프리셋 컴파일/샘플링 (CSS @keyframes 의미론을 순수 함수로 재현).
 * 웹 재생·스크럽·영상 프레임 렌더 모두 이 함수만 사용하므로 결과가 항상 동일하다.
 */

type Length = { value: number; unit: string };
type TrackPoint = { offset: number; value: number | Length; easing: EasingFn };

export interface CompiledKeyframes {
  tracks: Map<MotionChannel, TrackPoint[]>;
  styleContext: StyleContext;
  hiddenBeforeStart: boolean;
}

const LENGTH_CHANNELS = new Set<MotionChannel>(['x', 'y']);

function parseLength(value: MotionLength): Length {
  if (typeof value === 'number') return { value, unit: 'px' };
  const unit = value.endsWith('%') ? '%' : 'em';
  return { value: parseFloat(value), unit };
}

const cache = new WeakMap<KeyframeTextMotionPreset, Map<string, CompiledKeyframes>>();

export function compileKeyframes(preset: KeyframeTextMotionPreset, easing: MotionEasing): CompiledKeyframes {
  const key = JSON.stringify(easing);
  let byEasing = cache.get(preset);
  if (!byEasing) {
    byEasing = new Map();
    cache.set(preset, byEasing);
  }
  const hit = byEasing.get(key);
  if (hit) return hit;

  const frames = [...preset.frames].sort((a, b) => a.offset - b.offset);
  const used = new Set<MotionChannel>(ALL_CHANNELS.filter((c) => frames.some((f) => f[c] !== undefined)));
  const hiddenBeforeStart = preset.hiddenBeforeStart ?? true;
  const easingAt = (offset: number) =>
    resolveEasing(frames.find((f) => f.offset === offset)?.easing ?? easing);

  // 그룹 채널: 그룹 중 하나라도 지정된 프레임에서 나머지는 중립값 (CSS 속성 단위 의미론)
  const filled: MotionKeyframe[] = frames.map((frame) => {
    const next: MotionKeyframe = { ...frame };
    for (const channel of used) {
      if (frame[channel] !== undefined) continue;
      const group = channelGroup(channel);
      if (group?.some((c) => frame[c] !== undefined)) {
        (next as unknown as Record<string, unknown>)[channel] = NEUTRAL[channel];
      }
    }
    return next;
  });

  const tracks = new Map<MotionChannel, TrackPoint[]>();
  for (const channel of used) {
    const toValue = (v: number | MotionLength) =>
      LENGTH_CHANNELS.has(channel) ? parseLength(v as MotionLength) : (v as number);
    const points: TrackPoint[] = filled
      .filter((f) => f[channel] !== undefined)
      .map((f) => ({ offset: f.offset, value: toValue(f[channel]!), easing: easingAt(f.offset) }));

    if (points[0]!.offset > 0) {
      const underlying = channel === 'opacity' ? (hiddenBeforeStart ? 0 : 1) : NEUTRAL[channel];
      points.unshift({ offset: 0, value: toValue(underlying), easing: easingAt(0) });
    }
    const last = points[points.length - 1]!;
    if (last.offset < 1) points.push({ offset: 1, value: last.value, easing: last.easing });
    tracks.set(channel, points);
  }

  const compiled: CompiledKeyframes = {
    tracks,
    hiddenBeforeStart,
    styleContext: { used, perspective: preset.perspective, transformOrigin: preset.transformOrigin },
  };
  byEasing.set(key, compiled);
  return compiled;
}

function lerpValue(a: number | Length, b: number | Length, t: number): number | string {
  if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * t;
  const la = typeof a === 'number' ? { value: a, unit: 'px' } : a;
  const lb = typeof b === 'number' ? { value: b, unit: 'px' } : b;
  if (la.unit === lb.unit || la.value === 0 || lb.value === 0) {
    const unit = la.value === 0 ? lb.unit : la.unit;
    return `${num(la.value + (lb.value - la.value) * t)}${unit}`;
  }
  return `calc(${num(la.value * (1 - t))}${la.unit} + ${num(lb.value * t)}${lb.unit})`;
}

function sampleTrack(points: TrackPoint[], p: number): number | string {
  const clamped = Math.min(1, Math.max(0, p));
  let i = 0;
  while (i < points.length - 2 && clamped > points[i + 1]!.offset) i++;
  const a = points[i]!;
  const b = points[i + 1] ?? a;
  const span = b.offset - a.offset;
  const local = span > 0 ? (clamped - a.offset) / span : 1;
  return lerpValue(a.value, b.value, a.easing(local));
}

/** p: 단위 로컬 진행도 (0 미만 = 시작 전, 1 이상 = 종료 후) */
export function sampleKeyframes(compiled: CompiledKeyframes, p: number): MotionStyle {
  const values: ChannelValues = {};
  for (const [channel, points] of compiled.tracks) values[channel] = sampleTrack(points, p);
  if (p < 0 && compiled.hiddenBeforeStart) values.opacity = 0;
  return composeStyle(values, compiled.styleContext);
}
