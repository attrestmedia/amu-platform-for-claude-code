import type { NormalizedFrameGuide } from "../../CanvasDrawingTypes";

const DEFAULT_ALPHA_THRESHOLD = 8;

export type SpriteFrameBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SpriteFrameMetric = {
  index: number;
  row: number;
  column: number;
  empty: boolean;
  bounds: SpriteFrameBounds | null;
  pivotX: number;
  pivotY: number;
  driftX: number;
  driftY: number;
  driftPx: number;
};

export type SpriteFrameAnalysis = {
  width: number;
  height: number;
  columns: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
  targetAnchorX: number;
  targetAnchorY: number;
  nonEmptyFrames: number;
  emptyFrames: number;
  meanDriftPx: number;
  maxDriftPx: number;
  frames: SpriteFrameMetric[];
};

export type SpritePixelSource = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};

type SpriteAnchorTarget = {
  x: number;
  y: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeGuide(guide: NormalizedFrameGuide) {
  return {
    columns: clamp(Math.floor(Number(guide.columns) || 1), 1, 32),
    rows: clamp(Math.floor(Number(guide.rows) || 1), 1, 32),
    anchorX: clamp(Number(guide.anchorX ?? 0.5), 0, 1),
    anchorY: clamp(Number(guide.anchorY ?? 0.88), 0, 1),
  };
}

function getCellBounds(args: {
  width: number;
  height: number;
  columns: number;
  rows: number;
  column: number;
  row: number;
}) {
  const x = Math.floor((args.column * args.width) / args.columns);
  const y = Math.floor((args.row * args.height) / args.rows);
  const right = Math.floor(((args.column + 1) * args.width) / args.columns);
  const bottom = Math.floor(((args.row + 1) * args.height) / args.rows);
  return { x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) };
}

function readAlphaBounds(
  source: SpritePixelSource,
  cell: { x: number; y: number; width: number; height: number },
  alphaThreshold: number,
): SpriteFrameBounds | null {
  let minX = cell.width;
  let minY = cell.height;
  let maxX = -1;
  let maxY = -1;

  for (let localY = 0; localY < cell.height; localY += 1) {
    const sourceY = cell.y + localY;
    for (let localX = 0; localX < cell.width; localX += 1) {
      const sourceX = cell.x + localX;
      const alpha = source.data[(sourceY * source.width + sourceX) * 4 + 3] || 0;
      if (alpha <= alphaThreshold) continue;
      minX = Math.min(minX, localX);
      minY = Math.min(minY, localY);
      maxX = Math.max(maxX, localX);
      maxY = Math.max(maxY, localY);
    }
  }

  if (maxX < minX || maxY < minY) return null;
  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

function buildAnalysis(
  source: SpritePixelSource,
  guide: NormalizedFrameGuide,
  target: SpriteAnchorTarget,
  alphaThreshold: number,
): SpriteFrameAnalysis {
  const { columns, rows } = normalizeGuide(guide);
  const frames: SpriteFrameMetric[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const index = row * columns + column;
      const cell = getCellBounds({ width: source.width, height: source.height, columns, rows, column, row });
      const bounds = readAlphaBounds(source, cell, alphaThreshold);
      if (!bounds) {
        frames.push({
          index,
          row,
          column,
          empty: true,
          bounds: null,
          pivotX: target.x * cell.width,
          pivotY: target.y * cell.height,
          driftX: 0,
          driftY: 0,
          driftPx: 0,
        });
        continue;
      }

      const pivotX = bounds.x + bounds.width / 2;
      const pivotY = bounds.y + bounds.height;
      const driftX = pivotX - target.x * cell.width;
      const driftY = pivotY - target.y * cell.height;
      frames.push({
        index,
        row,
        column,
        empty: false,
        bounds,
        pivotX,
        pivotY,
        driftX,
        driftY,
        driftPx: Math.hypot(driftX, driftY),
      });
    }
  }

  const nonEmpty = frames.filter((frame) => !frame.empty);
  const driftSum = nonEmpty.reduce((sum, frame) => sum + frame.driftPx, 0);
  return {
    width: source.width,
    height: source.height,
    columns,
    rows,
    cellWidth: source.width / columns,
    cellHeight: source.height / rows,
    targetAnchorX: target.x,
    targetAnchorY: target.y,
    nonEmptyFrames: nonEmpty.length,
    emptyFrames: frames.length - nonEmpty.length,
    meanDriftPx: nonEmpty.length > 0 ? driftSum / nonEmpty.length : 0,
    maxDriftPx: nonEmpty.reduce((max, frame) => Math.max(max, frame.driftPx), 0),
    frames,
  };
}

