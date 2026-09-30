import { Schema, type Document } from "mongoose";
import {
  TUTOR_PLAY_PROJECTION_LEDGER_STATUS_VALUES,
  TUTOR_PLAY_PROJECTION_SCHEMA_VERSION,
  TUTOR_PLAY_TIME_SUMMARY_VALUES,
  type ITutorPlayProjectionDailyUsageDoc,
  type ITutorPlayProjectionLedgerDoc,
} from "types/game";

const TutorPlayRelationChangeSchema = new Schema(
  {
    targetCharacterId: { type: String, required: true, immutable: true },
    relationType: { type: String, required: true, immutable: true },
    delta: { type: Number, required: true, min: -10, max: 10, immutable: true },
  },
  { _id: false, strict: true },
);
const TutorPlayDerivedSignalsSchema = new Schema(
  {
    schemaVersion: { type: Number, required: true, enum: [TUTOR_PLAY_PROJECTION_SCHEMA_VERSION], immutable: true },
    source: { type: String, required: true, enum: ["learning_evaluation"], immutable: true },
    sourceEvaluationId: { type: String, required: true, immutable: true },
    sourceSessionId: { type: String, required: true, immutable: true },
    topicIds: { type: [String], required: true, immutable: true },
    achievementKey: { type: String, required: true, immutable: true },
    timeSummary: { type: String, required: true, enum: TUTOR_PLAY_TIME_SUMMARY_VALUES, immutable: true },
    occurredDay: { type: String, required: true, immutable: true },
    relationChange: { type: TutorPlayRelationChangeSchema, default: undefined, immutable: true },
  },
  { _id: false, strict: true },
);

export interface ITutorPlayProjectionLedgerDocument extends Document, ITutorPlayProjectionLedgerDoc {}
export interface ITutorPlayProjectionDailyUsageDocument extends Document, ITutorPlayProjectionDailyUsageDoc {}

export const TutorPlayProjectionLedgerSchema = new Schema<ITutorPlayProjectionLedgerDocument>(
  {
    projectionId: { type: String, required: true, unique: true, immutable: true, index: true },
    uid: { type: String, required: true, immutable: true, index: true },
    universeId: { type: String, required: true, immutable: true, index: true },
    source: { type: String, required: true, enum: ["learning_evaluation"], immutable: true },
    sourceEvaluationId: { type: String, required: true, immutable: true, index: true },
    sourceSessionId: { type: String, required: true, immutable: true },
    idempotencyKey: { type: String, required: true, immutable: true },
    dailyBucket: { type: String, required: true, immutable: true, index: true },
    xp: { type: Number, required: true, min: 0, immutable: true },
    dailyCap: { type: Number, required: true, min: 1, immutable: true },
    status: { type: String, required: true, enum: TUTOR_PLAY_PROJECTION_LEDGER_STATUS_VALUES, index: true },
    consentVersion: { type: String, required: true, immutable: true },
    signals: { type: TutorPlayDerivedSignalsSchema, required: true, immutable: true },
    reservedAt: { type: Date, default: null, immutable: true },
    appliedAt: { type: Date, default: null },
    releasedAt: { type: Date, default: null },
  },
  { timestamps: true, strict: true, collection: "tutor_play_projection_ledger" },
);

TutorPlayProjectionLedgerSchema.index(
  { uid: 1, idempotencyKey: 1 },
  { unique: true, name: "tutor_play_projection_idempotency_unique" },
);
TutorPlayProjectionLedgerSchema.index(
  { uid: 1, dailyBucket: 1, status: 1 },
  { name: "tutor_play_projection_daily_status" },
);

export const TutorPlayProjectionDailyUsageSchema = new Schema<ITutorPlayProjectionDailyUsageDocument>(
  {
    usageId: { type: String, required: true, unique: true, immutable: true, index: true },
    uid: { type: String, required: true, immutable: true, index: true },
    dailyBucket: { type: String, required: true, immutable: true, index: true },
    dailyCap: { type: Number, required: true, min: 1, immutable: true },
    reservedXp: { type: Number, required: true, min: 0, default: 0 },
    awardedXp: { type: Number, required: true, min: 0, default: 0 },
  },
  { timestamps: true, strict: true, collection: "tutor_play_projection_daily_usage" },
);

TutorPlayProjectionDailyUsageSchema.index(
  { uid: 1, dailyBucket: 1 },
  { unique: true, name: "tutor_play_projection_daily_identity_unique" },
);
