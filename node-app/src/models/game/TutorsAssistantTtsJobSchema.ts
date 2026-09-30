import { Schema, type Document } from "mongoose";

/**
 * @docHint
 * @purpose EL-602 Tutors Assistant TTS durable job 컬렉션 스키마
 * @process uid·메시지 참조(revision hash 고정)·voice snapshot·operation ID·상태·lease만 저장
 * @domain tutors-tts
 * @scope db_schema
 *
 * 원문 텍스트와 오디오 바이트는 중복 저장하지 않는다. TTL 인덱스를 두지 않는다 —
 * unknown_outcome 과금 조사 증거를 자동 삭제하지 않기 위해 cleaner가 상태를 확인하고 지운다.
 */

export const TUTORS_ASSISTANT_TTS_JOB_STATUS_TYPES = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "unknown_outcome",
] as const;

export type TutorsAssistantTtsJobStatusType = (typeof TUTORS_ASSISTANT_TTS_JOB_STATUS_TYPES)[number];

export interface ITutorsAssistantTtsJobDocument extends Document {
  jobId: string;
  uid: string;
  /** 대화 저장소 소유 키(user.ID). uid와 다를 수 있다. */
  ownerUserId: string;
  operationKey: string;
  status: TutorsAssistantTtsJobStatusType;
  attempt: number;
  lease: { token: string; expiresAt: Date } | null;
  messageRef: {
    userId: string;
    personaId: string;
    userPersonaId?: string;
    universeId?: string;
    sessionId: string;
    assistantClientId: string;
  };
  contentHash: string;
  voice: {
    provider: "elevenlabs";
    voiceId: string;
    modelName: string;
    locale: string;
    voiceRevision: string;
    voiceFingerprint: string;
  } | null;
  stageOperationId: string;
  consentVersion: string;
  priceSnapshot?: Record<string, unknown> | null;
  providerRequestId?: string | null;
  billingRef?: Record<string, unknown> | null;
  expiresAt: Date;
}

const LeaseSchema = new Schema(
  {
    token: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  { _id: false },
);

const MessageRefSchema = new Schema(
  {
    userId: { type: String, required: true },
    personaId: { type: String, required: true },
    userPersonaId: { type: String, default: undefined },
    universeId: { type: String, default: undefined },
    sessionId: { type: String, required: true },
    assistantClientId: { type: String, required: true },
  },
  { _id: false },
);

const VoiceSnapshotSchema = new Schema(
  {
    provider: { type: String, enum: ["elevenlabs"], required: true },
    voiceId: { type: String, required: true },
    modelName: { type: String, required: true },
    locale: { type: String, required: true },
    voiceRevision: { type: String, required: true },
    voiceFingerprint: { type: String, required: true },
  },
  { _id: false },
);

export const TutorsAssistantTtsJobSchema = new Schema<ITutorsAssistantTtsJobDocument>(
  {
    jobId: { type: String, required: true, unique: true, index: true },
    uid: { type: String, required: true, index: true },
    ownerUserId: { type: String, required: true, index: true },
    operationKey: { type: String, required: true, unique: true, index: true },
    status: {
      type: String,
      enum: TUTORS_ASSISTANT_TTS_JOB_STATUS_TYPES,
      required: true,
      default: "queued",
      index: true,
    },
    attempt: { type: Number, required: true, default: 0 },
    lease: { type: LeaseSchema, default: null },
    messageRef: { type: MessageRefSchema, required: true },
    contentHash: { type: String, required: true },
    voice: { type: VoiceSnapshotSchema, default: null },
    stageOperationId: { type: String, required: true },
    consentVersion: { type: String, required: true, default: "" },
    priceSnapshot: { type: Schema.Types.Mixed, default: null },
    providerRequestId: { type: String, default: null },
    billingRef: { type: Schema.Types.Mixed, default: null },
    expiresAt: { type: Date, required: true, index: true },
  },
  { timestamps: true, collection: "tutors_assistant_tts_jobs" },
);

TutorsAssistantTtsJobSchema.index({ uid: 1, status: 1, createdAt: 1 });
