"use client";

import { useMemo } from "react";
import type { NormalizedFrameGuide } from "../CanvasDrawingTypes";

function clamp(value: number | undefined, fallback: number, min = 0, max = 1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

export function NormalizedFrameGuideOverlay({ guide }: { guide: NormalizedFrameGuide }) {
  const columns = Math.min(32, Math.max(1, Math.floor(Number(guide.columns) || 1)));
  const rows = Math.min(32, Math.max(1, Math.floor(Number(guide.rows) || 1)));
  const anchorX = clamp(guide.anchorX, 0.5);
  const anchorY = clamp(guide.anchorY, 0.88);
  const safeAreaInset = clamp(guide.safeAreaInset, 0.08, 0, 0.45);
  const cells = useMemo(() => Array.from({ length: columns * rows }, (_, index) => index), [columns, rows]);

  return (
    <div
      data-export-ignore="true"
      className="pointer-events-none absolute inset-0 z-30 grid"
      style={{
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
      }}
      aria-hidden
    >
      {cells.map((index) => (
        <div
          key={index}
          className={`relative border-b border-r border-sky-400/70 ${index < columns ? "border-t" : ""} ${index % columns === 0 ? "border-l" : ""}`}
        >
          <div
            className="absolute border border-dashed border-sky-300/45"
            style={{ inset: `${safeAreaInset * 100}%` }}
          />
          <span
            className="absolute h-px w-full bg-rose-400/70"
            style={{ left: 0, top: `${anchorY * 100}%` }}
          />
          <span
            className="absolute h-full w-px bg-sky-300/55"
            style={{ left: `${anchorX * 100}%`, top: 0 }}
          />
          <span
            className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-rose-500 shadow-sm"
            style={{ left: `${anchorX * 100}%`, top: `${anchorY * 100}%` }}
          />
          {guide.showFrameNumbers ? (
            <span className="absolute left-1 top-1 rounded bg-slate-950/75 px-1 py-0.5 text-[9px] font-medium leading-none text-white">
              {index + 1}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}
