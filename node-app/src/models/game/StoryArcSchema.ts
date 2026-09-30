import { Schema, type Document } from "mongoose";
import type { IStoryArcDoc } from "types/game";

/**
 * @docHint
 * @purpose 사용자별 Story Arc 상태 모델
 * @process 캐릭터·Canon revision 고정  arc lifecycle 저장
 * @domain narrative-runtime
 * @scope database
 */

export interface IStoryArcDocument extends Document, IStoryArcDoc {}

export const StoryArcSchema = new Schema<IStoryArcDocument>(
  {
    arcId: { type: String, required: true, immutable: true, index: true },
    uid: { type: String, required: true, immutable: true, index: true },
    universeId: { type: String, required: true, immutable: true, index: true },
    narrativeProfileId: { type: String, required: true, immutable: true, index: true },
    characterId: { type: String, required: true, immutable: true, index: true },
    canonRevision: { type: Number, required: true, min: 1, immutable: true },
    status: { type: String, enum: ["locked", "active", "completed", "abandoned"], required: true, default: "locked" },
    goalKey: { type: String, required: true, immutable: true },
  },
  { timestamps: true, strict: true, collection: "story_arcs" },
);

StoryArcSchema.index({ uid: 1, universeId: 1, narrativeProfileId: 1, characterId: 1 }, { name: "story_arc_character_lookup" });
StoryArcSchema.index({ uid: 1, universeId: 1, narrativeProfileId: 1, arcId: 1 }, { unique: true, name: "story_arc_identity_unique" });
