import mongoose from "mongoose";
import { getModel } from "libs/database/modelCache";
import {
  ConversationSchema,
  ConversationArchiveSchema,
  ConversationKnowledgeSchema,
  ConversationSessionSchema,
  ConversationMessageSchema,
  type IConversationArchive,
  type IConversationData,
  type IConversationKnowledge,
  type IConversationMessageDoc,
  type IConversationRawBackupDoc,
  type IConversationSessionDoc,
  ConversationRawBackupSchema,
} from "models/game";
import { createTextHash } from "utils/common";
import { logger } from "utils/log";
import { MONGODB_USER_MODEL_PREFIX } from "consts/db";
import { MONGODB_CONVERSATIONS_URL } from "consts/env/server";

/**
 * @docHint
 * @purpose 도메인 데이터 접근 로직
 * @process get 작업  DB 조회/저장 수행
 * @domain conversations
 * @scope server
 */

const safeId = (userId: string) => {
  const base = userId.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 48);
  const hash = createTextHash(userId).slice(0, 10);
  return `${base}_${hash}`;
};

// 대화 모델 가져오기
export async function getConversationModel(userId: string): Promise<mongoose.Model<IConversationData>> {
  try {
    // 사용자별 모델 이름 생성
    const modelName = `${MONGODB_USER_MODEL_PREFIX}${safeId(userId)}_Conversations`;

    // getModel 함수를 사용하여 모델 가져오기 (modelName과 collectionName을 동일하게 설정)
    return await getModel<IConversationData>(
      MONGODB_CONVERSATIONS_URL,
      modelName,
      ConversationSchema,
      modelName, // 컬렉션 이름도 동일하게 설정
    );
  } catch (error) {
    logger.error("대화 모델 생성 실패:", error);
    throw error;
  }
}

// 대화 아카이브 모델 가져오기
export async function getConversationArchiveModel(userId: string): Promise<mongoose.Model<IConversationArchive>> {
  try {
    // 사용자별 아카이브 모델 이름 생성
    const modelName = `${MONGODB_USER_MODEL_PREFIX}${safeId(userId)}_ConversationArchive`;

    // getModel 함수를 사용하여 모델 가져오기
    return await getModel<IConversationArchive>(
      MONGODB_CONVERSATIONS_URL,
      modelName,
      ConversationArchiveSchema,
      modelName,
    );
  } catch (error) {
    logger.error("대화 아카이브 모델 생성 실패:", error);
    throw error;
  }
}

// 지식 데이터 모델 가져오기
export async function getConversationKnowledgeModel(userId: string): Promise<mongoose.Model<IConversationKnowledge>> {
  try {
    // 사용자별 아카이브 모델 이름 생성
    const modelName = `${MONGODB_USER_MODEL_PREFIX}${safeId(userId)}_ConversationKnowledge`;

    return await getModel<IConversationKnowledge>(MONGODB_CONVERSATIONS_URL, modelName, ConversationKnowledgeSchema, modelName);
  } catch (error) {
    logger.error("지식 모델 생성 실패:", error);
    throw error;
  }
}

// 대화 세션 모델 가져오기
export async function getConversationSessionModel(userId: string): Promise<mongoose.Model<IConversationSessionDoc>> {
  try {
    const modelName = `${MONGODB_USER_MODEL_PREFIX}${safeId(userId)}_ConversationSessions`;
    return await getModel<IConversationSessionDoc>(MONGODB_CONVERSATIONS_URL, modelName, ConversationSessionSchema, modelName);
  } catch (error) {
    logger.error("대화 세션 모델 생성 실패:", error);
    throw error;
  }
}

// 대화 메시지 모델 가져오기
export async function getConversationMessageModel(userId: string): Promise<mongoose.Model<IConversationMessageDoc>> {
  try {
    const modelName = `${MONGODB_USER_MODEL_PREFIX}${safeId(userId)}_ConversationMessages`;
    return await getModel<IConversationMessageDoc>(MONGODB_CONVERSATIONS_URL, modelName, ConversationMessageSchema, modelName);
  } catch (error) {
    logger.error("대화 메시지 모델 생성 실패:", error);
    throw error;
  }
}

export async function getConversationRawBackupModel(userId: string): Promise<mongoose.Model<IConversationRawBackupDoc>> {
  try {
    const modelName = `${MONGODB_USER_MODEL_PREFIX}${safeId(userId)}_ConversationRawBackups`;
    return await getModel<IConversationRawBackupDoc>(
      MONGODB_CONVERSATIONS_URL,
      modelName,
      ConversationRawBackupSchema,
      modelName,
    );
  } catch (error) {
    logger.error("대화 원본 백업 모델 생성 실패:", error);
    throw error;
  }
}
