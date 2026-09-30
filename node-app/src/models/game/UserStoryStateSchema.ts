import { Schema, type Document } from "mongoose";
import type { IUserStoryStateDoc } from "types/game";

/**
 * @docHint
 * @purpose 사용자별 Personal Canon 상태 snapshot 모델
 * @process universe별 state 저장  reducer version 관리  마지막 event 연결
 * @domain narrative-runtime
 * @scope database
 */

export interface IUserStoryStateDocument extends Document, IUserStoryStateDoc {}

export const UserStoryStateSchema = new Schema<IUserStoryStateDocument>(
  {
    stateId: { type: String, required: true, unique: true, immutable: true, index: true },
    uid: { type: String, required: true, immutable: true, index: true },
    universeId: { type: String, required: true, immutable: true, index: true },
    narrativeProfileId: { type: String, required: true, immutable: true, index: true },
    canonRevision: { type: Number, required: true, min: 1 },
    status: { type: String, enum: ["active", "opted_out", "deleted"], required: true, default: "active", index: true },
    schemaVersion: { type: Number, required: true, min: 1, default: 1 },
    version: { type: Number, required: true, min: 0, default: 0 },
    activeArcIds: { type: [String], default: [] },
    activeBeatIds: { type: [String], default: [] },
    completedBeatIds: { type: [String], default: [] },
    flags: { type: Schema.Types.Mixed, default: {} },
    relationAffinity: { type: Schema.Types.Mixed, default: {} },
    relations: { type: Schema.Types.Mixed, default: {} },
    lastEventId: { type: String, default: null },
  },
  { timestamps: true, strict: true, collection: "user_story_states" },
);

UserStoryStateSchema.index({ uid: 1, universeId: 1, narrativeProfileId: 1 }, { unique: true, name: "user_story_state_identity_unique" });
