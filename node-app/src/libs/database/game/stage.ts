import { Model } from "mongoose";
import { getModel } from "libs/database/modelCache";
import { StageSchema } from "models/game";
import type { IStageDocument } from "models/game";
import { MONGODB_GAME_URL } from "consts/env/server";

/**
 * @docHint
 * @purpose 도메인 데이터 접근 로직
 * @process get 작업  DB 조회/저장 수행
 * @domain game
 * @scope server
 */

// 공용 Stage 모델 헬퍼
export async function getStageModel(): Promise<Model<IStageDocument>> {
  return getModel<IStageDocument>(MONGODB_GAME_URL, "Stage", StageSchema, "stages");
}
