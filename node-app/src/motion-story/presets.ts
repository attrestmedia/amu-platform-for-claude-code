import { resolveEasing } from "../text-motions/core/easing";
import { cubicBezierCss, MOTION_TOKENS, type CubicBezier, type MotionDurationToken, type MotionEasingToken } from "./tokens";

/**
 * AMU Motion Design System 프리셋 (Entrance · Emphasis · Exit · Camera · Transition).
 *
 * - 프리셋은 CSS 문자열이 아니라 **구조화된 채널 값**으로 정의한다.
 *   같은 정의에서 (1) 순수 샘플러 `samplePreset(key, t)` 와 (2) WAAPI 키프레임 `toWaapiKeyframes(key)` 를 만든다.
 *   → 웹 재생(React), 임의 시점 seek(스크럽·export), 컴포지터 재생(WAAPI) 결과가 같다.
 * - 채널은 opacity · transform(translate/scale) · clip-path · 밑줄(background-size) 뿐이다.
 *   blur·width/height·top/left 계열은 의도적으로 제외했다 (visual-runtime §3).
 * - 이징은 구간(segment)별로 적용한다. WAAPI 도 keyframe.easing 으로 같은 의미를 갖는다.
 */

export type MotionChannels = {
  opacity?: number;
  /** px */
  x?: number;
  /** px */
  y?: number;
  /** 요소 자신의 크기 대비 % (카메라 pan 용) */
  xPct?: number;
  scale?: number;
  /** clip-path inset(top right bottom left) — % */
  clip?: readonly [number, number, number, number];
  /** 0~1, 밑줄 진행률 (background-size) */
  underline?: number;
};

export type MotionPresetCategory = "enter" | "emph" | "exit" | "camera" | "trans";

type PresetKeyframe = MotionChannels & { offset: number };

export type MotionPresetDefinition = {
  category: MotionPresetCategory;
  /** 토큰 키 · "scene"(장면 전체 길이) · 고정 ms */
  duration: MotionDurationToken | "scene" | number;
  easing: MotionEasingToken;
  keyframes: readonly PresetKeyframe[];
  /** number-count 처럼 키프레임으로 표현할 수 없는 프리셋. 값은 전용 순수 함수로 계산한다. */
  counter?: true;
};

const kf = (offset: number, channels: MotionChannels): PresetKeyframe => ({ offset, ...channels });

export const MOTION_PRESETS = {
  // Entrance
  "enter.fade": { category: "enter", duration: "base", easing: "standard", keyframes: [kf(0, { opacity: 0 }), kf(1, { opacity: 1 })] },
  "enter.fade-up": {
    category: "enter",
    duration: "line",
    easing: "standard",
    keyframes: [kf(0, { opacity: 0, y: 12 }), kf(1, { opacity: 1, y: 0 })],
  },
  "enter.scale-in": {
    category: "enter",
    duration: "line",
    easing: "emphasized",
    keyframes: [kf(0, { opacity: 0, scale: 0.96 }), kf(1, { opacity: 1, scale: 1 })],
  },
  "enter.mask-reveal": {
    category: "enter",
    duration: "line",
    easing: "standard",
    keyframes: [kf(0, { clip: [0, 0, 100, 0], y: 8 }), kf(1, { clip: [0, 0, 0, 0], y: 0 })],
  },
  "enter.slide-left": {
    category: "enter",
    duration: "line",
    easing: "standard",
    keyframes: [kf(0, { opacity: 0, x: 24 }), kf(1, { opacity: 1, x: 0 })],
  },
  // Emphasis
  "emph.pulse": {
    category: "emph",
    duration: "slow",
    easing: "standard",
    keyframes: [kf(0, { scale: 1 }), kf(0.5, { scale: 1.04 }), kf(1, { scale: 1 })],
  },
  "emph.underline": {
    category: "emph",
    duration: "slow",
    easing: "standard",
    keyframes: [kf(0, { underline: 0 }), kf(1, { underline: 1 })],
  },
  "emph.number-count": { category: "emph", duration: "count", easing: "standard", keyframes: [kf(0, {}), kf(1, {})], counter: true },
  // Exit
  "exit.fade": { category: "exit", duration: "base", easing: "exit", keyframes: [kf(0, { opacity: 1 }), kf(1, { opacity: 0 })] },
  "exit.slide-up": {
    category: "exit",
    duration: "base",
    easing: "exit",
    keyframes: [kf(0, { opacity: 1, y: 0 }), kf(1, { opacity: 0, y: -12 })],
  },
  // Camera (Ken Burns) — 장면 전체 길이 동안 linear
  "camera.still": { category: "camera", duration: "scene", easing: "linear", keyframes: [kf(0, { scale: 1 }), kf(1, { scale: 1 })] },
  "camera.push": { category: "camera", duration: "scene", easing: "linear", keyframes: [kf(0, { scale: 1 }), kf(1, { scale: 1.08 })] },
  "camera.pull": { category: "camera", duration: "scene", easing: "linear", keyframes: [kf(0, { scale: 1.08 }), kf(1, { scale: 1 })] },
  "camera.pan-left": {
    category: "camera",
    duration: "scene",
    easing: "linear",
    keyframes: [kf(0, { scale: 1.08, xPct: 1.5 }), kf(1, { scale: 1.08, xPct: -1.5 })],
  },
  "camera.pan-right": {
    category: "camera",
    duration: "scene",
    easing: "linear",
    keyframes: [kf(0, { scale: 1.08, xPct: -1.5 }), kf(1, { scale: 1.08, xPct: 1.5 })],
  },
  // Transition (장면 퇴장)
  "trans.cut": { category: "trans", duration: 0, easing: "linear", keyframes: [kf(0, { opacity: 1 }), kf(1, { opacity: 1 })] },
  "trans.fade": { category: "trans", duration: "base", easing: "exit", keyframes: [kf(0, { opacity: 1 }), kf(1, { opacity: 0 })] },
  "trans.wipe": {
    category: "trans",
    duration: "slow",
    easing: "exit",
    keyframes: [kf(0, { clip: [0, 0, 0, 0] }), kf(1, { clip: [0, 100, 0, 0] })],
  },
  "trans.zoom": {
    category: "trans",
    duration: "base",
    easing: "exit",
    keyframes: [kf(0, { opacity: 1, scale: 1 }), kf(1, { opacity: 0, scale: 1.06 })],
  },
} as const satisfies Record<string, MotionPresetDefinition>;

