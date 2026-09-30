import type { DirectionFacingType, DirectionType, ITextureRefs, NpcSpriteType } from "types/game";
import {
  getSpriteIdleDirection,
  getSpriteSequenceIndexByTick,
  normalizeSpriteDirection,
  pickDirectionTexture,
} from "utils/game";
import { logger } from "utils/log";

export function getProtagonistAnimation(
  preCalculatedAnimationOffsets: { walkingOffsets: number[]; breathingOffsets: number[] },
  animationFrames: number,
  frameCount: number,
  isMoving: boolean,
): { frameIndex: number; animationYOffset: number } {
  const baseIndex = frameCount % animationFrames;
  const { walkingOffsets, breathingOffsets } = preCalculatedAnimationOffsets;
  const walkIndex = walkingOffsets.length > 0 ? baseIndex % walkingOffsets.length : 0;
  const breathIndex = breathingOffsets.length > 0 ? baseIndex % breathingOffsets.length : 0;
  const animationYOffset = isMoving
    ? walkingOffsets.length > 0
      ? walkingOffsets[walkIndex]
      : 0
    : breathingOffsets.length > 0
      ? breathingOffsets[breathIndex]
      : 0;

  return { frameIndex: frameCount, animationYOffset };
}

export function applyProtagonistTextureFrame(
  texturesRef: React.RefObject<ITextureRefs>,
  direction: DirectionType,
  frameTick: number,
  moving: boolean,
  sprite: NpcSpriteType,
): void {
  const spriteMap = texturesRef.current?.protagonist?.sprite;
  const personaSprite = sprite.data?.persona?.sprite;
  const resolvedDirection = normalizeSpriteDirection(direction ?? "down");
  const sequenceIndex = getSpriteSequenceIndexByTick({
    sprite: personaSprite,
    direction: resolvedDirection,
    tick: frameTick,
    moving,
    intervalMs: 16,
  });
  const texture = pickDirectionTexture(spriteMap, resolvedDirection, sequenceIndex);

  if (texture) {
    if (sprite.texture !== texture) sprite.texture = texture;
    return;
  }

  logger.warn(`[Texture Warning] ${direction} 방향 텍스처가 없음`, {
    spriteMapKeys: spriteMap ? Object.keys(spriteMap) : null,
  });
}

export function resolveProtagonistDirection(sprite: NpcSpriteType | null): DirectionFacingType {
  if (!sprite) return "down";
  return sprite.data?.direction ?? getSpriteIdleDirection(sprite.data?.persona?.sprite);
}
