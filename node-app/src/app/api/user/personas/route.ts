import { NextRequest, NextResponse } from "next/server";
import { getModel } from "libs/database/modelCache";
import { PersonasSchema } from "models/user";
import type { IPersonasDocument } from "models/user";
import type { IPersonaItem } from "types/ai";
import { redisCache } from "libs/cache/redisCacheService";
import CacheKeyManager from "libs/cache/cacheKeyManager";
import { logger } from "utils/log";
import { MONGODB_PERSONAS_MODEL_PREFIX, MONGODB_USER_PERSONAS_MODEL_PREFIX } from "consts/db";
import { withApiTimeout } from "libs/server-utils/api/withApiTimeout";
import { MONGODB_USERS_URL } from "consts/env/server";
import { toErrorMessage } from "utils/common";

/**
 * @docHint
 * @purpose API 라우트(user / personas) 기능 요청 처리
 * @process GET 요청 파싱  입력 검증  핵심 처리  JSON 응답 반환
 * @domain user-personas
 * @scope user
 */

// GET: 특정 유니버스의 personas 데이터 조회
export async function GET(request: NextRequest) {
  return withApiTimeout(async () => {
    try {
      const { searchParams } = new URL(request.url);
      const uid = searchParams.get("uid");
      const universe = searchParams.get("universe");
      const type = searchParams.get("type") || "userPersonas"; // userPersonas | personas

      if (!uid || !universe) {
        return NextResponse.json({ error: "uid와 universe는 필수입니다." }, { status: 400 });
      }

      // 캐시 확인
      const cacheKey =
        type === "userPersonas"
          ? CacheKeyManager.userPersonas.byUniverse(uid, universe)
          : CacheKeyManager.userPersonas.personasByUniverse(uid, universe);

      const cached = await redisCache.get<IPersonaItem[]>(cacheKey);
      if (cached) {
        return NextResponse.json({ data: { personas: cached }, fromCache: true });
      }

      // DB에서 조회
      const modelName =
        type === "userPersonas"
          ? `${MONGODB_USER_PERSONAS_MODEL_PREFIX}${uid}_${universe}`
          : `${MONGODB_PERSONAS_MODEL_PREFIX}${uid}_${universe}`;
      const Model = await getModel<IPersonasDocument>(MONGODB_USERS_URL, modelName, PersonasSchema, modelName);

      const data = await Model.findOne({ uid, universe });

      if (!data) {
        // 빈 배열 반환하되 적절한 상태 코드 사용
        return NextResponse.json(
          {
            data: { personas: [] },
            message: "현재 유니버스에는 personas 데이터가 없습니다.",
          },
          { status: 200 },
        ); // 404 대신 200으로 변경
      }

      // 캐시 저장
      const ttl = type === "userPersonas" ? CacheKeyManager.ttl.USER_PERSONAS : CacheKeyManager.ttl.PERSONAS;

      await redisCache.set(cacheKey, data.personas, ttl);

      return NextResponse.json({
        data: { personas: data.personas },
        fromCache: false,
      });
    } catch (error) {
      logger.error("Personas 데이터 조회 중 오류:", error);
      return NextResponse.json(
        {
          error: "데이터 조회 중 오류가 발생했습니다.",
          details: process.env.NODE_ENV === "development" ? toErrorMessage(error) : undefined,
        },
        { status: 500 },
      );
    }
  }, 20000);
}
