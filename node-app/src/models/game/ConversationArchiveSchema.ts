import { Schema, Document } from "mongoose";

/**
 * @docHint
 * @purpose MongoDB 스키마 정의
 * @process 주요 필드(userId, userPersonaId, personaId, universeId, date, messageCount) 및 인덱스/기본값 선언
 * @domain conversation
 * @scope db_schema
 */

export interface IConversationSummary {
  date: string; // YYYY-MM-DD 형식
  messageCount: number;
  intimacyChange: number;
  summary: string;
  keyTopics: string[];
  emotionalTone: "positive" | "neutral" | "negative";
  importance: number; // 1-10 중요도 점수
  sourceSessionCount: number;
  sourceFingerprint: string;
  sourceLastMessageAt?: Date;
  updatedAt: Date;
  summaryModel?: string;
}

export interface IConversationPeriodSummary {
  periodKey: string;
  startDate: string;
  endDate: string;
  summary: string;
  totalMessages: number;
  intimacyChange: number;
  keyEvents: string[];
  importance: number;
  sourceCount: number;
  sourceFingerprint: string;
  updatedAt: Date;
  summaryModel?: string;
}

export interface IConversationImportantFact {
  category: "profile" | "goal" | "preference" | "taboo" | "relationship" | "learning";
  key: string;
  value: string;
  confidence: number;
  importance: number;
  updatedAt: Date;
  sourcePeriod: "session" | "daily" | "weekly" | "monthly" | "yearly";
  sourceRef: string;
}

export interface IConversationArchive extends Document {
  userId: string;
  userPersonaId: string;
  personaId: string;
  universeId?: string;

  // 일별 요약
  dailySummaries: IConversationSummary[];

  // 주별 요약
  weeklySummaries: IConversationPeriodSummary[];

  // 월별 요약 (장기 보관용)
  monthlySummaries: IConversationPeriodSummary[];

  // 연간 요약
  yearlySummaries: IConversationPeriodSummary[];

  // 장기 기억으로 승격된 구조화 사실
  importantFacts: IConversationImportantFact[];

  // 메타데이터
  lastProcessedDate: Date;
  totalArchivedMessages: number;
  rollupState?: {
    lastDailyRollupAt?: Date;
    lastWeeklyRollupAt?: Date;
    lastMonthlyRollupAt?: Date;
    lastYearlyRollupAt?: Date;
    lastRawPrunedAt?: Date;
  };
}

export const ConversationArchiveSchema = new Schema<IConversationArchive>(
  {
    userId: { type: String, required: true },
    userPersonaId: { type: String, required: true },
    personaId: { type: String, required: true },
    universeId: { type: String, required: false, index: true },

    dailySummaries: [
      {
        date: { type: String, required: true },
        messageCount: { type: Number, default: 0 },
        intimacyChange: { type: Number, default: 0 },
        summary: { type: String, required: true },
        keyTopics: [String],
        emotionalTone: {
          type: String,
          enum: ["positive", "neutral", "negative"],
          default: "neutral",
        },
        importance: { type: Number, min: 1, max: 10, default: 5 },
        sourceSessionCount: { type: Number, default: 0 },
        sourceFingerprint: { type: String, default: "" },
        sourceLastMessageAt: { type: Date },
        updatedAt: { type: Date, default: Date.now },
        summaryModel: { type: String, default: "" },
      },
    ],

    weeklySummaries: [
      {
        periodKey: { type: String, required: true },
        startDate: { type: String, required: true },
        endDate: { type: String, required: true },
        summary: { type: String, required: true },
        totalMessages: { type: Number, default: 0 },
        intimacyChange: { type: Number, default: 0 },
        keyEvents: [String],
        importance: { type: Number, min: 1, max: 10, default: 5 },
        sourceCount: { type: Number, default: 0 },
        sourceFingerprint: { type: String, default: "" },
        updatedAt: { type: Date, default: Date.now },
        summaryModel: { type: String, default: "" },
      },
    ],

    monthlySummaries: [
      {
        periodKey: { type: String, required: true },
        startDate: { type: String, required: true },
        endDate: { type: String, required: true },
        summary: { type: String, required: true },
        totalMessages: { type: Number, default: 0 },
        intimacyChange: { type: Number, default: 0 },
        keyEvents: [String],
        importance: { type: Number, min: 1, max: 10, default: 5 },
        sourceCount: { type: Number, default: 0 },
        sourceFingerprint: { type: String, default: "" },
        updatedAt: { type: Date, default: Date.now },
        summaryModel: { type: String, default: "" },
      },
    ],

    yearlySummaries: [
      {
        periodKey: { type: String, required: true },
        startDate: { type: String, required: true },
        endDate: { type: String, required: true },
        summary: { type: String, required: true },
        totalMessages: { type: Number, default: 0 },
        intimacyChange: { type: Number, default: 0 },
        keyEvents: [String],
        importance: { type: Number, min: 1, max: 10, default: 5 },
        sourceCount: { type: Number, default: 0 },
        sourceFingerprint: { type: String, default: "" },
        updatedAt: { type: Date, default: Date.now },
        summaryModel: { type: String, default: "" },
      },
    ],

    importantFacts: [
      {
        category: {
          type: String,
          enum: ["profile", "goal", "preference", "taboo", "relationship", "learning"],
          required: true,
        },
        key: { type: String, required: true },
        value: { type: String, required: true },
        confidence: { type: Number, min: 0, max: 1, default: 0.5 },
        importance: { type: Number, min: 1, max: 10, default: 5 },
        updatedAt: { type: Date, default: Date.now },
        sourcePeriod: {
          type: String,
          enum: ["session", "daily", "weekly", "monthly", "yearly"],
          required: true,
        },
        sourceRef: { type: String, required: true },
      },
    ],

    lastProcessedDate: { type: Date, default: Date.now },
    totalArchivedMessages: { type: Number, default: 0 },
    rollupState: {
      lastDailyRollupAt: { type: Date },
      lastWeeklyRollupAt: { type: Date },
      lastMonthlyRollupAt: { type: Date },
      lastYearlyRollupAt: { type: Date },
      lastRawPrunedAt: { type: Date },
    },
  },
  { timestamps: true }
);

ConversationArchiveSchema.index(
  { userId: 1, userPersonaId: 1, personaId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      userPersonaId: { $exists: true, $type: "string" },
      universeId: { $exists: false },
    },
  }
);
ConversationArchiveSchema.index(
  { userId: 1, userPersonaId: 1, personaId: 1, universeId: 1 },
  { unique: true, partialFilterExpression: { universeId: { $exists: true, $type: "string" } } }
);
