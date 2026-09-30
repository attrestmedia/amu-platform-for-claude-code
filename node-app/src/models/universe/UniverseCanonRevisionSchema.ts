import { Schema, type Document } from "mongoose";
import {
  CANON_ACTOR_TYPE_VALUES,
  CANON_ENTITY_TYPE_VALUES,
  CANON_LAYER_VALUES,
  CANON_REVISION_STATUS_VALUES,
  type IUniverseCanonRevisionDoc,
} from "types/game";

/**
 * @docHint
 * @purpose 공식 Universe Canon revision 저장 모델
 * @process entity별 revision 저장  draft/review/published 상태 보관  published payload 보호
 * @domain narrative-canon
 * @scope database
 */

export interface IUniverseCanonRevisionDocument extends Document, IUniverseCanonRevisionDoc {}

export const UniverseCanonRevisionSchema = new Schema<IUniverseCanonRevisionDocument>(
  {
    revisionId: { type: String, required: true, unique: true, immutable: true, index: true },
    universeId: { type: String, required: true, immutable: true, index: true },
    layer: { type: String, enum: CANON_LAYER_VALUES, required: true, immutable: true },
    entityType: { type: String, enum: CANON_ENTITY_TYPE_VALUES, required: true, immutable: true },
    entityId: { type: String, required: true, immutable: true, index: true },
    revision: { type: Number, required: true, min: 1, immutable: true },
    status: { type: String, enum: CANON_REVISION_STATUS_VALUES, required: true, default: "draft", index: true },
    payload: { type: Schema.Types.Mixed, required: true, immutable: true },
    payloadHash: { type: String, required: true, immutable: true },
    createdBy: { type: String, required: true, immutable: true },
    createdByType: { type: String, enum: CANON_ACTOR_TYPE_VALUES, required: true, immutable: true },
    reviewedBy: { type: String, default: "" },
    publishedBy: { type: String, default: "" },
    publishedAt: { type: Date, default: null },
    supersedesRevision: { type: Number, min: 1, default: null, immutable: true },
    changelog: { type: String, default: "", maxlength: 2000, immutable: true },
  },
  { timestamps: true, strict: true, collection: "universe_canon_revisions" },
);

UniverseCanonRevisionSchema.index(
  { universeId: 1, entityType: 1, entityId: 1, revision: 1 },
  { unique: true, name: "universe_canon_entity_revision_unique" },
);
UniverseCanonRevisionSchema.index(
  { universeId: 1, status: 1, layer: 1, entityType: 1, revision: -1 },
  { name: "universe_canon_status_lookup" },
);
