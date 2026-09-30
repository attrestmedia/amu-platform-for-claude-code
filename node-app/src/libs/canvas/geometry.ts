/** Shared leaf geometry helpers used by Drawing and CardNews surfaces. */

export function canvasDrawingClamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function canvasDrawingDist(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
