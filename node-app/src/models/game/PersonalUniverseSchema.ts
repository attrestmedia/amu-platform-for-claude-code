import { Schema, type Document } from "mongoose";
import {
  PERSONAL_UNIVERSE_STATUS_VALUES,
  PERSONAL_UNIVERSE_VISIBILITY_VALUES,
  type IPersonalUniverseDoc,
  type PersonalUniverseOfficialCanonReference,
} from "types/game";

export interface IPersonalUniverseDocument extends Document, IPersonalUniverseDoc {}

const OfficialCanonReferenceSchema = new Schema<PersonalUniverseOfficialCanonReference>(
  {
    officialUniverseId: { type: String, required: true, immutable: true },
    entityType: { type: String, required: true, immutable: true },
    entityId: { type: String, required: true, immutable: true },
    revision: { type: Number, required: true, min: 1, immutable: true },
    declaredAt: { type: Date, required: true, default: Date.now, immutable: true },
  },
  { _id: false, strict: true },
);

export const PersonalUniverseSchema = new Schema<IPersonalUniverseDocument>(
  {
    uid: { type: String, required: true, immutable: true, index: true },
    personalUniverseId: { type: String, required: true, unique: true, immutable: true, index: true },
    status: { type: String, enum: PERSONAL_UNIVERSE_STATUS_VALUES, required: true, default: "active", index: true },
    visibility: { type: String, enum: PERSONAL_UNIVERSE_VISIBILITY_VALUES, required: true, default: "private", index: true },
    rulesetUniverseId: { type: String, required: true, immutable: true, index: true },
    referencedOfficialCanon: { type: [OfficialCanonReferenceSchema], default: [], validate: { validator: (value: unknown[]) => value.length <= 50, message: "referencedOfficialCanon exceeds 50 entries" } },
  },
  { timestamps: true, strict: true, collection: "personal_universes" },
);

PersonalUniverseSchema.index(
  { uid: 1 },
  { unique: true, partialFilterExpression: { status: "active" }, name: "personal_universe_active_uid_unique" },
);
