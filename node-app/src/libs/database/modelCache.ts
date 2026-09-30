import { Schema, Model } from "mongoose";
import { dbConnect } from "./mongoose";
import { logger } from "utils/log";

/**
 * @docHint
 * @purpose 도메인 데이터 접근 로직
 * @process get 작업  DB 조회/저장 수행
 * @domain database
 * @scope server
 */

// 모델 캐싱 키
const MODEL_CACHE_KEY = "_mongooseModels";

// 전역 모델 캐시 초기화
type ModelCache = Record<string, Model<unknown>>;
const globalWithCache = globalThis as unknown as Record<string, ModelCache | undefined>;
if (!globalWithCache[MODEL_CACHE_KEY]) {
  globalWithCache[MODEL_CACHE_KEY] = {};
}

const modelCache = globalWithCache[MODEL_CACHE_KEY] as ModelCache;

// 모델 생성 또는 캐시에서 가져오기
export async function getModel<T>(
  uri: string,
  modelName: string,
  schema: Schema,
  collectionName?: string,
): Promise<Model<T>> {
  const cacheKey = `${uri}:${modelName}`;

  // 캐시에 있으면 반환
  if (modelCache[cacheKey]) {
    return modelCache[cacheKey] as Model<T>;
  }

  try {
    const conn = await dbConnect(uri);

    // 모델 생성 또는 가져오기
    let model: Model<T>;
    try {
      // 이미 등록된 모델이 있는지 확인
      model = conn.model(modelName) as unknown as Model<T>;
    } catch {
      // 없으면 새로 생성
      model = conn.model(modelName, schema, collectionName || modelName.toLowerCase()) as unknown as Model<T>;
    }

    // 캐시에 저장
    modelCache[cacheKey] = model as unknown as Model<unknown>;
    return model;
  } catch (error) {
    logger.error(`MongoDB 모델 생성 오류 (${modelName}):`, error);
    throw error;
  }
}
