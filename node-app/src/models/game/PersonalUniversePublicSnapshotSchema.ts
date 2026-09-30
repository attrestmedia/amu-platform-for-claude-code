import { Schema, type Document } from "mongoose";
import {
  PUBLIC_UNIVERSE_ENTITY_TYPE_VALUES,
  PUBLIC_UNIVERSE_MODERATION_STATUS_VALUES,
  PUBLIC_UNIVERSE_REPORT_REASON_VALUES,
  PUBLIC_UNIVERSE_SNAPSHOT_SCHEMA_VERSION,
  PUBLIC_UNIVERSE_SNAPSHOT_STATUS_VALUES,
  PUBLIC_UNIVERSE_SNAPSHOT_VISIBILITY_VALUES,
  type IPersonalUniversePublicSnapshotDoc,
  type IPersonalUniversePublicSnapshotReportDoc,
  type PublicUniverseSnapshotContent,
  type PublicUniverseSnapshotEntity,
} from "types/game";

export interface IPersonalUniversePublicSnapshotDocument extends Document, IPersonalUniversePublicSnapshotDoc {}
export interface IPersonalUniversePublicSnapshotReportDocument extends Document, IPersonalUniversePublicSnapshotReportDoc {}

const PublicSnapshotEntitySchema = new Schema<PublicUniverseSnapshotEntity>(
  {
    entityType: { type: String, enum: PUBLIC_UNIVERSE_ENTITY_TYPE_VALUES, required: true },
    entityId: { type: String, required: true },
    title: { type: String, required: true, maxlength: 180 },
    summary: { type: String, default: "", maxlength: 600 },
    description: { type: String, default: "", maxlength: 1200 },
    worldName: { type: String, default: "", maxlength: 180 },
    premise: { type: String, default: "", maxlength: 1200 },
    rules: { type: [String], default: [] },
    sourceCharacterId: { type: String, default: "" },
    targetRefType: { type: String, default: "" },
    targetRefId: { type: String, default: "" },
    relationTypes: { type: [String], default: [] },
    strength: { type: Number, min: 0, max: 100, default: undefined },
    sinceEventId: { type: String, default: "" },
    regionId: { type: String, default: "" },
    factionId: { type: String, default: "" },
    characterIds: { type: [String], default: [] },
    relatedEventIds: { type: [String], default: [] },
    startOrder: { type: Number, min: 0, default: undefined },
    endOrder: { type: Number, min: 0, default: undefined },
  },
  { _id: false, strict: true },
);

const PublicSnapshotContentSchema = new Schema<PublicUniverseSnapshotContent>(
  {
    schemaVersion: { type: String, enum: [PUBLIC_UNIVERSE_SNAPSHOT_SCHEMA_VERSION], required: true },
    worldName: { type: String, required: true, maxlength: 180 },
    premise: { type: String, default: "", maxlength: 1200 },
    entities: { type: [PublicSnapshotEntitySchema], required: true, default: [] },
    counts: {
      type: new Schema(
        {
          characters: { type: Number, required: true, min: 0 },
          relations: { type: Number, required: true, min: 0 },
          events: { type: Number, required: true, min: 0 },
          regions: { type: Number, required: true, min: 0 },
          factions: { type: Number, required: true, min: 0 },
        },
        { _id: false, strict: true },
      ),
      required: true,
    },
  },
  { _id: false, strict: true },
);

export const PersonalUniversePublicSnapshotSchema = new Schema<IPersonalUniversePublicSnapshotDocument>(
  {
    snapshotId: { type: String, required: true, unique: true, immutable: true, index: true },
    personalUniverseId: { type: String, required: true, immutable: true, index: true },
    ownerUid: { type: String, required: true, immutable: true, index: true },
    visibility: { type: String, enum: PUBLIC_UNIVERSE_SNAPSHOT_VISIBILITY_VALUES, required: true, index: true },
    status: { type: String, enum: PUBLIC_UNIVERSE_SNAPSHOT_STATUS_VALUES, required: true, default: "draft", index: true },
    moderationStatus: { type: String, enum: PUBLIC_UNIVERSE_MODERATION_STATUS_VALUES, required: true, default: "pending", index: true },
    moderationPolicyVersion: { type: String, required: true },
    revision: { type: Number, required: true, min: 1, index: true },
    content: { type: PublicSnapshotContentSchema, required: true },
    publishedAt: { type: Date, default: null, index: true },
    withdrawnAt: { type: Date, default: null },
  },
  { timestamps: true, strict: true, collection: "personal_universe_public_snapshots" },
);

PersonalUniversePublicSnapshotSchema.index({ personalUniverseId: 1, revision: -1 });
PersonalUniversePublicSnapshotSchema.index({ visibility: 1, status: 1, moderationStatus: 1, publishedAt: -1 });

export const PersonalUniversePublicSnapshotReportSchema = new Schema<IPersonalUniversePublicSnapshotReportDocument>(
  {
    reportId: { type: String, required: true, unique: true, index: true },
    snapshotId: { type: String, required: true, index: true },
    ownerUid: { type: String, required: true, index: true },
    reporterUid: { type: String, required: true, index: true },
    reason: { type: String, enum: PUBLIC_UNIVERSE_REPORT_REASON_VALUES, required: true },
    note: { type: String, default: "", maxlength: 500 },
    status: { type: String, enum: ["pending", "resolved", "rejected"], required: true, default: "pending", index: true },
  },
  { timestamps: true, strict: true, collection: "personal_universe_public_snapshot_reports" },
);

PersonalUniversePublicSnapshotReportSchema.index(
  { snapshotId: 1, reporterUid: 1 },
  { unique: true, name: "personal_universe_public_snapshot_report_unique" },
);
