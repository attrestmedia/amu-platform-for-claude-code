import { Schema } from "mongoose";
import { TUTORS_NEW_MEASUREMENT_EVENTS } from "consts/tutorsMeasurement";

/**
 * @docHint
 * @purpose Play 파일럿 내부 allowlist cohort 계측 이벤트 저장 모델 (OOC-053)
 * @process allowlist metric enum  idempotencyKey unique로 중복 이벤트 방지  PII 필드 저장 금지
 * @domain play-narrative
 * @scope db_schema
 */

export const NARRATIVE_PILOT_METRIC_VALUES = [
  // Play (OOC-053)
  "story_continuation",
  "discovery_attempt",
  "discovery_completed",
  "return_to_play",
  "conversation_depth",
  "magazine_return",
  "creation_attempt",
  "creation_retry",
  // Tutors (OOC-063)
  "learning_completion",
  "correction_quality",
  "narrative_continuation",
  "opt_out",
  // EL-603 Voice 파일럿 key 가산 — 기록은 default-off다.
  "voice_playback_start",
  "voice_playback_failure",
  "voice_text_only_fallback",
  "voice_latency_bucket",
  // TUTORS-200-D3 — 실제 GA 발화는 TUTORS-220에서 연결한다.
  ...TUTORS_NEW_MEASUREMENT_EVENTS,
] as const;

export type NarrativePilotMetricType = (typeof NARRATIVE_PILOT_METRIC_VALUES)[number];

export interface INarrativePilotMetricDocument {
  metricId: string;
  uid: string;
  universeId: string;
  metric: NarrativePilotMetricType;
  idempotencyKey: string;
  detail: Record<string, string | number | boolean>;
  createdAt: Date;
}

export const NarrativePilotMetricSchema = new Schema<INarrativePilotMetricDocument>(
  {
    metricId: { type: String, required: true, unique: true, index: true },
    uid: { type: String, required: true, index: true },
    universeId: { type: String, required: true, index: true },
    metric: { type: String, enum: NARRATIVE_PILOT_METRIC_VALUES, required: true, index: true },
    idempotencyKey: { type: String, required: true },
    detail: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, strict: true, collection: "narrative_pilot_metrics" },
);

NarrativePilotMetricSchema.index(
  { universeId: 1, metric: 1, idempotencyKey: 1 },
  { unique: true, name: "narrative_pilot_metric_idempotent" },
);
