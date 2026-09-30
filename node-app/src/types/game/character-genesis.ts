export type {
  ICharacterGenesisProfileSnapshot,
  NarrativeStatId,
  NarrativeStatValues,
} from "./universe-narrative-ruleset";

export const CHARACTER_GENESIS_SOURCE_TYPES = ["authored", "user-random"] as const;
export type CharacterGenesisSourceType = (typeof CHARACTER_GENESIS_SOURCE_TYPES)[number];

export const CHARACTER_GENESIS_ROLL_STATUSES = ["prepared", "applying", "applied"] as const;
export type CharacterGenesisRollStatusType = (typeof CHARACTER_GENESIS_ROLL_STATUSES)[number];

export interface ICharacterGenesisProfileDoc {
  characterId: string;
  uid?: string | null;
  universeId: string;
  speciesId: string;
  archetypeId: string;
  sourceType: CharacterGenesisSourceType;
  rulesetVersion: number;
  algorithmVersion: number;
  primaryAttributeId: string;
  affinity: Record<string, number>;
  rarityTier: string;
  potentialBand: string;
  statBudget: number;
  stats: import("./universe-narrative-ruleset").NarrativeStatValues;
  traitIds: string[];
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface ICharacterProgressDoc {
  characterId: string;
  uid?: string | null;
  level: number;
  xp: number;
  hp: number;
  mp: number;
  mood: string;
  intimacy: number;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface ICharacterGenerationRollDoc {
  rollId: string;
  idempotencyKey: string;
  characterId: string;
  uid: string;
  universeId: string;
  rulesetVersion: number;
  algorithmVersion: number;
  status: CharacterGenesisRollStatusType;
  rarityBucket: number;
  rarityTier: string;
  archetypeId: string;
  primaryAttributeId: string;
  affinity: Record<string, number>;
  potentialBand: string;
  statBudget: number;
  traitCount: number;
  stats: import("./universe-narrative-ruleset").NarrativeStatValues;
  traitIds: string[];
  createdAt?: string | Date;
  updatedAt?: string | Date;
  appliedAt?: string | Date | null;
}
