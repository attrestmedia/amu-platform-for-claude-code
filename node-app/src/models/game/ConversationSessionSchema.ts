import { Schema, Document } from "mongoose";

/**
 * @docHint
 * @purpose MongoDB 스키마 정의
 * @process 주요 필드(userId, personaId, userPersonaId, universeId, sessionId, date) 및 인덱스/기본값 선언
 * @domain conversation
 * @scope db_schema
 */

export interface IConversationSessionDoc extends Document {
  userId: string;
  personaId: string;
  userPersonaId?: string;
  universeId?: string;

  sessionId: string;
  date: Date;
  location: string;
  summary?: string;
  summaryUpdatedAt?: Date;
  summarySourceMessageCount: number;
  summaryModel?: string;

  messageCount: number;
  userMessageCount: number;
  assistantMessageCount: number;
  voiceInputCount: number;
  completionStatus?: "completed" | "rejected";
  completedAt?: Date;
  completionEventKey?: string;
  testScore?: number;
  firstMessageAt: Date;
  lastMessageAt: Date;
}

export const ConversationSessionSchema = new Schema<IConversationSessionDoc>(
  {
    userId: { type: String, required: true, index: true },
    personaId: { type: String, required: true, index: true },
    userPersonaId: { type: String, required: false, index: true },
    universeId: { type: String, required: false, index: true },

    sessionId: { type: String, required: true },
    date: { type: Date, default: Date.now },
    location: { type: String, default: "unknown" },
    summary: { type: String },
    summaryUpdatedAt: { type: Date },
    summarySourceMessageCount: { type: Number, default: 0 },
    summaryModel: { type: String },

    messageCount: { type: Number, default: 0 },
    userMessageCount: { type: Number, default: 0 },
    assistantMessageCount: { type: Number, default: 0 },
    voiceInputCount: { type: Number, default: 0 },
    completionStatus: { type: String, enum: ["completed", "rejected"] },
    completedAt: { type: Date },
    completionEventKey: { type: String },
    testScore: { type: Number, min: 0, max: 100 },
    firstMessageAt: { type: Date, default: Date.now },
    lastMessageAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// 로그인 세션 유니크
ConversationSessionSchema.index(
  { userId: 1, personaId: 1, userPersonaId: 1, sessionId: 1 },
  { unique: true, partialFilterExpression: { userPersonaId: { $exists: true, $type: "string" } } }
);

// 게스트 세션 유니크
ConversationSessionSchema.index(
  { userId: 1, personaId: 1, universeId: 1, sessionId: 1 },
  { unique: true, partialFilterExpression: { universeId: { $exists: true, $type: "string" } } }
);

// 조회 최적화
ConversationSessionSchema.index({ userId: 1, personaId: 1, userPersonaId: 1, date: 1 });
ConversationSessionSchema.index({ userId: 1, personaId: 1, universeId: 1, date: 1 });
ConversationSessionSchema.index({ userId: 1, completionStatus: 1, completedAt: -1 });
