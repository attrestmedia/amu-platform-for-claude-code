import { AMU_TEXT_MOTION_TOKENS } from './tokens';
import type { MotionChannel, MotionStyle } from './types';

/**
 * 채널 값 → CSS 스타일 합성 (모든 키프레임 프리셋 공통).
 * 한 프리셋이 사용하는 채널 집합(ChannelUsage)을 기준으로 항상 같은 CSS 키를 출력해
 * 프레임 간 잔여 스타일이 남지 않게 한다.
 */

export type ChannelValues = Partial<Record<MotionChannel, number | string>>;

export const TRANSFORM_CHANNELS = [
  'x',
  'y',
  'z',
  'scale',
  'scaleX',
  'scaleY',
  'rotate',
  'rotateX',
  'rotateY',
  'rotateXYZ',
  'skewX',
  'skewY',
] as const satisfies readonly MotionChannel[];

export const FILTER_CHANNELS = ['blur'] as const satisfies readonly MotionChannel[];

export const SHADOW_CHANNELS = [
  'glowSize',
  'glowAlpha',
  'neon',
  'rgbSplit',
  'shadowY',
  'shadowBlur',
  'shadowAlpha',
  'extrude',
] as const satisfies readonly MotionChannel[];

export const INDEPENDENT_CHANNELS = ['opacity', 'letterSpacing', 'fill', 'stroke'] as const satisfies readonly MotionChannel[];

export const ALL_CHANNELS: readonly MotionChannel[] = [
  ...INDEPENDENT_CHANNELS,
  ...TRANSFORM_CHANNELS,
  ...FILTER_CHANNELS,
  ...SHADOW_CHANNELS,
];

/** 채널 그룹 (CSS 속성 1개 = 그룹 1개) */
export function channelGroup(channel: MotionChannel): MotionChannel[] | null {
  if ((TRANSFORM_CHANNELS as readonly MotionChannel[]).includes(channel)) return [...TRANSFORM_CHANNELS];
  if ((FILTER_CHANNELS as readonly MotionChannel[]).includes(channel)) return [...FILTER_CHANNELS];
  if ((SHADOW_CHANNELS as readonly MotionChannel[]).includes(channel)) return [...SHADOW_CHANNELS];
  return null;
}

/** 채널 중립값 (애니메이션이 끝났을 때의 "원래 모습") */
export const NEUTRAL: Record<MotionChannel, number> = {
  opacity: 1,
  letterSpacing: 0,
  fill: 1,
  stroke: 0,
  x: 0,
  y: 0,
  z: 0,
  scale: 1,
  scaleX: 1,
  scaleY: 1,
  rotate: 0,
  rotateX: 0,
  rotateY: 0,
  rotateXYZ: 0,
  skewX: 0,
  skewY: 0,
  blur: 0,
  glowSize: 0,
  glowAlpha: 0,
  neon: 0,
  rgbSplit: 0,
  shadowY: 0,
  shadowBlur: 0,
  shadowAlpha: 0,
  extrude: 0,
};

export interface StyleContext {
  used: ReadonlySet<MotionChannel>;
  perspective?: number;
  transformOrigin?: string;
}

export const num = (value: number) => {
  const rounded = Math.round(value * 10000) / 10000;
  return Object.is(rounded, -0) ? '0' : String(rounded);
};

const pct = (alpha: number) => `${num(Math.min(1, Math.max(0, alpha)) * 100)}%`;

export const mixColor = (color: string, alpha: number) =>
  alpha >= 1 ? color : `color-mix(in srgb, ${color} ${pct(alpha)}, transparent)`;

const len = (value: number | string | undefined) =>
  value === undefined ? '0px' : typeof value === 'number' ? `${num(value)}px` : value;

const n = (values: ChannelValues, channel: MotionChannel) => {
  const value = values[channel];
  return typeof value === 'number' ? value : NEUTRAL[channel];
};

const has = (ctx: StyleContext, ...channels: MotionChannel[]) => channels.some((c) => ctx.used.has(c));

