import { Schema, Document, Model } from "mongoose";
import { getModel } from "libs/database/modelCache";
import { MONGODB_CONVERSATIONS_URL } from "consts/env/server";

/**
 * @docHint
 * @purpose MongoDB 스키마 정의
 * @process 주요 필드(userId, npcId, interactionCount, dailyInteractions, default, lastInteracted) 및 인덱스/기본값 선언
 * @domain game
 * @scope db_schema
 */

interface INpcUsage extends Document {
  // 기존 필드들 (하위 호환성 유지)
  userId: string; // 사용자 ID
  npcId: string; // NPC ID
  interactionCount: number; // 총 상호작용 횟수 (누적)
  dailyInteractions: Record<string, number>; // 날짜별 상호작용 횟수 (YYYY-MM-DD: count)
  lastInteracted: Date; // 마지막 상호작용 시간

  // 새로운 최적화 필드들
  hourlyCount: number; // 현재 시간 내 상호작용 횟수
  dailyCount: number; // 현재 날짜 내 상호작용 횟수
  currentHour: string; // YYYY-MM-DD-HH 형식
  currentDay: string; // YYYY-MM-DD 형식
  limitExceededUntil?: Date; // 제한 해제 시간
}

const NpcUsageSchema = new Schema<INpcUsage>({
  // 기존 필드들 유지
  userId: {
    type: String,
    required: true,
    index: true, // 개선: 인덱스 추가
  },
  npcId: {
    type: String,
    required: true,
  },
  interactionCount: {
    type: Number,
    default: 0,
  },
  dailyInteractions: {
    type: Map,
    of: Number,
    default: {},
  },
  lastInteracted: {
    type: Date,
    default: Date.now,
    expires: 86400 * 30, // TTL 인덱스 (30일 후 자동 삭제)
  },

  // 새로운 최적화 필드들
  hourlyCount: {
    type: Number,
    default: 0,
  },
  dailyCount: {
    type: Number,
    default: 0,
  },
  currentHour: {
    type: String,
    required: false, // 기존 데이터 호환성을 위해 required: false
    index: true,
  },
  currentDay: {
    type: String,
    required: false, // 기존 데이터 호환성을 위해 required: false
    index: true,
  },
  limitExceededUntil: {
    type: Date,
  },
});

// 복합 인덱스 최적화
NpcUsageSchema.index({ userId: 1, npcId: 1 }, { unique: true });
NpcUsageSchema.index({ userId: 1, currentDay: 1 });
NpcUsageSchema.index(
  { limitExceededUntil: 1 },
  {
    expireAfterSeconds: 0, // limitExceededUntil 시간에 정확히 만료
    sparse: true, // null 값은 인덱스에서 제외
    background: true, // 백그라운드에서 인덱스 생성
  },
);

// 기존 함수명 유지 (하위 호환성)
export async function getNpcUsageModel(): Promise<Model<INpcUsage>> {
  return getModel<INpcUsage>(MONGODB_CONVERSATIONS_URL, "NpcUsage", NpcUsageSchema);
}

// 별칭 함수 (새로운 코드에서도 사용 가능)
export const getOptimizedNpcUsageModel = getNpcUsageModel;
