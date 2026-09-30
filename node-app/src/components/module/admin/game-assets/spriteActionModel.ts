export type SpriteActionPresetType = {
  key: string;
  label: { ko: string; en: string };
  description: { ko: string; en: string };
  motionAction: string;
  motionSequence: string;
  fps: number;
  loop: boolean;
  frameCount: number;
  symmetryEligible: boolean;
  motionGuideVersion: number;
  scope?: "system" | "universe" | "user";
};

export const SPRITE_ACTION_PRESETS: SpriteActionPresetType[] = [
  {
    key: "walk",
    label: { ko: "걷기", en: "Walk" },
    description: { ko: "월드 이동에 필요한 기본 동작", en: "Required movement animation" },
    motionAction: "natural isometric walking cycle with clear alternating foot contacts",
    motionSequence: "idle contact, left-foot step, opposite contact, right-foot step",
    fps: 8,
    loop: true,
    frameCount: 4,
    symmetryEligible: true,
    motionGuideVersion: 0,
  },
  {
    key: "run",
    label: { ko: "뛰기", en: "Run" },
    description: { ko: "빠른 이동과 추격에 사용하는 반복 동작", en: "Loop for fast movement and chase" },
    motionAction: "energetic isometric running cycle with forward torso lean and readable stride",
    motionSequence: "contact, compression, airborne stride, opposite contact",
    fps: 12,
    loop: true,
    frameCount: 4,
    symmetryEligible: true,
    motionGuideVersion: 0,
  },
  {
    key: "attack",
    label: { ko: "공격하기", en: "Attack" },
    description: { ko: "준비·타격·회복이 보이는 단발 동작", en: "One-shot windup, strike, and recovery" },
    motionAction: "clear game attack action without detached effects or extra weapons",
    motionSequence: "ready stance, windup, impact pose, recovery stance",
    fps: 10,
    loop: false,
    frameCount: 4,
    symmetryEligible: false,
    motionGuideVersion: 0,
  },
  {
    key: "defend",
    label: { ko: "방어하기", en: "Defend" },
    description: { ko: "방어 자세로 전환하고 유지하는 동작", en: "Enter and hold a defensive stance" },
    motionAction: "readable defensive guard action with stable footing",
    motionSequence: "neutral stance, raise guard, brace at peak defense, settle into guard",
    fps: 8,
    loop: false,
    frameCount: 4,
    symmetryEligible: false,
    motionGuideVersion: 0,
  },
  {
    key: "down",
    label: { ko: "쓰러지기", en: "Fall Down" },
    description: { ko: "피격 후 바닥에 쓰러지는 비반복 동작", en: "Non-looping hit and fall sequence" },
    motionAction: "safe non-graphic game defeat action ending on the ground",
    motionSequence: "standing hit reaction, losing balance, falling, final down pose",
    fps: 8,
    loop: false,
    frameCount: 4,
    symmetryEligible: false,
    motionGuideVersion: 0,
  },
];

export const DEFAULT_SPRITE_ACTION = SPRITE_ACTION_PRESETS[0];

export function normalizeSpriteActionKey(value: unknown) {
  return (
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "walk"
  );
}
