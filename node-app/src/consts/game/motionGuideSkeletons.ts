import type { SpriteDirectionType } from "types/game/asset-pipeline";

export const MOTION_GUIDE_VERSION = 1;
export const MOTION_GUIDE_FRAME_COUNT = 4;
export const MOTION_GUIDE_FRAME_COUNTS = [4, 6, 8] as const;
export const MOTION_GUIDE_ACTION_KEYS = ["walk", "run", "attack", "idle"] as const;

// F4의 실제 5방향 생성 정본과 맞춘다. 나머지 방향은 미러 파생 또는 가이드 없는 폴백을 사용한다.
export const MOTION_GUIDE_MVP_DIRECTIONS = ["down", "down-right", "up", "up-left", "up-right"] as const;

export type MotionGuideActionKeyType = (typeof MOTION_GUIDE_ACTION_KEYS)[number];
export type MotionGuideDirectionType = (typeof MOTION_GUIDE_MVP_DIRECTIONS)[number];
export type MotionGuideFrameCountType = (typeof MOTION_GUIDE_FRAME_COUNTS)[number];
export type MotionGuideJointNameType =
  | "head"
  | "neck"
  | "shoulderLeft"
  | "shoulderRight"
  | "handLeft"
  | "handRight"
  | "hip"
  | "kneeLeft"
  | "kneeRight"
  | "footLeft"
  | "footRight";
export type MotionGuidePointType = { x: number; y: number };
export type MotionGuidePoseType = Record<MotionGuideJointNameType, MotionGuidePointType>;
export type MotionGuideKeyframeType = {
  at: number;
  pose: MotionGuidePoseType;
  contactFoot?: "left" | "right" | "both";
  impact?: boolean;
};

type MotionGuideSkeletonType = {
  loop: boolean;
  weaponTrail: boolean;
  keyframes: MotionGuideKeyframeType[];
};

const pose = (overrides: Partial<MotionGuidePoseType> = {}): MotionGuidePoseType => ({
  head: { x: 0, y: -0.78 },
  neck: { x: 0, y: -0.55 },
  shoulderLeft: { x: -0.2, y: -0.48 },
  shoulderRight: { x: 0.2, y: -0.48 },
  handLeft: { x: -0.32, y: -0.08 },
  handRight: { x: 0.32, y: -0.08 },
  hip: { x: 0, y: -0.02 },
  kneeLeft: { x: -0.14, y: 0.38 },
  kneeRight: { x: 0.14, y: 0.38 },
  footLeft: { x: -0.18, y: 0.82 },
  footRight: { x: 0.18, y: 0.82 },
  ...overrides,
});

