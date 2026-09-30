import { Schema, Document } from "mongoose";

/**
 * @docHint
 * @purpose MongoDB 스키마 정의
 * @process 주요 필드(stats, userId, userPersonaId, personaId, universeId, postId) 및 인덱스/기본값 선언
 * @domain conversation
 * @scope db_schema
 */

export interface IKnowledgeItem {
  postId: number; // WP 포스트 ID
  title: string;
  content: string; // 포스트 전체 내용 또는 요약
  excerpt?: string; // 포스트 요약
  categories: number[]; // 카테고리 ID 배열
  tags: string[]; // 태그 배열
  dateAdded: Date; // 지식 추가 날짜
  dateUsed: Date; // 마지막 사용 날짜
  usageCount: number; // 사용 횟수
  effectiveness: number; // 지식 효과도 (1-10, 대화 품질 향상 지표)
}

export interface IConversationKnowledge extends Document {
  userId: string;
  userPersonaId: string;
  personaId: string;
  universeId: string;

  // 캐릭터별 지식 목록
  knowledgeItems: IKnowledgeItem[];

  // 현재 활성화된 지식 (프롬프트에 포함될 지식)
  activeKnowledge: number[]; // postId 배열, 최대 3-5개 제한

  // 통계 정보
  stats: {
    totalKnowledgeAdded: number;
    totalUsage: number;
    averageEffectiveness: number;
    lastUpdated: Date;
  };
}

const ConversationKnowledgeSchema = new Schema<IConversationKnowledge>(
  {
    userId: { type: String, required: true },
    userPersonaId: { type: String, required: true },
    personaId: { type: String, required: true },
    universeId: { type: String, required: true },

    knowledgeItems: [
      {
        postId: { type: Number, required: true },
        title: { type: String, required: true },
        content: { type: String, required: true },
        excerpt: String,
        categories: [Number],
        tags: [String],
        dateAdded: { type: Date, default: Date.now },
        dateUsed: { type: Date, default: Date.now },
        usageCount: { type: Number, default: 0 },
        effectiveness: { type: Number, default: 5, min: 1, max: 10 },
      },
    ],

    activeKnowledge: [Number],

    stats: {
      totalKnowledgeAdded: { type: Number, default: 0 },
      totalUsage: { type: Number, default: 0 },
      averageEffectiveness: { type: Number, default: 5 },
      lastUpdated: { type: Date, default: Date.now },
    },
  },
  { timestamps: true }
);

// 동일 userPersonaId/personaId라도 universeId가 다르면 별도 문서가 필요함(충돌 방지)
ConversationKnowledgeSchema.index({ userPersonaId: 1, personaId: 1, universeId: 1 }, { unique: true });
ConversationKnowledgeSchema.index({ userId: 1, universeId: 1 });

export { ConversationKnowledgeSchema };
