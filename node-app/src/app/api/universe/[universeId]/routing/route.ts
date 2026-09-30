import { NextResponse } from "next/server";
import { getUniverseById, updateUniversePreferredBasePath } from "libs/database/universe";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { logger } from "utils/log";
import { redisCache } from "libs/cache/redisCacheService";
import CacheKeyManager from "libs/cache/cacheKeyManager";
import { withApiTimeout } from "libs/server-utils/api/withApiTimeout";
import type { UniverseBasePath } from "types/game";

/**
 * @docHint
 * @purpose API 라우트(universe / [universeId] / routing) 기능 요청 처리
 * @process 요청 요청 파싱  인증/권한 검증  핵심 처리  JSON 응답 반환
 * @domain universe
 * @scope universe
 */

const ALLOWED_BASE_PATHS: UniverseBasePath[] = ["play", "store"];

function isUniverseBasePath(value: unknown): value is UniverseBasePath {
  return typeof value === "string" && ALLOWED_BASE_PATHS.includes(value as UniverseBasePath);
}

export const POST = withAuth(
  async (data, user, request, { params }: { params: Promise<{ universeId: string }> }) => {
    return withApiTimeout(async () => {
      try {
        const { universeId } = await params;
        const preferredBasePath = String(data?.preferredBasePath || "").trim().toLowerCase();

        if (!isUniverseBasePath(preferredBasePath)) {
          return NextResponse.json(
            { success: false, message: "preferredBasePath는 play 또는 store 중 하나여야 합니다." },
            { status: 400 },
          );
        }

        const universe = await getUniverseById(universeId);
        if (!universe) {
          return NextResponse.json({ success: false, message: "유니버스를 찾을 수 없습니다." }, { status: 404 });
        }

        if (universe.type !== "commerce" && preferredBasePath !== "play") {
          return NextResponse.json(
            { success: false, message: "commerce 유니버스만 store 경로를 사용할 수 있습니다." },
            { status: 400 },
          );
        }

        const updatedUniverse = await updateUniversePreferredBasePath(universeId, preferredBasePath);
        if (!updatedUniverse) {
          return NextResponse.json({ success: false, message: "유니버스 업데이트에 실패했습니다." }, { status: 404 });
        }

        try {
          await redisCache.invalidateByTag(CacheKeyManager.universe.tag(universeId));
          await redisCache.invalidateByTag(CacheKeyManager.universe.tagDetails(universeId));
          await redisCache.invalidateByTag(CacheKeyManager.universe.tagList());
        } catch (e) {
          logger.warn("유니버스 라우팅 캐시 무효화 경고:", e);
        }

        logger.info("유니버스 기본 경로 업데이트 성공", {
          userId: user.ID,
          universeId,
          preferredBasePath,
        });

        return NextResponse.json({
          success: true,
          data: {
            universeId,
            preferredBasePath,
            universe: updatedUniverse,
          },
        });
      } catch (error) {
        logger.error("유니버스 기본 경로 업데이트 오류:", error);
        return NextResponse.json(
          {
            success: false,
            message: "유니버스 기본 경로를 저장하는 중 오류가 발생했습니다.",
          },
          { status: 500 },
        );
      }
    }, 15000);
  },
  (data) => {
    const preferredBasePath = String(data?.preferredBasePath || "").trim().toLowerCase();
    if (!isUniverseBasePath(preferredBasePath)) {
      return { valid: false, error: "preferredBasePath는 play 또는 store 중 하나여야 합니다." };
    }
    return { valid: true };
  },
  "universe_routing_update",
  {
    checkUniversePermission: {
      universeIdParam: "universeId",
      requireEdit: true,
    },
  },
);
