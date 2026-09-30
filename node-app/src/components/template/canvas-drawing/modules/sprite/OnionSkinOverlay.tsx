"use client";

import type { NormalizedFrameGuide } from "../../CanvasDrawingTypes";

export function OnionSkinOverlay({
  imageSrc,
  guide,
  row,
  frame,
}: {
  imageSrc: string;
  guide: NormalizedFrameGuide;
  row: number;
  frame: number;
}) {
  const columns = Math.max(1, Math.floor(Number(guide.columns) || 1));
  const rows = Math.max(1, Math.floor(Number(guide.rows) || 1));
  if (!imageSrc || columns < 2) return null;

  const activeRow = Math.min(rows - 1, Math.max(0, row));
  const activeFrame = Math.min(columns - 1, Math.max(0, frame));
  const neighbours = [
    { key: "previous", sourceFrame: (activeFrame - 1 + columns) % columns, opacity: 0.24 },
    { key: "next", sourceFrame: (activeFrame + 1) % columns, opacity: 0.18 },
  ];

  return (
    <div data-export-ignore="true" className="pointer-events-none absolute inset-0 z-20" aria-hidden>
      <div
        className="absolute overflow-hidden border border-amber-400/80 bg-amber-300/5"
        style={{
          left: `${(activeFrame / columns) * 100}%`,
          top: `${(activeRow / rows) * 100}%`,
          width: `${100 / columns}%`,
          height: `${100 / rows}%`,
        }}
      >
        {neighbours.map((neighbour) => (
          // 후보정 원본은 data/blob/R2 URL을 모두 즉시 표시해야 하므로 Next Image를 사용하지 않는다.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={neighbour.key}
            src={imageSrc}
            alt=""
            draggable={false}
            className="absolute max-w-none select-none object-fill"
            style={{
              width: `${columns * 100}%`,
              height: `${rows * 100}%`,
              left: `${-neighbour.sourceFrame * 100}%`,
              top: `${-activeRow * 100}%`,
              opacity: neighbour.opacity,
              imageRendering: "pixelated",
            }}
          />
        ))}
      </div>
    </div>
  );
}
