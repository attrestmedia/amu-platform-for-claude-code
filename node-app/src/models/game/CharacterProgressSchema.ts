import { Schema, type Document } from "mongoose";
import type { ICharacterProgressDoc } from "types/game/character-genesis";

export interface ICharacterProgressDocument extends Document, ICharacterProgressDoc {}

export const CharacterProgressSchema = new Schema<ICharacterProgressDocument>(
  {
    characterId: { type: String, required: true, unique: true, index: true },
    uid: { type: String, default: null, index: true },
    level: { type: Number, required: true, min: 1, default: 1 },
    xp: { type: Number, required: true, min: 0, default: 0 },
    hp: { type: Number, required: true, min: 0, default: 100 },
    mp: { type: Number, required: true, min: 0, default: 100 },
    mood: { type: String, required: true, default: "neutral" },
    intimacy: { type: Number, required: true, min: 0, default: 0 },
  },
  { timestamps: true, collection: "character_progress" },
);

CharacterProgressSchema.index({ uid: 1, updatedAt: -1 });
