import {
  MOTION_GUIDE_FRAME_COUNT,
  MOTION_GUIDE_VERSION,
  getMotionGuideFrameProgress,
  sampleMotionGuidePose,
  type MotionGuideActionKeyType,
  type MotionGuideFrameCountType,
  type MotionGuidePointType,
  type MotionGuidePoseType,
} from "consts/game/motionGuideSkeletons";
import type { SpriteDirectionType } from "types/game";

const CELL_WIDTH = 256;
const CELL_HEIGHT = 320;
const FIGURE_ORIGIN_Y = 166;
const FIGURE_SCALE = 96;
const BASELINE_Y = 252;

export type RenderMotionGuideArgs = {
  actionKey: MotionGuideActionKeyType;
  direction: SpriteDirectionType;
  version?: number;
  frameCount?: MotionGuideFrameCountType;
};

function toCanvasPoint(point: MotionGuidePointType, cellIndex: number) {
  return {
    x: cellIndex * CELL_WIDTH + CELL_WIDTH / 2 + point.x * FIGURE_SCALE,
    y: FIGURE_ORIGIN_Y + point.y * FIGURE_SCALE,
  };
}

function line(a: MotionGuidePointType, b: MotionGuidePointType, cellIndex: number, width = 8) {
  const start = toCanvasPoint(a, cellIndex);
  const end = toCanvasPoint(b, cellIndex);
  return `<line x1="${start.x.toFixed(2)}" y1="${start.y.toFixed(2)}" x2="${end.x.toFixed(2)}" y2="${end.y.toFixed(2)}" stroke="#1F2937" stroke-width="${width}" stroke-linecap="round" />`;
}

function joint(point: MotionGuidePointType, cellIndex: number, radius = 5) {
  const target = toCanvasPoint(point, cellIndex);
  return `<circle cx="${target.x.toFixed(2)}" cy="${target.y.toFixed(2)}" r="${radius}" fill="#FFFFFF" stroke="#1F2937" stroke-width="3" />`;
}

function renderFigure(pose: MotionGuidePoseType, cellIndex: number) {
  const head = toCanvasPoint(pose.head, cellIndex);
  return [
    line(pose.neck, pose.hip, cellIndex, 12),
    line(pose.shoulderLeft, pose.shoulderRight, cellIndex, 10),
    line(pose.shoulderLeft, pose.handLeft, cellIndex, 8),
    line(pose.shoulderRight, pose.handRight, cellIndex, 8),
    line(pose.hip, pose.kneeLeft, cellIndex, 9),
    line(pose.kneeLeft, pose.footLeft, cellIndex, 9),
    line(pose.hip, pose.kneeRight, cellIndex, 9),
    line(pose.kneeRight, pose.footRight, cellIndex, 9),
    `<circle cx="${head.x.toFixed(2)}" cy="${head.y.toFixed(2)}" r="20" fill="#D1D5DB" stroke="#1F2937" stroke-width="6" />`,
    joint(pose.handLeft, cellIndex),
    joint(pose.handRight, cellIndex),
    joint(pose.kneeLeft, cellIndex),
    joint(pose.kneeRight, cellIndex),
    joint(pose.footLeft, cellIndex, 6),
    joint(pose.footRight, cellIndex, 6),
  ].join("");
}

function renderContactMarker(args: {
  pose: MotionGuidePoseType;
  contactFoot?: "left" | "right" | "both";
  cellIndex: number;
}) {
  const keys =
    args.contactFoot === "both"
      ? ["footLeft", "footRight"]
      : args.contactFoot
        ? [`foot${args.contactFoot === "left" ? "Left" : "Right"}`]
        : [];
  return keys
    .map((key) => {
      const point = toCanvasPoint(args.pose[key as "footLeft" | "footRight"], args.cellIndex);
      return `<ellipse cx="${point.x.toFixed(2)}" cy="${BASELINE_Y}" rx="18" ry="6" fill="#F97316" opacity="0.85" />`;
    })
    .join("");
}

function renderWeaponTrail(pose: MotionGuidePoseType, cellIndex: number, impact: boolean) {
  if (!impact) return "";
  const hand = toCanvasPoint(pose.handRight, cellIndex);
  const left = cellIndex * CELL_WIDTH;
  return `<path d="M ${left + 72} ${hand.y - 44} Q ${left + 142} ${hand.y - 94} ${left + 216} ${hand.y - 18}" fill="none" stroke="#DC2626" stroke-width="8" stroke-linecap="round" stroke-dasharray="10 8" /><circle cx="${hand.x.toFixed(2)}" cy="${hand.y.toFixed(2)}" r="10" fill="#DC2626" opacity="0.85" />`;
}

export function renderMotionGuideSvg(args: RenderMotionGuideArgs) {
  const version = Math.max(1, Math.round(args.version || MOTION_GUIDE_VERSION));
  const frameCount = args.frameCount || MOTION_GUIDE_FRAME_COUNT;
  const width = CELL_WIDTH * frameCount;
  const cells = Array.from({ length: frameCount }, (_, frameIndex) => {
    const progress = getMotionGuideFrameProgress(args.actionKey, frameIndex, frameCount);
    const sampled = sampleMotionGuidePose({ actionKey: args.actionKey, direction: args.direction, progress });
    const left = frameIndex * CELL_WIDTH;
    const center = left + CELL_WIDTH / 2;
    return [
      `<rect x="${left}" y="0" width="${CELL_WIDTH}" height="${CELL_HEIGHT}" fill="${frameIndex % 2 === 0 ? "#F8FAFC" : "#F1F5F9"}" />`,
      `<line x1="${center}" y1="46" x2="${center}" y2="${BASELINE_Y + 18}" stroke="#38BDF8" stroke-width="2" stroke-dasharray="7 6" opacity="0.85" />`,
      `<line x1="${left + 20}" y1="${BASELINE_Y}" x2="${left + CELL_WIDTH - 20}" y2="${BASELINE_Y}" stroke="#0F766E" stroke-width="4" />`,
      renderContactMarker({ pose: sampled.pose, contactFoot: sampled.contactFoot, cellIndex: frameIndex }),
      renderFigure(sampled.pose, frameIndex),
      sampled.weaponTrail ? renderWeaponTrail(sampled.pose, frameIndex, sampled.impact) : "",
      `<text x="${left + 16}" y="28" fill="#111827" font-family="Arial, sans-serif" font-size="18" font-weight="700">F${frameIndex + 1}</text>`,
      `<text x="${left + CELL_WIDTH - 16}" y="28" text-anchor="end" fill="#475569" font-family="Arial, sans-serif" font-size="13">${sampled.directionLabel}</text>`,
      `<line x1="${left + 28}" y1="${CELL_HEIGHT - 30}" x2="${left + CELL_WIDTH - 28}" y2="${CELL_HEIGHT - 30}" stroke="#64748B" stroke-width="3" marker-end="url(#arrow)" />`,
    ].join("");
  }).join("");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${CELL_HEIGHT}" viewBox="0 0 ${width} ${CELL_HEIGHT}" shape-rendering="geometricPrecision">`,
    `<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#64748B" /></marker></defs>`,
    `<rect width="${width}" height="${CELL_HEIGHT}" fill="#F8FAFC" />`,
    cells,
    `<text x="${width - 14}" y="${CELL_HEIGHT - 8}" text-anchor="end" fill="#64748B" font-family="Arial, sans-serif" font-size="11">AMU ${args.actionKey} ${args.direction} guide v${version}</text>`,
    `</svg>`,
  ].join("");
}