export const MOTION_GUIDE_SKELETONS: Record<MotionGuideActionKeyType, MotionGuideSkeletonType> = {
  walk: {
    loop: true,
    weaponTrail: false,
    keyframes: [
      {
        at: 0,
        contactFoot: "left",
        pose: pose({
          handLeft: { x: 0.18, y: -0.05 },
          handRight: { x: -0.28, y: -0.12 },
          kneeLeft: { x: -0.12, y: 0.4 },
          kneeRight: { x: 0.25, y: 0.3 },
          footLeft: { x: -0.3, y: 0.82 },
          footRight: { x: 0.34, y: 0.74 },
        }),
      },
      {
        at: 0.25,
        pose: pose({
          head: { x: 0, y: -0.72 },
          hip: { x: 0, y: 0.04 },
          kneeLeft: { x: -0.08, y: 0.42 },
          kneeRight: { x: 0.1, y: 0.48 },
          footLeft: { x: -0.1, y: 0.8 },
          footRight: { x: 0.12, y: 0.8 },
        }),
      },
      {
        at: 0.5,
        contactFoot: "right",
        pose: pose({
          handLeft: { x: -0.28, y: -0.12 },
          handRight: { x: 0.18, y: -0.05 },
          kneeLeft: { x: -0.25, y: 0.3 },
          kneeRight: { x: 0.12, y: 0.4 },
          footLeft: { x: -0.34, y: 0.74 },
          footRight: { x: 0.3, y: 0.82 },
        }),
      },
      {
        at: 0.75,
        pose: pose({
          head: { x: 0, y: -0.72 },
          hip: { x: 0, y: 0.04 },
          kneeLeft: { x: -0.1, y: 0.48 },
          kneeRight: { x: 0.08, y: 0.42 },
          footLeft: { x: -0.12, y: 0.8 },
          footRight: { x: 0.1, y: 0.8 },
        }),
      },
      { at: 1, contactFoot: "left", pose: pose() },
    ],
  },
  run: {
    loop: true,
    weaponTrail: false,
    keyframes: [
      {
        at: 0,
        contactFoot: "left",
        pose: pose({
          head: { x: 0.12, y: -0.72 },
          neck: { x: 0.1, y: -0.5 },
          handLeft: { x: 0.28, y: -0.25 },
          handRight: { x: -0.4, y: 0.02 },
          hip: { x: 0.06, y: 0 },
          kneeLeft: { x: -0.18, y: 0.42 },
          kneeRight: { x: 0.42, y: 0.18 },
          footLeft: { x: -0.42, y: 0.82 },
          footRight: { x: 0.52, y: 0.55 },
        }),
      },
      {
        at: 0.25,
        pose: pose({
          head: { x: 0.12, y: -0.78 },
          neck: { x: 0.1, y: -0.54 },
          handLeft: { x: 0.12, y: -0.2 },
          handRight: { x: -0.22, y: -0.05 },
          hip: { x: 0.08, y: -0.06 },
          kneeLeft: { x: -0.08, y: 0.3 },
          kneeRight: { x: 0.2, y: 0.28 },
          footLeft: { x: -0.18, y: 0.62 },
          footRight: { x: 0.3, y: 0.62 },
        }),
      },
      {
        at: 0.5,
        contactFoot: "right",
        pose: pose({
          head: { x: 0.12, y: -0.72 },
          neck: { x: 0.1, y: -0.5 },
          handLeft: { x: -0.4, y: 0.02 },
          handRight: { x: 0.28, y: -0.25 },
          hip: { x: 0.06, y: 0 },
          kneeLeft: { x: -0.42, y: 0.18 },
          kneeRight: { x: 0.18, y: 0.42 },
          footLeft: { x: -0.52, y: 0.55 },
          footRight: { x: 0.42, y: 0.82 },
        }),
      },
      {
        at: 0.75,
        pose: pose({
          head: { x: 0.12, y: -0.78 },
          neck: { x: 0.1, y: -0.54 },
          handLeft: { x: -0.22, y: -0.05 },
          handRight: { x: 0.12, y: -0.2 },
          hip: { x: 0.08, y: -0.06 },
          kneeLeft: { x: -0.2, y: 0.28 },
          kneeRight: { x: 0.08, y: 0.3 },
          footLeft: { x: -0.3, y: 0.62 },
          footRight: { x: 0.18, y: 0.62 },
        }),
      },
      { at: 1, contactFoot: "left", pose: pose() },
    ],
  },
  attack: {
    loop: false,
    weaponTrail: true,
    keyframes: [
      { at: 0, contactFoot: "both", pose: pose() },
      {
        at: 0.33,
        pose: pose({
          head: { x: -0.08, y: -0.75 },
          handLeft: { x: -0.42, y: -0.42 },
          handRight: { x: -0.3, y: -0.52 },
          hip: { x: -0.06, y: 0 },
          kneeLeft: { x: -0.22, y: 0.38 },
          footLeft: { x: -0.3, y: 0.82 },
        }),
      },
      {
        at: 0.66,
        impact: true,
        contactFoot: "right",
        pose: pose({
          head: { x: 0.16, y: -0.68 },
          neck: { x: 0.12, y: -0.48 },
          handLeft: { x: 0.42, y: -0.24 },
          handRight: { x: 0.58, y: -0.16 },
          hip: { x: 0.12, y: 0.02 },
          kneeLeft: { x: -0.1, y: 0.4 },
          kneeRight: { x: 0.34, y: 0.34 },
          footLeft: { x: -0.2, y: 0.82 },
          footRight: { x: 0.44, y: 0.82 },
        }),
      },
      { at: 1, contactFoot: "both", pose: pose({ handRight: { x: 0.24, y: -0.04 } }) },
    ],
  },
  idle: {
    loop: true,
    weaponTrail: false,
    keyframes: [
      { at: 0, contactFoot: "both", pose: pose() },
      { at: 0.5, contactFoot: "both", pose: pose({ head: { x: 0, y: -0.81 }, hip: { x: 0, y: -0.04 } }) },
      { at: 1, contactFoot: "both", pose: pose() },
    ],
  },
};

