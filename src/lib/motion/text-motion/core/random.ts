/**
 * 결정적 난수. Math.random() 대신 사용해 웹/영상 렌더 결과가 항상 같도록 한다.
 */

/** (seed, a, b) → 0..1 */
export function hash01(seed: number, a: number, b = 0): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (a + 0x7f4a7c15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13) ^ (b + 0x165667b1), 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h / 4294967296;
}

/** 시드 기반 순열 (Fisher–Yates) */
export function seededPermutation(length: number, seed: number): number[] {
  const order = Array.from({ length }, (_, i) => i);
  for (let i = length - 1; i > 0; i--) {
    const j = Math.floor(hash01(seed, i, 0x51) * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order;
}
