import { NextRequest, NextResponse } from "next/server";
import { getUniverseDetail, upsertUniverseDetail } from "libs/database/universe";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { logger } from "utils/log";
import { redisCache } from "libs/cache/redisCacheService";
import CacheKeyManager from "libs/cache/cacheKeyManager";
import { withApiTimeout } from "libs/server-utils/api/withApiTimeout";
import { invalidateUniverseDetailPromptCache } from "libs/server-utils/system-prompt/commercePromptData";
import { sanitizeStoreKnowledge } from "utils/commerce/storeKnowledgeUtils";
import type { UnknownRecord } from "utils/common";

/**
 * @docHint
 * @purpose API 라우트(universe / [universeId] / details) 기능 요청 처리
 * @process GET 요청 파싱  인증/권한 검증  핵심 처리  JSON 응답 반환
 * @domain universe
 * @scope universe
 */

// 유니버스 상세 데이터 조회
export async function GET(request: NextRequest, { params }: { params: Promise<{ universeId: string }> }) {
  return withApiTimeout(async () => {
    try {
      const { universeId } = await params;

      // 1) 캐시 조회
      const cacheKey = CacheKeyManager.universe.details(universeId);
      const cached = await redisCache.get<UnknownRecord>(cacheKey);
      if (cached) {
        return NextResponse.json({ success: true, data: cached });
      }

      // 2) DB 조회
      const detail = await getUniverseDetail(universeId);

      if (!detail) {
        return NextResponse.json({ success: false, message: "상세 데이터를 찾을 수 없습니다." }, { status: 404 });
      }

      // 3) 캐싱 (태그: universe, 카테고리, 타입 등)
      const ttl = CacheKeyManager.ttl.utils.inMinutes(15);
      await redisCache.setWithTags(cacheKey, detail, ttl, [
        CacheKeyManager.universe.tag(universeId), // 기존
        CacheKeyManager.universe.tagDetails(universeId), // per-id 상세 태그
        CacheKeyManager.universe.tagDetailsAll(), // 선택: 전역 상세
      ]);

      return NextResponse.json({ success: true, data: detail });
    } catch (error) {
      logger.error("유니버스 상세 데이터 조회 오류:", error);
      return NextResponse.json(
        {
          success: false,
          message: "유니버스 상세 데이터를 가져오는 중 오류가 발생했습니다.",
        },
        { status: 500 },
      );
    }
  }, 20000);
}

// 유니버스 상세 데이터 생성/업데이트 (관리자 전용)
export const POST = withAuth(
  async (data, user, request, context) => {
    return withApiTimeout(async () => {
      try {
        const { universeId } = context.params;

        // storeKnowledge는 구조화 필드만 저장한다. 빈 항목/미완성 FAQ를 저장 전에 제거한다.
        if (data?.metadata?.storeKnowledge) {
          const sanitized = sanitizeStoreKnowledge(data.metadata.storeKnowledge);
          if (sanitized) data.metadata.storeKnowledge = sanitized;
          else delete data.metadata.storeKnowledge;
        }

        if (data?.settings?.commerce) {
          const blockSize = data.settings.commerce.blockSize;
          data.settings.commerce = blockSize ? { blockSize } : {};
        }

        logger.log("유니버스 상세 데이터 업데이트:", { universeId, data });

        const detail = await upsertUniverseDetail(universeId, data);

        logger.info("유니버스 상세 데이터 업데이트 성공", {
          userId: user.ID,
          universeId,
        });

        // 상품/디테일 캐시 무효화 (해당 유니버스 태그로 일괄 삭제)
        try {
          await redisCache.invalidateByTag(CacheKeyManager.universe.tag(universeId));
          await redisCache.invalidateByTag(CacheKeyManager.universe.tagDetails(universeId));
        } catch (e) {
          logger.warn("캐시 무효화 경고:", e);
        }

        // 시스템 프롬프트용 UniverseDetail(짧은 TTL) 캐시도 즉시 무효화
        try {
          invalidateUniverseDetailPromptCache(universeId);
        } catch (e) {
          logger.warn("prompt 캐시 무효화 경고:", e);
        }

        return NextResponse.json({
          success: true,
          data: detail,
        });
      } catch (error) {
        logger.error("유니버스 상세 데이터 업데이트 오류:", error);
        return NextResponse.json(
          {
            success: false,
            message: "유니버스 상세 데이터 처리 중 오류가 발생했습니다.",
          },
          { status: 500 },
        );
      }
    }, 20000);
  },
  (data) => {
    if (!data || typeof data !== "object") {
      return { valid: false, error: "유효하지 않은 요청 데이터입니다." };
    }
    return { valid: true };
  },
  "universe_detail_update",
  {
    checkUniversePermission: {
      universeIdParam: "universeId",
      requireEdit: true,
    },
  },
);
