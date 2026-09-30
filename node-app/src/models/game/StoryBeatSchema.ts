import { Schema, type Document } from "mongoose";
import { NARRATIVE_TRANSITION_VALUES, type IStoryBeatDoc } from "types/game";

/**
 * @docHint
 * @purpose 사용자별 Story Beat 상태 모델
 * @process arc sequence 저장  allowlisted transition 연결  완료 상태 관리
 * @domain narrative-runtime
 * @scope database
 */

export interface IStoryBeatDocument extends Document, IStoryBeatDoc {}

export const StoryBeatSchema = new Schema<IStoryBeatDocument>(
  {
    beatId: { type: String, required: true, immutable: true, index: true },
    arcId: { type: String, required: true, immutable: true, index: true },
    uid: { type: String, required: true, immutable: true, index: true },
    universeId: { type: String, required: true, immutable: true, index: true },
    narrativeProfileId: { type: String, required: true, immutable: true, index: true },
    sequence: { type: Number, required: true, min: 0, immutable: true },
    status: { type: String, enum: ["locked", "available", "active", "completed"], required: true, default: "locked" },
    canonRevision: { type: Number, required: true, min: 1, immutable: true },
    transitionKey: { type: String, enum: NARRATIVE_TRANSITION_VALUES, required: true, immutable: true },
  },
  { timestamps: true, strict: true, collection: "story_beats" },
);

StoryBeatSchema.index({ uid: 1, universeId: 1, narrativeProfileId: 1, arcId: 1, sequence: 1 }, { name: "story_beat_sequence_lookup" });
StoryBeatSchema.index({ uid: 1, universeId: 1, narrativeProfileId: 1, beatId: 1 }, { unique: true, name: "story_beat_identity_unique" });