export type MotionPresetKey = keyof typeof MOTION_PRESETS;
export type EnterPresetKey = Extract<MotionPresetKey, `enter.${string}`>;
export type EmphasisPresetKey = Extract<MotionPresetKey, `emph.${string}`>;
export type ExitPresetKey = Extract<MotionPresetKey, `exit.${string}`>;
export type CameraPresetKey = Extract<MotionPresetKey, `camera.${string}`>;
export type TransitionPresetKey = Extract<MotionPresetKey, `trans.${string}`>;

export const MOTION_PRESET_KEYS = Object.keys(MOTION_PRESETS) as MotionPresetKey[];

export function isMotionPresetKey(value: unknown): value is MotionPresetKey {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(MOTION_PRESETS, value);
}

export function isPresetOfCategory(value: unknown, category: MotionPresetCategory): value is MotionPresetKey {
  return isMotionPresetKey(value) && getMotionPreset(value).category === category;
}

export function getMotionPreset(key: MotionPresetKey): MotionPresetDefinition {
  return MOTION_PRESETS[key];
}

/** 프리셋 길이(ms). "scene" 이면 호출자가 넘긴 장면 길이를 쓴다. */
export function getPresetDurationMs(key: MotionPresetKey, sceneDurationMs = 0): number {
  const { duration } = getMotionPreset(key);
  if (typeof duration === "number") return duration;
  if (duration === "scene") return Math.max(0, sceneDurationMs);
  return MOTION_TOKENS.duration[duration];
}

