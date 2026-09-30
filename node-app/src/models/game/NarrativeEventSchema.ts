import { Schema, type Document } from "mongoose";
import {
  NARRATIVE_EVENT_SOURCE_VALUES,
  NARRATIVE_EVENT_STATUS_VALUES,
  NARRATIVE_TRANSITION_VALUES,
  type INarrativeEventDoc,
} from "types/game";

/**
 * @docHint
 * @purpose Personal Canon append-only Narrative Event ledger 모델
 * @process idempotency key 고정  outcome 상태 전이  reducer replay 근거 보관
 * @domain narrative-runtime
 * @scope database
 */

export interface INarrativeEventDocument extends Document, INarrativeEventDoc {}

const OutcomeSchema = new Schema(
  {
    source: { type: String, enum: NARRATIVE_EVENT_SOURCE_VALUES, required: true, immutable: true },
    transition: { type: String, enum: NARRATIVE_TRANSITION_VALUES, required: true, immutable: true },
    payload: { type: Schema.Types.Mixed, required: true, immutable: true },
    resolverVersion: { type: Number, required: true, min: 1, immutable: true },
  },
  { _id: false, strict: true },
);

export const NarrativeEventSchema = new Schema<INarrativeEventDocument>(
  {
    eventId: { type: String, required: true, unique: true, immutable: true, index: true },
    idempotencyKey: { type: String, required: true, immutable: true },
    uid: { type: String, required: true, immutable: true, index: true },
    universeId: { type: String, required: true, immutable: true, index: true },
    narrativeProfileId: { type: String, required: true, immutable: true, index: true },
    source: { type: String, enum: NARRATIVE_EVENT_SOURCE_VALUES, required: true, immutable: true },
    status: { type: String, enum: NARRATIVE_EVENT_STATUS_VALUES, required: true, default: "prepared", index: true },
    outcome: { type: OutcomeSchema, required: true, immutable: true },
    outcomeHash: { type: String, required: true, immutable: true },
    beforeVersion: { type: Number, required: true, min: 0, immutable: true },
    afterVersion: { type: Number, min: 1, default: null },
    operationId: { type: String, default: "", immutable: true },
    applyingAt: { type: Date, default: null },
    appliedAt: { type: Date, default: null },
  },
  { timestamps: true, strict: true, collection: "narrative_events" },
);

NarrativeEventSchema.index(
  { uid: 1, universeId: 1, narrativeProfileId: 1, idempotencyKey: 1 },
  { unique: true, name: "narrative_event_idempotency_unique" },
);
NarrativeEventSchema.index({ uid: 1, universeId: 1, createdAt: 1 }, { name: "narrative_event_replay_order" });
