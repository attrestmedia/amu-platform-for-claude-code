import { Schema, type Document } from "mongoose";
import {
  CROSS_SERVICE_MEMORY_CONSENT_VALUES,
  NARRATIVE_PERSONAL_CANON_STATUS_VALUES,
  type INarrativePrivacyPreferenceDoc,
} from "types/game";

/**
 * @docHint
 * @purpose Narrative Runtime의 사용자별 수집·cross-service 동의 모델
 * @process opt-in 상태 저장  동의 철회 시 projection 차단  계정 삭제 allowlist 연결
 * @domain narrative-privacy
 * @scope database
 */

export interface INarrativePrivacyPreferenceDocument extends Document, INarrativePrivacyPreferenceDoc {}

const ConsentHistorySchema = new Schema(
  {
    personalCanonStatus: { type: String, enum: NARRATIVE_PERSONAL_CANON_STATUS_VALUES, required: true },
    crossServiceMemoryConsent: { type: String, enum: CROSS_SERVICE_MEMORY_CONSENT_VALUES, required: true },
    crossServiceConsentVersion: { type: String, default: null },
    consentVersion: { type: String, required: true },
    changedAt: { type: Date, required: true },
  },
  { _id: false, strict: true },
);

export const NarrativePrivacyPreferenceSchema = new Schema<INarrativePrivacyPreferenceDocument>(
  {
    uid: { type: String, required: true, unique: true, index: true, immutable: true },
    personalCanonStatus: {
      type: String,
      enum: NARRATIVE_PERSONAL_CANON_STATUS_VALUES,
      required: true,
      default: "opted_out",
    },
    crossServiceMemoryConsent: {
      type: String,
      enum: CROSS_SERVICE_MEMORY_CONSENT_VALUES,
      required: true,
      default: "not_granted",
    },
    crossServiceConsentVersion: { type: String, default: null },
    consentVersion: { type: String, required: true, default: "narrative-lifecycle-v1" },
    consentedAt: { type: Date, default: null },
    withdrawnAt: { type: Date, default: null },
    history: { type: [ConsentHistorySchema], default: [] },
  },
  { timestamps: true, strict: true, collection: "narrative_privacy_preferences" },
);