function easingCurve(token: MotionEasingToken): CubicBezier {
  return MOTION_TOKENS.easing[token];
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function channelOf(frame: MotionChannels, key: "opacity" | "x" | "y" | "xPct" | "scale" | "underline"): number | undefined {
  return frame[key];
}

const SCALAR_CHANNELS = ["opacity", "x", "y", "xPct", "scale", "underline"] as const;

function interpolateChannels(a: MotionChannels, b: MotionChannels, t: number): MotionChannels {
  const out: MotionChannels = {};
  for (const key of SCALAR_CHANNELS) {
    const from = channelOf(a, key);
    const to = channelOf(b, key);
    if (from === undefined && to === undefined) continue;
    const start = from ?? to ?? 0;
    const end = to ?? from ?? 0;
    out[key] = lerp(start, end, t);
  }
  if (a.clip || b.clip) {
    const from = a.clip ?? b.clip ?? [0, 0, 0, 0];
    const to = b.clip ?? a.clip ?? [0, 0, 0, 0];
    out.clip = [lerp(from[0], to[0], t), lerp(from[1], to[1], t), lerp(from[2], to[2], t), lerp(from[3], to[3], t)];
  }
  return out;
}

function stripOffset(frame: PresetKeyframe): MotionChannels {
  const { offset: _offset, ...channels } = frame;
  return channels;
}

/**
 * 프리셋을 로컬 시간 `localMs`(프리셋 시작 = 0)에서 샘플링한다. 순수 함수.
 * 시작 전은 첫 키프레임, 끝난 뒤는 마지막 키프레임을 유지한다 (fill: both).
 */
export function samplePreset(key: MotionPresetKey, localMs: number, sceneDurationMs = 0): MotionChannels {
  const preset = getMotionPreset(key);
  const frames = preset.keyframes;
  const first = frames[0];
  const last = frames[frames.length - 1];
  if (!first || !last) return {};
  const duration = getPresetDurationMs(key, sceneDurationMs);
  if (duration <= 0) return stripOffset(localMs < 0 ? first : last);
  const progress = localMs / duration;
  if (progress <= 0) return stripOffset(first);
  if (progress >= 1) return stripOffset(last);

  const ease = resolveEasing(easingCurve(preset.easing) as [number, number, number, number]);
  for (let i = 0; i < frames.length - 1; i++) {
    const a = frames[i];
    const b = frames[i + 1];
    if (!a || !b) continue;
    if (progress >= a.offset && progress <= b.offset) {
      const span = b.offset - a.offset;
      const local = span <= 0 ? 1 : (progress - a.offset) / span;
      return interpolateChannels(a, b, ease(local));
    }
  }
  return stripOffset(last);
}

/** 두 채널 묶음을 합성한다 (같은 요소에 enter + emphasis 가 겹칠 때). opacity·scale 은 곱, 이동은 합. */
export function combineChannels(a: MotionChannels, b: MotionChannels): MotionChannels {
  const out: MotionChannels = { ...a };
  if (b.opacity !== undefined) out.opacity = (a.opacity ?? 1) * b.opacity;
  if (b.scale !== undefined) out.scale = (a.scale ?? 1) * b.scale;
  if (b.x !== undefined) out.x = (a.x ?? 0) + b.x;
  if (b.y !== undefined) out.y = (a.y ?? 0) + b.y;
  if (b.xPct !== undefined) out.xPct = (a.xPct ?? 0) + b.xPct;
  if (b.clip) out.clip = b.clip;
  if (b.underline !== undefined) out.underline = b.underline;
  return out;
}

export type MotionCssStyle = {
  opacity?: string;
  transform?: string;
  clipPath?: string;
  backgroundSize?: string;
};

function fmt(value: number, digits = 4): string {
  const rounded = Number(value.toFixed(digits));
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

/** 채널 → CSS 값 (React style 객체와 WAAPI 키프레임 모두 이 결과를 쓴다). */
export function channelsToCss(channels: MotionChannels): MotionCssStyle {
  const style: MotionCssStyle = {};
  if (channels.opacity !== undefined) style.opacity = fmt(Math.min(1, Math.max(0, channels.opacity)));
  const hasTransform =
    channels.x !== undefined || channels.y !== undefined || channels.xPct !== undefined || channels.scale !== undefined;
  if (hasTransform) {
    const parts: string[] = [];
    if (channels.xPct !== undefined) parts.push(`translateX(${fmt(channels.xPct, 3)}%)`);
    parts.push(`translate(${fmt(channels.x ?? 0, 3)}px, ${fmt(channels.y ?? 0, 3)}px)`);
    parts.push(`scale(${fmt(channels.scale ?? 1)})`);
    style.transform = parts.join(" ");
  }
  if (channels.clip) {
    const [top, right, bottom, left] = channels.clip.map((value) => `${fmt(value, 3)}%`);
    style.clipPath = `inset(${top} ${right} ${bottom} ${left})`;
  }
  if (channels.underline !== undefined) style.backgroundSize = `${fmt(channels.underline * 100, 3)}% 2px`;
  return style;
}

export type WaapiKeyframe = MotionCssStyle & { offset: number; easing?: string };

/**
 * WAAPI 키프레임. `element.animate(toWaapiKeyframes(key), { duration, fill: "both" })` 후
 * `animation.currentTime = t` 로 seek 하면 `samplePreset(key, t)` 와 같은 값이 된다 (Chromium 검증).
 */
export function toWaapiKeyframes(key: MotionPresetKey): WaapiKeyframe[] {
  const preset = getMotionPreset(key);
  const easing = cubicBezierCss(easingCurve(preset.easing));
  return preset.keyframes.map((frame, index) => {
    const css = channelsToCss(stripOffset(frame));
    const isLast = index === preset.keyframes.length - 1;
    return isLast ? { offset: frame.offset, ...css } : { offset: frame.offset, easing, ...css };
  });
}

/**
 * number-count 값 (t 의 순수 함수). 스크린리더에는 최종값만 노출하고 이 값은 시각 표시용으로만 쓴다.
 */
export function sampleNumberCount(from: number, to: number, localMs: number, durationMs = MOTION_TOKENS.duration.count): number {
  if (durationMs <= 0 || localMs >= durationMs) return to;
  if (localMs <= 0) return from;
  const ease = resolveEasing(easingCurve("standard") as [number, number, number, number]);
  return lerp(from, to, ease(localMs / durationMs));
}
