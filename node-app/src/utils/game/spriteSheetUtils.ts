import type {
  IPersonaSprite,
  PersonaSpriteDirection,
} from "types/ai";
import type { DirectionBaseType } from "types/game";

export const SPRITE_DIRECTIONS: DirectionBaseType[] = ["left", "right", "up", "down"];

// 에셋 계약 v2 §1.2 — 8방향 시트 행 방향 순서 (제작/합성 규격 권고값)
// 런타임 행 매핑의 권위는 항상 sprite.animations 메타이며, 본 배열은 순회 순서 용도.
export const SPRITE_DIRECTIONS_8: PersonaSpriteDirection[] = [
  "down",
  "up",
  "left",
  "right",
  "down-left",
  "up-left",
  "up-right",
  "down-right",
];

export function resolveSpriteDirection(
  _sprite: IPersonaSprite | null | undefined,
  direction?: string,
): PersonaSpriteDirection {
  return normalizeSpriteDirection(direction);
}

export function hasSpriteSheet(sprite?: IPersonaSprite | null): sprite is IPersonaSprite {
  return !!sprite && typeof sprite.url === "string" && sprite.url.length > 0;
}

// AMU Play 조작 캐릭터 계약: 8개 방향 모두에 유효한 걷기 프레임이 있어야 한다.
export function isControllableSprite(sprite?: IPersonaSprite | null): sprite is IPersonaSprite {
  if (!hasSpriteSheet(sprite) || sprite.directionCount !== 8) return false;
  if (
    !Number.isInteger(sprite.frameWidth) ||
    sprite.frameWidth <= 0 ||
    !Number.isInteger(sprite.frameHeight) ||
    sprite.frameHeight <= 0 ||
    !Number.isInteger(sprite.columns) ||
    sprite.columns <= 0 ||
    !Number.isInteger(sprite.rows) ||
    sprite.rows < SPRITE_DIRECTIONS_8.length
  ) {
    return false;
  }

  return SPRITE_DIRECTIONS_8.every((direction) => {
    const animation = sprite.animations?.[direction];
    return (
      Number.isInteger(animation?.row) &&
      Number(animation?.row) >= 0 &&
      Number(animation?.row) < sprite.rows &&
      Array.isArray(animation?.frames) &&
      animation.frames.length >= 2 &&
      animation.frames.every((frame) => Number.isInteger(frame) && frame >= 0 && frame < sprite.columns)
    );
  });
}

export function isControllablePersona<T extends { sprite?: IPersonaSprite | null; status?: string }>(
  persona: T | null | undefined,
): persona is T & { sprite: IPersonaSprite };
export function isControllablePersona(persona?: unknown): boolean;
export function isControllablePersona(persona?: unknown): boolean {
  if (!persona || typeof persona !== "object") return false;
  const candidate = persona as { sprite?: IPersonaSprite | null; status?: string };
  return candidate.status !== "disabled" && isControllableSprite(candidate.sprite);
}

export function getSpriteIdleDirection(sprite?: IPersonaSprite | null): DirectionBaseType {
  if (!hasSpriteSheet(sprite)) return "down";
  return (sprite.idleDirection || "down") as DirectionBaseType;
}

export function getSpriteAnimation(sprite: IPersonaSprite, direction: PersonaSpriteDirection = "down") {
  const resolved = resolveSpriteDirection(sprite, direction);
  return sprite.animations[resolved];
}

export function getSpriteAnimationRow(sprite?: IPersonaSprite | null, direction: PersonaSpriteDirection = "down"): number {
  if (!hasSpriteSheet(sprite)) return 0;
  return getSpriteAnimation(sprite, direction)?.row || 0;
}

export function getSpriteAnimationFrames(
  sprite?: IPersonaSprite | null,
  direction: PersonaSpriteDirection = "down",
): number[] {
  if (!hasSpriteSheet(sprite)) return [];
  return getSpriteAnimation(sprite, direction)?.frames || [];
}

export function getSpriteFrameColumn(
  sprite?: IPersonaSprite | null,
  direction: PersonaSpriteDirection = "down",
  sequenceIndex = 0,
): number {
  if (!hasSpriteSheet(sprite)) return 0;
  const frames = getSpriteAnimationFrames(sprite, direction);
  if (frames.length === 0) return 0;
  return frames[((sequenceIndex % frames.length) + frames.length) % frames.length] || 0;
}

export function getSpriteFrameRow(sprite?: IPersonaSprite | null, direction: PersonaSpriteDirection = "down"): number {
  return getSpriteAnimationRow(sprite, direction);
}

export function getSpriteSequenceIndexByTick(args: {
  sprite?: IPersonaSprite | null;
  direction: PersonaSpriteDirection;
  tick: number;
  moving: boolean;
  intervalMs: number;
}) {
  const { sprite, direction, tick, moving, intervalMs } = args;
  if (!hasSpriteSheet(sprite)) return 0;

  const frames = getSpriteAnimationFrames(sprite, direction);
  if (frames.length <= 1) return 0;

  const fps = moving ? Number(sprite.fps || 8) : Number(sprite.idleFps || 0);
  if (!Number.isFinite(fps) || fps <= 0) return 0;

  const ticksPerFrame = Math.max(1, Math.round(1000 / (fps * intervalMs)));
  return Math.floor(tick / ticksPerFrame) % frames.length;
}

export function isSpriteAnimated(sprite?: IPersonaSprite | null, direction: PersonaSpriteDirection = "down") {
  return getSpriteAnimationFrames(sprite, direction).length > 1;
}

export function getSpritePreviewStyle(args: {
  sprite?: IPersonaSprite | null;
  direction?: PersonaSpriteDirection;
  sequenceIndex?: number;
}) {
  const { sprite, direction = "down", sequenceIndex = 0 } = args;
  if (!hasSpriteSheet(sprite)) return null;

  const column = getSpriteFrameColumn(sprite, direction, sequenceIndex);
  const row = getSpriteFrameRow(sprite, direction);

  const xPercent = sprite.columns <= 1 ? 0 : (column / (sprite.columns - 1)) * 100;
  const yPercent = sprite.rows <= 1 ? 0 : (row / (sprite.rows - 1)) * 100;

  return {
    backgroundImage: `url(${sprite.url})`,
    backgroundRepeat: "no-repeat",
    backgroundSize: `${sprite.columns * 100}% ${sprite.rows * 100}%`,
    backgroundPosition: `${xPercent}% ${yPercent}%`,
  };
}

export function normalizeSpriteDirection(direction?: string): PersonaSpriteDirection {
  const raw = String(direction || "").trim().toLowerCase();
  switch (raw) {
    case "left":
    case "right":
    case "up":
    case "down":
    case "down-left":
    case "up-left":
    case "up-right":
    case "down-right":
      return raw as PersonaSpriteDirection;
    default:
      return "down";
  }
}
