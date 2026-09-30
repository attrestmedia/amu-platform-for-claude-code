import { Schema, type Document } from "mongoose";
import type { ICharacterRelationDoc } from "types/game";

/**
 * @docHint
 * @purpose Narrative Runtime 전용 사용자별 캐릭터 관계 projection 모델
 * @process 관계 identity 고정  affinity reducer 결과 저장  기존 NpcIntimacy와 namespace 분리
 * @domain narrative-runtime
 * @scope database
 */

export interface ICharacterRelationDocument extends Document, ICharacterRelationDoc {}

export const CharacterRelationSchema = new Schema<ICharacterRelationDocument>(
  {
    relationId: { type: String, required: true, unique: true, immutable: true, index: true },
    uid: { type: String, required: true, immutable: true, index: true },
    universeId: { type: String, required: true, immutable: true, index: true },
    narrativeProfileId: { type: String, required: true, immutable: true, index: true },
    playerCharacterInstanceId: { type: String, required: true, immutable: true },
    targetCharacterId: { type: String, required: true, immutable: true },
    affinity: { type: Number, required: true, min: -100, max: 100, default: 0 },
    relationType: { type: String, default: "affinity" },
    status: { type: String, enum: ["active", "ended"], default: "active", index: true },
    sinceEventId: { type: String, default: "" },
    changedByEventIds: { type: [String], default: [] },
    reason: { type: String, default: "" },
    visibility: { type: String, enum: ["private", "shared"], default: "private" },
    relationVersion: { type: Number, required: true, min: 0, default: 0 },
  },
  { timestamps: true, strict: true, collection: "character_relations" },
);

CharacterRelationSchema.index(
  { uid: 1, universeId: 1, narrativeProfileId: 1, playerCharacterInstanceId: 1, targetCharacterId: 1 },
  { unique: true, name: "character_relation_identity_unique" },
);
