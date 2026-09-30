"use client";

import type { SpriteFrameAnalysis } from "./spriteFrameProcessing";

export function AnchorAlignmentTool({ analysis }: { analysis: SpriteFrameAnalysis }) {
  const scale = Math.max(1, analysis.width / 1024);
  return (
    <svg
      data-export-ignore="true"
      className="pointer-events-none absolute inset-0 z-[35] h-full w-full"
      viewBox={`0 0 ${analysis.width} ${analysis.height}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      {analysis.frames.map((frame) => {
        if (!frame.bounds) return null;
        const cellX = frame.column * analysis.cellWidth;
        const cellY = frame.row * analysis.cellHeight;
        const pivotX = cellX + frame.pivotX;
        const pivotY = cellY + frame.pivotY;
        const targetX = cellX + analysis.targetAnchorX * analysis.cellWidth;
        const targetY = cellY + analysis.targetAnchorY * analysis.cellHeight;
        const warning = frame.driftPx > 2;
        return (
          <g key={frame.index} className={warning ? "text-amber-400" : "text-emerald-400"}>
            <rect
              x={cellX + frame.bounds.x}
              y={cellY + frame.bounds.y}
              width={frame.bounds.width}
              height={frame.bounds.height}
              fill="none"
              stroke="currentColor"
              strokeWidth={scale}
              strokeDasharray={`${4 * scale} ${3 * scale}`}
            />
            <line
              x1={pivotX}
              y1={pivotY}
              x2={targetX}
              y2={targetY}
              stroke="currentColor"
              strokeWidth={1.5 * scale}
            />
            <circle cx={pivotX} cy={pivotY} r={3.5 * scale} fill="currentColor" />
            <circle
              cx={targetX}
              cy={targetY}
              r={4.5 * scale}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5 * scale}
            />
          </g>
        );
      })}
    </svg>
  );
}
