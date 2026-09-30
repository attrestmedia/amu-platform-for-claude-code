"use client";

import { useRef } from "react";

export function useSnapGuides() {
  const guidesRef = useRef<{ v: number[]; h: number[] }>({ v: [], h: [] });

  const clearGuides = () => {
    guidesRef.current = { v: [], h: [] };
  };

  const snapValue = (value: number, candidates: number[], threshold: number) => {
    let best: { delta: number; guide: number } | null = null;
    for (const c of candidates) {
      const d = c - value;
      if (Math.abs(d) <= threshold && (!best || Math.abs(d) < Math.abs(best.delta))) best = { delta: d, guide: c };
    }
    return best;
  };

  const snapRectMove = (
    b: { left: number; right: number; top: number; bottom: number },
    xs: number[],
    ys: number[],
    threshold: number
  ) => {
    const cx = (b.left + b.right) / 2;
    const cy = (b.top + b.bottom) / 2;

    const sx =
      [snapValue(b.left, xs, threshold), snapValue(b.right, xs, threshold), snapValue(cx, xs, threshold)]
        .filter(Boolean)
        .sort((a, bb) => Math.abs(a!.delta) - Math.abs(bb!.delta))[0] || null;

    const sy =
      [snapValue(b.top, ys, threshold), snapValue(b.bottom, ys, threshold), snapValue(cy, ys, threshold)]
        .filter(Boolean)
        .sort((a, bb) => Math.abs(a!.delta) - Math.abs(bb!.delta))[0] || null;

    guidesRef.current = { v: sx ? [sx.guide] : [], h: sy ? [sy.guide] : [] };
    return { dx: sx ? sx.delta : 0, dy: sy ? sy.delta : 0 };
  };

  const snapPointMove = (p: { x: number; y: number }, xs: number[], ys: number[], threshold: number) => {
    const sx = snapValue(p.x, xs, threshold);
    const sy = snapValue(p.y, ys, threshold);
    guidesRef.current = { v: sx ? [sx.guide] : [], h: sy ? [sy.guide] : [] };
    return { dx: sx ? sx.delta : 0, dy: sy ? sy.delta : 0 };
  };

  return { guidesRef, clearGuides, snapRectMove, snapPointMove };
}
