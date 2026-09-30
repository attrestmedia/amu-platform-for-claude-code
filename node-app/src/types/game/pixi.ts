import type { Sprite, Texture, Container } from "pixi.js";
import type { INpcInterface } from "./npc";
import type { DirectionFacingType } from "./stage";
import type { ICollisionRect, IIsometricDepthKey } from "./stage";
import type { GridFootprint, GridPoint, LogicalWorldPoint } from "./coordinates";

export type NpcSpriteType = Sprite & {
  currentDirection?: DirectionFacingType;
  data: Partial<INpcInterface>;
  role?: string[];
  label?: string;
  npcContainer?: Container;
  nameContainer?: Container;
  productData?: { id?: string | number };
  __logicalPosition?: LogicalWorldPoint;
  __logicalCollision?: ICollisionRect;
  __isoDepthKey?: IIsometricDepthKey;
  __isoCullFootprint?: {
    gridPoint: GridPoint;
    footprint: GridFootprint;
  };
};

export interface IDirectionTextureMap {
  left: Texture[];
  right: Texture[];
  up: Texture[];
  down: Texture[];
  // 에셋 계약 v2 8방향 시트 전용 (없으면 pickDirectionTexture가 §1.4로 base 수렴)
  "down-left"?: Texture[];
  "up-left"?: Texture[];
  "up-right"?: Texture[];
  "down-right"?: Texture[];
  [action: string]: Texture[] | undefined;
}

export interface IProfileTextureMap {
  default: Texture[];
  [variant: string]: Texture[] | undefined;
}

// 텍스처 참조 관리 인터페이스
export interface ITextureRefs {
  protagonist: {
    sprite: IDirectionTextureMap | null;
    profiles: IProfileTextureMap | null;
  };
  npcs: Map<
    string,
    {
      sprite: IDirectionTextureMap;
      profiles?: IProfileTextureMap;
    }
  >;
  obstacles: Texture[];
}

// 캐릭터 pixi 스프라이트 생성 인터페이스
export interface ICreateCharacterName {
  stageContainer: Container;
  label: string; // "protagonist-name" 또는 `${npcKey}-name`
  name: string; // 표시할 이름
  x: number; // 스프라이트 기준 x
  y: number; // 스프라이트 기준 y
  size: number; // 캐릭터 크기 (userSize / npcSize)
  color: number; // GC.UI.USER_TEXT_COLOR or GC.UI.NPC_TEXT_COLOR
  zIndex?: number;
}