const DIRECTION_PROFILE: Record<
  SpriteDirectionType,
  { mirror: 1 | -1; depth: number; lateral: number; label: string }
> = {
  down: { mirror: 1, depth: 0.82, lateral: 0.86, label: "SW" },
  up: { mirror: -1, depth: 0.82, lateral: 0.86, label: "NE" },
  left: { mirror: -1, depth: 0.72, lateral: 0.74, label: "NW" },
  right: { mirror: 1, depth: 0.72, lateral: 0.74, label: "SE" },
  "down-left": { mirror: -1, depth: 0.6, lateral: 1, label: "W" },
  "up-left": { mirror: -1, depth: 0.52, lateral: 0.5, label: "N" },
  "up-right": { mirror: 1, depth: 0.6, lateral: 1, label: "E" },
  "down-right": { mirror: 1, depth: 0.52, lateral: 0.5, label: "S" },
};

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function sampleMotionGuidePose(args: {
  actionKey: MotionGuideActionKeyType;
  direction: SpriteDirectionType;
  progress: number;
}) {
  const skeleton = MOTION_GUIDE_SKELETONS[args.actionKey];
  const progress = Math.max(0, Math.min(1, args.progress));
  const nextIndex = skeleton.keyframes.findIndex((keyframe) => keyframe.at >= progress);
  const upperIndex = nextIndex < 0 ? skeleton.keyframes.length - 1 : nextIndex;
  const lowerIndex = Math.max(0, upperIndex - 1);
  const lower = skeleton.keyframes[lowerIndex];
  const upper = skeleton.keyframes[upperIndex];
  const span = Math.max(0.0001, upper.at - lower.at);
  const mix = upperIndex === lowerIndex ? 0 : (progress - lower.at) / span;
  const profile = DIRECTION_PROFILE[args.direction];
  const sampled = {} as MotionGuidePoseType;
  for (const joint of Object.keys(lower.pose) as MotionGuideJointNameType[]) {
    const x = lerp(lower.pose[joint].x, upper.pose[joint].x, mix);
    const y = lerp(lower.pose[joint].y, upper.pose[joint].y, mix);
    sampled[joint] = {
      x: x * profile.lateral * profile.mirror,
      y: y * profile.depth,
    };
  }
  return {
    pose: sampled,
    contactFoot: mix < 0.5 ? lower.contactFoot : upper.contactFoot,
    impact: Boolean((mix < 0.5 ? lower : upper).impact),
    directionLabel: profile.label,
    weaponTrail: skeleton.weaponTrail,
  };
}

export function getMotionGuideFrameProgress(actionKey: MotionGuideActionKeyType, frameIndex: number, frameCount: number) {
  const safeCount = Math.max(2, Math.round(frameCount));
  const safeIndex = Math.max(0, Math.min(safeCount - 1, Math.round(frameIndex)));
  return MOTION_GUIDE_SKELETONS[actionKey].loop ? safeIndex / safeCount : safeIndex / (safeCount - 1);
}
