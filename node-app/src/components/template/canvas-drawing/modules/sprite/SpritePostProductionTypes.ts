import type { IPersonaSprite, PersonaSpriteDirection } from "types/ai";

export type SpritePostProductionConfig = {
  directionRows: PersonaSpriteDirection[];
  bibleSourceUrl?: string;
  bibleDirections?: string[];
  sprite: IPersonaSprite;
  manifest: Record<string, unknown>;
  exportBaseName: string;
};

export type SpriteNormalizationSummary = {
  normalizedFrames: number;
  beforeMeanDriftPx: number;
  beforeMaxDriftPx: number;
  afterMeanDriftPx: number;
  afterMaxDriftPx: number;
  targetAnchorX: number;
  targetAnchorY: number;
};
