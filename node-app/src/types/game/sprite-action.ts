export const SPRITE_ACTION_SCOPES = ["system", "universe", "user"] as const;
export type SpriteActionScopeType = (typeof SPRITE_ACTION_SCOPES)[number];

export type SpriteActionLocalizedTextType = { ko: string; en: string };

export interface ISpriteActionDoc {
  actionId: string;
  actionKey: string;
  label: SpriteActionLocalizedTextType;
  description: SpriteActionLocalizedTextType;
  motionAction: string;
  motionSequence: string;
  fps: number;
  loop: boolean;
  frameCount: number;
  symmetryEligible: boolean;
  motionGuideVersion: number;
  scope: SpriteActionScopeType;
  ownerId: string;
  universeId?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}
