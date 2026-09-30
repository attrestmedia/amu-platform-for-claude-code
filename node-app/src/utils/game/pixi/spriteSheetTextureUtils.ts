import { Rectangle, Texture } from "pixi.js";
import type { IPersonaSprite, PersonaSpriteDirection } from "types/ai";
import type { IDirectionTextureMap } from "types/game";
import { textureManager } from "./TextureManager";
import {
  getSpriteAnimationFrames,
  getSpriteAnimationRow,
  isControllableSprite,
  normalizeSpriteDirection,
  SPRITE_DIRECTIONS_8,
} from "../spriteSheetUtils";

type TextureOptionsForFrame = NonNullable<ConstructorParameters<typeof Texture>[0]>;
type TextureSourceForFrame = TextureOptionsForFrame extends { source?: infer T } ? T : never;
type TextureWithSource = Texture & { source: TextureSourceForFrame };

export async function buildDirectionTexturesFromSprite(sprite: IPersonaSprite, priority = false): Promise<IDirectionTextureMap> {
  if (!isControllableSprite(sprite)) throw new Error("sprite_v2_8_direction_contract_required");
  const sheetTexture = await textureManager.getTexture(sprite.url, priority);
  const source = (sheetTexture as TextureWithSource).source;

  const directionTextures = Object.create(null) as IDirectionTextureMap;

  for (const direction of SPRITE_DIRECTIONS_8) {
    const row = getSpriteAnimationRow(sprite, direction);
    const frames = getSpriteAnimationFrames(sprite, direction);
    if (frames.length === 0) continue;

    directionTextures[direction] = frames.map((column) => {
      const x = column * sprite.frameWidth;
      const y = row * sprite.frameHeight;

      return new Texture({
        source,
        frame: new Rectangle(x, y, sprite.frameWidth, sprite.frameHeight),
      });
    });
  }

  return directionTextures;
}

// IDirectionTextureMap 서브텍스처 해제 (P1-6, game-pixi 생성/해제 쌍 규칙)
// - base texture는 TextureManager 캐시가 소유하므로 보존(destroy(false))
export function destroyDirectionTextureMap(map: IDirectionTextureMap | null | undefined): void {
  if (!map) return;
  for (const frames of Object.values(map)) {
    if (!frames) continue;
    for (const tex of frames) {
      if (tex && !tex.destroyed) tex.destroy(false);
    }
  }
}

export function pickDirectionTexture(
  spriteMap: IDirectionTextureMap | null | undefined,
  direction: PersonaSpriteDirection | string,
  frameIndex = 0,
): Texture | null {
  if (!spriteMap) return null;

  const dir = normalizeSpriteDirection(direction);
  const frames = spriteMap[dir];
  if (!frames?.length) return null;
  return frames[((frameIndex % frames.length) + frames.length) % frames.length] || null;
}
