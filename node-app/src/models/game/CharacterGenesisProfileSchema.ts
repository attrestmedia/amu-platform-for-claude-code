import { Schema, type Document } from "mongoose";
import {
  CHARACTER_GENESIS_SOURCE_TYPES,
  type ICharacterGenesisProfileDoc,
} from "types/game/character-genesis";

export interface ICharacterGenesisProfileDocument extends Document, ICharacterGenesisProfileDoc {}

const statsSchema = new Schema(
  {
    vitality: { type: Number, required: true },
    focus: { type: Number, required: true },
    insight: { type: Number, required: true },
    empathy: { type: Number, required: true },
    adaptability: { type: Number, required: true },
    fortune: { type: Number, required: true },
  },
  { _id: false },
);

export const CharacterGenesisProfileSchema = new Schema<ICharacterGenesisProfileDocument>(
  {
    characterId: { type: String, required: true, unique: true, index: true },
    uid: { type: String, default: null, index: true },
    universeId: { type: String, required: true, index: true },
    speciesId: { type: String, required: true },
    archetypeId: { type: String, required: true },
    sourceType: { type: String, enum: CHARACTER_GENESIS_SOURCE_TYPES, required: true },
    rulesetVersion: { type: Number, required: true, min: 1 },
    algorithmVersion: { type: Number, required: true, min: 1 },
    primaryAttributeId: { type: String, required: true },
    affinity: { type: Schema.Types.Mixed, required: true, default: {} },
    rarityTier: { type: String, required: true },
    potentialBand: { type: String, required: true },
    statBudget: { type: Number, required: true, min: 0 },
    stats: { type: statsSchema, required: true },
    traitIds: { type: [String], default: [] },
  },
  { timestamps: true, collection: "character_genesis_profiles" },
);

CharacterGenesisProfileSchema.index({ uid: 1, universeId: 1, updatedAt: -1 });