export function composeStyle(values: ChannelValues, ctx: StyleContext): MotionStyle {
  const style: MotionStyle = { opacity: num(n(values, 'opacity')) };

  // transform
  const transforms: string[] = [];
  if (ctx.perspective) transforms.push(`perspective(${num(ctx.perspective)}px)`);
  if (has(ctx, 'x', 'y', 'z')) {
    transforms.push(`translate3d(${len(values.x)}, ${len(values.y)}, ${num(n(values, 'z'))}px)`);
  }
  if (has(ctx, 'rotate')) transforms.push(`rotate(${num(n(values, 'rotate'))}deg)`);
  if (has(ctx, 'rotateX')) transforms.push(`rotateX(${num(n(values, 'rotateX'))}deg)`);
  if (has(ctx, 'rotateY')) transforms.push(`rotateY(${num(n(values, 'rotateY'))}deg)`);
  if (has(ctx, 'rotateXYZ')) transforms.push(`rotate3d(1, 1, 1, ${num(n(values, 'rotateXYZ'))}deg)`);
  if (has(ctx, 'skewX', 'skewY')) {
    transforms.push(`skew(${num(n(values, 'skewX'))}deg, ${num(n(values, 'skewY'))}deg)`);
  }
  if (has(ctx, 'scale', 'scaleX', 'scaleY')) {
    const s = n(values, 'scale');
    transforms.push(`scale(${num(s * n(values, 'scaleX'))}, ${num(s * n(values, 'scaleY'))})`);
  }
  if (transforms.length) style.transform = transforms.join(' ');
  if (ctx.transformOrigin) style['transform-origin'] = ctx.transformOrigin;

  // filter
  if (has(ctx, 'blur')) style.filter = `blur(${num(Math.max(0, n(values, 'blur')))}px)`;

  // text-shadow
  const shadows: string[] = [];
  const { color } = AMU_TEXT_MOTION_TOKENS;
  if (has(ctx, 'glowSize', 'glowAlpha')) {
    shadows.push(`0 0 ${num(n(values, 'glowSize'))}px ${mixColor('currentColor', n(values, 'glowAlpha'))}`);
  }
  if (has(ctx, 'neon')) {
    const k = Math.max(0, n(values, 'neon'));
    shadows.push(
      `0 0 ${num(5 * k)}px currentColor`,
      `0 0 ${num(10 * k)}px currentColor`,
      `0 0 ${num(20 * k)}px ${color.accent}`,
    );
  }
  if (has(ctx, 'rgbSplit')) {
    const d = n(values, 'rgbSplit');
    shadows.push(`${num(d)}px 0 0 ${color.splitA}`, `${num(-d)}px 0 0 ${color.splitB}`);
  }
  if (has(ctx, 'shadowY', 'shadowBlur', 'shadowAlpha')) {
    shadows.push(
      `0 ${num(n(values, 'shadowY'))}px ${num(Math.max(0, n(values, 'shadowBlur')))}px ${mixColor('currentColor', n(values, 'shadowAlpha'))}`,
    );
  }
  if (has(ctx, 'extrude')) {
    const e = n(values, 'extrude');
    for (let i = 1; i <= 4; i++) shadows.push(`${num((e * i) / 4)}px ${num((e * i) / 4)}px 0 ${color.extrude}`);
  }
  if (shadows.length) style['text-shadow'] = shadows.join(', ');

  // 독립 채널
  // letterSpacing 은 기준 트래킹(--amu-text-motion-tracking)에 더해지는 증분(em)
  if (has(ctx, 'letterSpacing')) {
    style['letter-spacing'] = `calc(var(--amu-text-motion-tracking, 0em) + ${num(n(values, 'letterSpacing'))}em)`;
  }
  if (has(ctx, 'fill')) style['-webkit-text-fill-color'] = mixColor('currentColor', n(values, 'fill'));
  if (has(ctx, 'stroke')) style['-webkit-text-stroke'] = `${num(Math.max(0, n(values, 'stroke')))}px currentColor`;

  return style;
}
