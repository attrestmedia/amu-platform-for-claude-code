import { NextRequest, NextResponse } from "next/server";
import { getUniverseById, deleteUniverse } from "libs/database/universe";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { logger } from "utils/log";
import { redisCache } from "libs/cache/redisCacheService";
import { withApiTimeout } from "libs/server-utils/api/withApiTimeout";
import CacheKeyManager from "libs/cache/cacheKeyManager";
import type { UnknownRecord } from "utils/common";
import type { IUniverse } from "types/game";
import { resolveUniverseResponseViewer, sanitizeUniverseForViewer } from "libs/server-utils/universe/universeResponsePolicy";

/**
 * @docHint
 * @purpose API 라우트(universe / [universeId]) 기능 요청 처리
 * @process GET 요청 파싱  인증/권한 검증  핵심 처리  JSON 응답 반환
 * @domain universe
 * @scope universe
 */

// 특정 유니버스 정보 조회
export async function GET(request: NextRequest, { params }: { params: Promise<{ universeId: string }> }) {
  return withApiTimeout(async () => {
    try {
      const { universeId } = await params;
      const cacheKey = CacheKeyManager.universe.doc(universeId);
      const cached = await redisCache.get<UnknownRecord>(cacheKey);
      const universe = (cached as unknown as IUniverse) || (await getUniverseById(universeId));
      if (!universe) {
        return NextResponse.json({ success: false, message: "유니버스를 찾을 수 없습니다." }, { status: 404 });
      }

      if (!cached) {
        await redisCache.setWithTags(cacheKey, universe, 60 * 10, [
          CacheKeyManager.universe.tag(universeId),
          CacheKeyManager.universe.tagDetails(universeId),
        ]);
      }
      const viewer = await resolveUniverseResponseViewer(request);

      return NextResponse.json({
        success: true,
        data: sanitizeUniverseForViewer(universe, viewer),
      });
    } catch (error) {
      console.error("유니버스 조회 오류:", error);
      return NextResponse.json(
        { success: false, message: "유니버스 정보를 가져오는 중 오류가 발생했습니다." },
        { status: 500 },
      );
    }
  }, 20000);
}

// 유니버스 삭제 (관리자 전용)
export const DELETE = withAuth(
  async (data, user, request, { params }: { params: Promise<{ universeId: string }> }) => {
    return withApiTimeout(async () => {
      try {
        const { universeId } = await params;

        // 유니버스 존재 여부 확인
        const existingUniverse = await getUniverseById(universeId);
        if (!existingUniverse) {
          return NextResponse.json({ success: false, message: "삭제할 유니버스를 찾을 수 없습니다." }, { status: 404 });
        }

        // 삭제 실행
        const success = await deleteUniverse(universeId);

        if (!success) {
          return NextResponse.json({ success: false, message: "유니버스 삭제에 실패했습니다." }, { status: 500 });
        }

        // 해당 유니버스 관련 캐시 전부 무효화
        try {
          await redisCache.invalidateByTag(CacheKeyManager.universe.tag(universeId));
          await redisCache.invalidateByTag(CacheKeyManager.universe.tagDetails(universeId));
          await redisCache.invalidateByTag(CacheKeyManager.universe.tagList());
          await redisCache.invalidateByTag(CacheKeyManager.universe.tagDetailsAll());
        } catch (e) {
          logger.warn("캐시 무효화 경고:", e);
        }

        logger.info("유니버스 삭제 성공", {
          userId: user.ID,
          universeId: universeId,
          universeName: existingUniverse.name,
        });

        return NextResponse.json({
          success: true,
          message: "유니버스가 성공적으로 삭제되었습니다.",
        });
      } catch (error) {
        console.error("유니버스 삭제 오류:", error);
        return NextResponse.json({ success: false, message: "유니버스 삭제 중 오류가 발생했습니다." }, { status: 500 });
      }
    }, 20_000);
  },
  undefined,
  "universe_delete",
  { requireAdmin: true },
);