export function analyzeSpriteFramePixels(
  source: SpritePixelSource,
  guide: NormalizedFrameGuide,
  options?: { alphaThreshold?: number; targetAnchor?: SpriteAnchorTarget },
) {
  const normalized = normalizeGuide(guide);
  const target = options?.targetAnchor || { x: normalized.anchorX, y: normalized.anchorY };
  return buildAnalysis(
    source,
    guide,
    { x: clamp(target.x, 0, 1), y: clamp(target.y, 0, 1) },
    clamp(Math.floor(options?.alphaThreshold ?? DEFAULT_ALPHA_THRESHOLD), 0, 254),
  );
}

export function retargetSpriteFrameAnalysis(analysis: SpriteFrameAnalysis, targetAnchor: SpriteAnchorTarget) {
  const target = { x: clamp(targetAnchor.x, 0, 1), y: clamp(targetAnchor.y, 0, 1) };
  const frames = analysis.frames.map((frame) => {
    if (frame.empty) return frame;
    const driftX = frame.pivotX - target.x * analysis.cellWidth;
    const driftY = frame.pivotY - target.y * analysis.cellHeight;
    return { ...frame, driftX, driftY, driftPx: Math.hypot(driftX, driftY) };
  });
  const nonEmpty = frames.filter((frame) => !frame.empty);
  return {
    ...analysis,
    targetAnchorX: target.x,
    targetAnchorY: target.y,
    meanDriftPx: nonEmpty.length
      ? nonEmpty.reduce((sum, frame) => sum + frame.driftPx, 0) / nonEmpty.length
      : 0,
    maxDriftPx: nonEmpty.reduce((max, frame) => Math.max(max, frame.driftPx), 0),
    frames,
  };
}

export function normalizeSpriteFramePixels(
  source: SpritePixelSource,
  guide: NormalizedFrameGuide,
  options?: { alphaThreshold?: number; targetAnchor?: SpriteAnchorTarget },
) {
  const before = analyzeSpriteFramePixels(source, guide, options);
  const output = new Uint8ClampedArray(source.data);
  let changedFrames = 0;

  for (const frame of before.frames) {
    if (!frame.bounds) continue;
    const cell = getCellBounds({
      width: source.width,
      height: source.height,
      columns: before.columns,
      rows: before.rows,
      column: frame.column,
      row: frame.row,
    });
    const requestedDx = Math.round(before.targetAnchorX * cell.width - frame.pivotX);
    const requestedDy = Math.round(before.targetAnchorY * cell.height - frame.pivotY);
    const dx = clamp(requestedDx, -frame.bounds.x, cell.width - frame.bounds.x - frame.bounds.width);
    const dy = clamp(requestedDy, -frame.bounds.y, cell.height - frame.bounds.y - frame.bounds.height);
    if (dx !== 0 || dy !== 0) changedFrames += 1;

    for (let localY = 0; localY < cell.height; localY += 1) {
      const rowOffset = ((cell.y + localY) * source.width + cell.x) * 4;
      output.fill(0, rowOffset, rowOffset + cell.width * 4);
    }

    for (let localY = 0; localY < frame.bounds.height; localY += 1) {
      for (let localX = 0; localX < frame.bounds.width; localX += 1) {
        const sourceX: number = cell.x + frame.bounds.x + localX;
        const sourceY: number = cell.y + frame.bounds.y + localY;
        const targetX: number = sourceX + dx;
        const targetY: number = sourceY + dy;
        const sourceOffset = (sourceY * source.width + sourceX) * 4;
        const targetOffset = (targetY * source.width + targetX) * 4;
        output[targetOffset] = source.data[sourceOffset];
        output[targetOffset + 1] = source.data[sourceOffset + 1];
        output[targetOffset + 2] = source.data[sourceOffset + 2];
        output[targetOffset + 3] = source.data[sourceOffset + 3];
      }
    }
  }

  const after = analyzeSpriteFramePixels({ ...source, data: output }, guide, options);
  return { data: output, width: source.width, height: source.height, before, after, changedFrames };
}
