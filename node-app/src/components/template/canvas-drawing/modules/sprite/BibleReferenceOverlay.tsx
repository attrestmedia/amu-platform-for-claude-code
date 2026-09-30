"use client";

import type { NormalizedFrameGuide } from "../../CanvasDrawingTypes";

export function BibleReferenceOverlay({
  bibleSourceUrl,
  bibleDirections,
  direction,
  guide,
  row,
  frame,
}: {
  bibleSourceUrl: string;
  bibleDirections: string[];
  direction: string;
  guide: NormalizedFrameGuide;
  row: number;
  frame: number;
}) {
  const bibleColumn = bibleDirections.indexOf(direction);
  if (!bibleSourceUrl || bibleColumn < 0 || bibleDirections.length === 0) return null;

  const columns = Math.max(1, Math.floor(Number(guide.columns) || 1));
  const rows = Math.max(1, Math.floor(Number(guide.rows) || 1));
  const activeRow = Math.min(rows - 1, Math.max(0, row));
  const activeFrame = Math.min(columns - 1, Math.max(0, frame));

  return (
    <div data-export-ignore="true" className="pointer-events-none absolute inset-0 z-[21]" aria-hidden>
      <div
        className="absolute overflow-hidden border border-cyan-400/80 bg-cyan-300/5"
        style={{
          left: `${(activeFrame / columns) * 100}%`,
          top: `${(activeRow / rows) * 100}%`,
          width: `${100 / columns}%`,
          height: `${100 / rows}%`,
        }}
      >
        {/* 바이블은 private signed URL일 수 있어 편집 세션 URL을 그대로 표시한다. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={bibleSourceUrl}
          alt=""
          draggable={false}
          className="absolute max-w-none select-none object-fill"
          style={{
            width: `${bibleDirections.length * 100}%`,
            height: "100%",
            left: `${-bibleColumn * 100}%`,
            top: 0,
            opacity: 0.28,
            imageRendering: "pixelated",
          }}
        />
      </div>
    </div>
  );
}
