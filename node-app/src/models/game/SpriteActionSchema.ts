import { Schema, type Document } from "mongoose";
import { SPRITE_ACTION_SCOPES, type ISpriteActionDoc } from "types/game/sprite-action";

export interface ISpriteActionDocument extends Document, ISpriteActionDoc {}

const LocalizedTextSchema = new Schema(
  {
    ko: { type: String, required: true, trim: true, maxlength: 80 },
    en: { type: String, required: true, trim: true, maxlength: 80 },
  },
  { _id: false },
);

export const SpriteActionSchema = new Schema<ISpriteActionDocument>(
  {
    actionId: { type: String, required: true, unique: true, index: true },
    actionKey: { type: String, required: true, trim: true, maxlength: 48 },
    label: { type: LocalizedTextSchema, required: true },
    description: { type: LocalizedTextSchema, required: true },
    motionAction: { type: String, required: true, trim: true, maxlength: 500 },
    motionSequence: { type: String, required: true, trim: true, maxlength: 500 },
    fps: { type: Number, required: true, min: 1, max: 24, default: 8 },
    loop: { type: Boolean, required: true, default: false },
    frameCount: { type: Number, required: true, enum: [4, 6, 8], default: 4 },
    symmetryEligible: { type: Boolean, required: true, default: false },
    motionGuideVersion: { type: Number, required: true, min: 0, default: 0 },
    scope: { type: String, required: true, enum: SPRITE_ACTION_SCOPES, index: true },
    ownerId: { type: String, required: true, trim: true, index: true },
    universeId: { type: String, default: "", trim: true, index: true },
  },
  { timestamps: true, collection: "game_sprite_actions" },
);

SpriteActionSchema.index({ scope: 1, ownerId: 1, actionKey: 1 }, { unique: true });
SpriteActionSchema.index({ scope: 1, universeId: 1, actionKey: 1 });
