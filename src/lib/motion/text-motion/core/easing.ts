import { AMU_EASINGS } from './tokens';
import type { CubicBezier, MotionEasing } from './types';

export type EasingFn = (t: number) => number;

const cache = new Map<string, EasingFn>();

/** CSS cubic-bezier 와 동일한 곡선 (Newton-Raphson + 이분법) */
function createCubicBezier([x1, y1, x2, y2]: CubicBezier): EasingFn {
  if (x1 === y1 && x2 === y2) return (t) => t;

  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const sampleDX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;

  const solveX = (x: number) => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = sampleX(t) - x;
      if (Math.abs(err) < 1e-6) return t;
      const d = sampleDX(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    let lo = 0;
    let hi = 1;
    t = x;
    while (lo < hi) {
      const v = sampleX(t);
      if (Math.abs(v - x) < 1e-6) return t;
      if (x > v) lo = t;
      else hi = t;
      if (hi - lo < 1e-7) break;
      t = (lo + hi) / 2;
    }
    return t;
  };

  return (t) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return sampleY(solveX(t));
  };
}

export function resolveEasing(easing: MotionEasing): EasingFn {
  const curve = typeof easing === 'string' ? AMU_EASINGS[easing] : easing;
  const key = curve.join(',');
  let fn = cache.get(key);
  if (!fn) {
    fn = createCubicBezier(curve);
    cache.set(key, fn);
  }
  return fn;
}

export function isMotionEasing(value: unknown): value is MotionEasing {
  if (typeof value === 'string') return value in AMU_EASINGS;
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every((v) => typeof v === 'number' && Number.isFinite(v)) &&
    value[0] >= 0 &&
    value[0] <= 1 &&
    value[2] >= 0 &&
    value[2] <= 1
  );
}
