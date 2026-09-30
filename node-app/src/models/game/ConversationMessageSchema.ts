import { Schema, Document } from "mongoose";
import { AI_MESSAGE_BASE_TYPES } from "consts/ai";

/**
 * @docHint
 * @purpose MongoDB 스키마 정의
 * @process 주요 필드(userId, personaId, userPersonaId, universeId, sessionId, role) 및 인덱스/기본값 선언
 * @domain conversation
 * @scope db_schema
 */

export interface IConversationMessageDoc extends Document {
  userId: string;
  personaId: string;
  userPersonaId?: string;
  universeId?: string;

  sessionId: string;

  role: (typeof AI_MESSAGE_BASE_TYPES)[number];
  content: string;
  timestamp: Date;

  clientId: string; // idempotent key
  translation?: string;
  systemCode?: string[];
  productCode?: string[];
  voiceInput?: {
    inputMode: "voice";
    voiceInputCount: 1;
  };
  audioMeta?: {
    provider?: string;
    voiceId?: string;
    modelName?: string;
    locale?: string;
    voiceFingerprint?: string;
    cacheKey?: string;
    contentType?: string;
    bytes?: number;
    durationMs?: number;
    storage?: Record<string, unknown>;
    status?: "pending" | "ready" | "failed";
    errorCode?: string;
    generatedAt?: Date;
  };
}

const AudioMetaSchema = new Schema(
  {
    provider: { type: String, enum: ["openai", "google", "elevenlabs"] },
    voiceId: { type: String },
    modelName: { type: String },
    locale: { type: String },
    voiceFingerprint: { type: String, index: true },
    cacheKey: { type: String, index: true },
    contentType: { type: String },
    bytes: { type: Number },
    durationMs: { type: Number },
    storage: { type: Schema.Types.Mixed, default: undefined },
    status: { type: String, enum: ["pending", "ready", "failed"] },
    errorCode: { type: String },
    generatedAt: { type: Date },
  },
  { _id: false },
);

const VoiceInputSchema = new Schema(
  {
    inputMode: { type: String, enum: ["voice"], required: true },
    voiceInputCount: { type: Number, enum: [1], required: true },
  },
  { _id: false },
);

export const ConversationMessageSchema = new Schema<IConversationMessageDoc>(
  {
    userId: { type: String, required: true, index: true },
    personaId: { type: String, required: true, index: true },
    userPersonaId: { type: String, required: false, index: true },
    universeId: { type: String, required: false, index: true },

    sessionId: { type: String, required: true, index: true },

    role: { type: String, enum: AI_MESSAGE_BASE_TYPES, required: true },
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now, index: true },

    clientId: { type: String, required: true },
    translation: { type: String, default: "" },
    systemCode: { type: [String], default: [] },
    productCode: { type: [String], default: [] },
    voiceInput: { type: VoiceInputSchema, default: undefined },
    audioMeta: { type: AudioMetaSchema, default: undefined },
  },
  { timestamps: true }
);

// 로그인 메시지 idempotent
ConversationMessageSchema.index(
  { userId: 1, personaId: 1, userPersonaId: 1, sessionId: 1, clientId: 1 },
  { unique: true, partialFilterExpression: { userPersonaId: { $exists: true, $type: "string" } } }
);

// 게스트 메시지 idempotent
ConversationMessageSchema.index(
  { userId: 1, personaId: 1, universeId: 1, sessionId: 1, clientId: 1 },
  { unique: true, partialFilterExpression: { universeId: { $exists: true, $type: "string" } } }
);

// 조회 최적화
ConversationMessageSchema.index({ userId: 1, personaId: 1, userPersonaId: 1, sessionId: 1, timestamp: 1 });
ConversationMessageSchema.index({ userId: 1, personaId: 1, universeId: 1, sessionId: 1, timestamp: 1 });
ConversationMessageSchema.index({ "audioMeta.storage.key": 1 });
