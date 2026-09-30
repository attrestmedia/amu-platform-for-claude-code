import { Schema, Document } from "mongoose";
import { type IntimacyLevelType, INTIMACY_LEVEL_TYPES } from "consts/game";

/**
 * @docHint
 * @purpose MongoDB 스키마 정의
 * @process 주요 필드(relationship, sharedContext, userId, userPersonaId, personaId, universeId) 및 인덱스/기본값 선언
 * @domain conversation
 * @scope db_schema
 */

export interface IConversationData extends Document {
  userId: string;
  userPersonaId?: string;
  personaId: string;
  universeId?: string;

  // 관계 정보
  relationship: {
    intimacy: number; // 친밀도
    intimacyLevel: IntimacyLevelType; // 친밀도에 따른 관계 레벨
    // 친밀도 변화 이력 관리
    intimacyHistory: Array<{
      change: number; // 변화량 (+/-)
      reason: string; // 변화 이유
      timestamp: Date; // 변화 시간
    }>;
    meetCount: number; // 만남 횟수
    isControllable: boolean; // 컨트롤 가능 여부
    isFriendship: boolean; // 아티팩트 소유 여부
    isOwned: boolean; // 페르소나에 대한 소유권 **(소유권 설정 시 다른 유저는 선택 할 수 없음, 기존 원본 페르소나 데이터에도 `owner: userId`의 형식으로 플래그 추가)
    firstMet: Date; // 처음 만난 날짜
    lastInteraction: Date; // 마지막 접촉 날짜
    specialEvents: Array<{
      eventType: string;
      date: Date;
      description: string;
    }>;
  };

  // 공유 컨텍스트
  sharedContext: {
    learnedInfo: string[];
  };
}

const ConversationSchema = new Schema<IConversationData>(
  {
    userId: { type: String, required: true },
    userPersonaId: { type: String, required: false },
    personaId: { type: String, required: true },
    universeId: { type: String, required: false },

    relationship: {
      intimacy: { type: Number, default: 0 },
      intimacyLevel: {
        type: String,
        enum: INTIMACY_LEVEL_TYPES,
        default: "stranger",
      },
      intimacyHistory: [
        {
          change: { type: Number, default: 0 },
          reason: { type: String, default: "" },
          timestamp: { type: Date, default: Date.now },
        },
      ],
      meetCount: { type: Number, default: 0 },
      isControllable: { type: Boolean, default: false },
      isFriendship: { type: Boolean, default: false },
      isOwned: { type: Boolean, default: false },
      firstMet: { type: Date, default: Date.now },
      lastInteraction: { type: Date, default: Date.now },
      specialEvents: [
        {
          eventType: String,
          date: { type: Date, default: Date.now },
          description: String,
        },
      ],
    },

    sharedContext: {
      learnedInfo: { type: [String], default: [] },
    },
  },
  { timestamps: true }
);

// userPersonaId, personaId의 조합으로 유일성 보장, 한 사용자의 다양한 페르소나가 동일한 NPC와 대화할 수 있도록 함
ConversationSchema.index(
  { userId: 1, personaId: 1, userPersonaId: 1 },
  { unique: true, partialFilterExpression: { userPersonaId: { $exists: true, $type: "string" } } }
);
ConversationSchema.index(
  { userId: 1, personaId: 1, universeId: 1 },
  { unique: true, partialFilterExpression: { universeId: { $exists: true, $type: "string" } } }
);

export { ConversationSchema };
