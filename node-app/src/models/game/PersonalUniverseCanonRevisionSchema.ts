import { Schema, type Document } from "mongoose";
import {
  CANON_ENTITY_TYPE_VALUES,
  CANON_LAYER_VALUES,
  CANON_REVISION_STATUS_VALUES,
  PERSONAL_CANON_ACTOR_TYPE_VALUES,
  type IPersonalUniverseCanonRevisionDoc,
} from "types/game";

export interface IPersonalUniverseCanonRevisionDocument extends Document, IPersonalUniverseCanonRevisionDoc {}

export const PersonalUniverseCanonRevisionSchema = new Schema<IPersonalUniverseCanonRevisionDocument>(
  {
    revisionId: { type: String, required: true, unique: true, immutable: true, index: true },
    namespace: { type: String, enum: ["personal-universe"], required: true, default: "personal-universe", immutable: true },
    personalUniverseId: { type: String, required: true, immutable: true, index: true },
    ownerUid: { type: String, required: true, immutable: true, index: true },
    layer: { type: String, enum: CANON_LAYER_VALUES, required: true, immutable: true },
    entityType: { type: String, enum: CANON_ENTITY_TYPE_VALUES, required: true, immutable: true },
    entityId: { type: String, required: true, immutable: true, index: true },
    revision: { type: Number, required: true, min: 1, immutable: true },
    status: { type: String, enum: CANON_REVISION_STATUS_VALUES, required: true, default: "draft", index: true },
    payload: { type: Schema.Types.Mixed, required: true, immutable: true },
    payloadHash: { type: String, required: true, immutable: true },
    createdBy: { type: String, required: true, immutable: true },
    createdByType: { type: String, enum: PERSONAL_CANON_ACTOR_TYPE_VALUES, required: true, immutable: true },
    reviewedBy: { type: String, default: "" },
    publishedBy: { type: String, default: "" },
    publishedAt: { type: Date, default: null },
    supersedesRevision: { type: Number, min: 1, default: null, immutable: true },
    changelog: { type: String, default: "", maxlength: 2000, immutable: true },
  },
  { timestamps: true, strict: true, collection: "personal_universe_canon_revisions" },
);

PersonalUniverseCanonRevisionSchema.index(
  { personalUniverseId: 1, entityType: 1, entityId: 1, revision: 1 },
  { unique: true, name: "personal_universe_canon_entity_revision_unique" },
);
PersonalUniverseCanonRevisionSchema.index(
  { personalUniverseId: 1, status: 1, layer: 1, entityType: 1, revision: -1 },
  { name: "personal_universe_canon_status_lookup" },
);
