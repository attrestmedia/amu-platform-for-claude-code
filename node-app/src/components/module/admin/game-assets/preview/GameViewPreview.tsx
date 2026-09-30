"use client";

import { useMemo } from "react";
import { Lang } from "components/module/i18n";
import { cn } from "utils/common";

/**
 * @docHint
 * @purpose 발행 전 게임 뷰 미리보기 — footprint iso 그리드 오버레이 + 에셋 이미지 + 캐릭터 스케일 대비 (SVG, Pixi 무의존)
 * @process footprint(타일)로 2:1 다이아몬드 그리드 산출  에셋 이미지 하단 정렬 합성  256px 캐릭터 실루엣 병렬 표시
 * @domain game.asset
 * @scope admin-client
 */

// 2:1 iso 타일 기준 px (에셋 계약 v2 §4.5 — 128x64 배수)
const ISO_TILE_WIDTH = 128;
const ISO_TILE_HEIGHT = 64;
// 캐릭터 셀 256px — 타일 대비 스케일 참조 (시트 계약 셀 크기)
const CHARACTER_CELL_PX = 256;
const PREVIEW_MAX_IMAGE_HEIGHT = 320;

function buildDiamondPoints(col: number, row: number, originX: number, originY: number) {
  const cx = originX + ((col - row) * ISO_TILE_WIDTH) / 2;
  const cy = originY + ((col + row) * ISO_TILE_HEIGHT) / 2;
  return [
    `${cx},${cy - ISO_TILE_HEIGHT / 2}`,
    `${cx + ISO_TILE_WIDTH / 2},${cy}`,
    `${cx},${cy + ISO_TILE_HEIGHT / 2}`,
    `${cx - ISO_TILE_WIDTH / 2},${cy}`,
  ].join(" ");
}

export function GameViewPreview({
  imageUrl,
  footprintWidth,
  footprintHeight,
  className,
}: {
  imageUrl: string;
  footprintWidth: number;
  footprintHeight: number;
  className?: string;
}) {
  const fw = Math.max(1, Math.min(12, Math.floor(footprintWidth || 1)));
  const fh = Math.max(1, Math.min(12, Math.floor(footprintHeight || 1)));

  const layout = useMemo(() => {
    const gridWidth = ((fw + fh) * ISO_TILE_WIDTH) / 2;
    const gridHeight = ((fw + fh) * ISO_TILE_HEIGHT) / 2;
    const imageHeight = Math.min(PREVIEW_MAX_IMAGE_HEIGHT, Math.max(CHARACTER_CELL_PX, gridWidth * 0.9));
    const width = gridWidth + ISO_TILE_WIDTH;
    const height = imageHeight + gridHeight + ISO_TILE_HEIGHT;
    // 그리드 원점: 이미지 영역 아래, (0,0) 타일 중심
    const originX = width / 2 - ((fw - fh) * ISO_TILE_WIDTH) / 4;
    const originY = imageHeight + ISO_TILE_HEIGHT / 2;
    return { width, height, imageHeight, gridWidth, originX, originY };
  }, [fw, fh]);

  if (!imageUrl) return null;

  const cells: Array<{ col: number; row: number }> = [];
  for (let row = 0; row < fh; row += 1) {
    for (let col = 0; col < fw; col += 1) {
      cells.push({ col, row });
    }
  }

  return (
    <div className={cn("rounded-lg border border-border bg-surface p-3", className)}>
      <p className="mb-2 text-xs text-muted-foreground">
        <Lang
          text={{
            ko: `게임 뷰 미리보기 — footprint ${fw}x${fh} 타일 (2:1 iso), 우측은 캐릭터(셀 256px) 스케일 대비`,
            en: `Game view preview — footprint ${fw}x${fh} tiles (2:1 iso); right side shows character (256px cell) scale`,
          }}
        />
      </p>
      <div className="flex items-end gap-4 overflow-x-auto">
        <svg
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          className="h-56 w-auto shrink-0"
          role="img"
          aria-label={`footprint ${fw}x${fh} preview`}
        >
          <image
            href={imageUrl}
            x={layout.width / 2 - layout.gridWidth / 2}
            y={0}
            width={layout.gridWidth}
            height={layout.imageHeight}
            preserveAspectRatio="xMidYMax meet"
          />
          {cells.map(({ col, row }) => (
            <polygon
              key={`${col}-${row}`}
              points={buildDiamondPoints(col, row, layout.originX, layout.originY)}
              className="fill-primary/10 stroke-primary/60"
              strokeWidth={2}
            />
          ))}
        </svg>
        <svg viewBox={`0 0 ${ISO_TILE_WIDTH * 1.5} ${CHARACTER_CELL_PX + ISO_TILE_HEIGHT}`} className="h-40 w-auto shrink-0">
          <ellipse
            cx={ISO_TILE_WIDTH * 0.75}
            cy={CHARACTER_CELL_PX + ISO_TILE_HEIGHT / 2 - 8}
            rx={ISO_TILE_WIDTH / 2}
            ry={ISO_TILE_HEIGHT / 2}
            className="fill-muted stroke-border"
            strokeWidth={2}
          />
          <rect
            x={ISO_TILE_WIDTH * 0.75 - 36}
            y={ISO_TILE_HEIGHT / 2}
            width={72}
            height={CHARACTER_CELL_PX - 24}
            rx={36}
            className="fill-secondary/30 stroke-secondary/70"
            strokeWidth={2}
          />
        </svg>
      </div>
    </div>
  );
}
