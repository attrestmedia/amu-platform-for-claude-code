import { Schema, type Document } from "mongoose";
import {
  CHARACTER_GENESIS_ROLL_STATUSES,
  type ICharacterGenerationRollDoc,
} from "types/game/character-genesis";

export interface ICharacterGenerationRollDocument extends Document, ICharacterGenerationRollDoc {}

export const CharacterGenerationRollSchema = new Schema<ICharacterGenerationRollDocument>(
  {
    rollId: { type: String, required: true, unique: true, index: true },
    idempotencyKey: { type: String, required: true, unique: true, index: true },
    characterId: { type: String, required: true, index: true },
    uid: { type: String, required: true, index: true },
    universeId: { type: String, required: true, index: true },
    rulesetVersion: { type: Number, required: true, min: 1 },
    algorithmVersion: { type: Number, required: true, min: 1 },
    status: { type: String, enum: CHARACTER_GENESIS_ROLL_STATUSES, required: true, index: true },
    rarityBucket: { type: Number, required: true, min: 0, max: 999999 },
    rarityTier: { type: String, required: true },
    archetypeId: { type: String, required: true },
    primaryAttributeId: { type: String, required: true },
    affinity: { type: Schema.Types.Mixed, required: true, default: {} },
    potentialBand: { type: String, required: true },
    statBudget: { type: Number, required: true, min: 0 },
    traitCount: { type: Number, required: true, min: 0 },
    stats: { type: Schema.Types.Mixed, required: true },
    traitIds: { type: [String], default: [] },
    appliedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "character_generation_rolls" },
);

CharacterGenerationRollSchema.index({ uid: 1, createdAt: -1 });
