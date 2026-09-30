import { NextRequest, NextResponse } from "next/server";
import { getUniverseById } from "libs/database/universe";
import { logger } from "utils/log";
import type { IUniverse, IStageInfo } from "types/game";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { updateUniverseStages } from "libs/database/universe";
import { redisCache } from "libs/cache/redisCacheService";
import CacheKeyManager from "libs/cache/cacheKeyManager";
import { toUnknownRecord } from "utils/common";

/**
 * @docHint
 * @purpose API 라우트(universe / [universeId] / stages) 기능 요청 처리
 * @process GET 요청 파싱  인증/권한 검증  핵심 처리  JSON 응답 반환
 * @domain universe
 * @scope universe
 */

type RouteParams = { universeId: string };

// Universe ↔ Stage 연결 목록 조회
// - GET /api/universe/[universeId]/stages
export async function GET(_request: NextRequest, { params }: { params: Promise<RouteParams> }) {
  try {
    const { universeId } = await params;
    const universe = (await getUniverseById(universeId)) as IUniverse | null;

    if (!universe) {
      return NextResponse.json({ success: false, message: "유니버스를 찾을 수 없습니다." }, { status: 404 });
    }

    const stages: IStageInfo[] = universe.stages ?? [];

    return NextResponse.json({
      success: true,
      data: stages,
    });
  } catch (error) {
    logger.error("[UniverseStages][GET] 유니버스 스테이지 목록 조회 오류:", error);
    return NextResponse.json(
      { success: false, message: "유니버스 스테이지 목록을 가져오는 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}

// Universe ↔ Stage 연결 목록 업데이트
// - PUT /api/universe/[universeId]/stages
export const PUT = withAuth(
  async (data: unknown, _user, _request, { params }: { params: Promise<RouteParams> }) => {
    try {
      const { universeId } = await params;

      const body = toUnknownRecord(data);
      const rawStages = Array.isArray(data) ? data : Array.isArray(body.stages) ? body.stages : null;
      if (!Array.isArray(rawStages)) {
        return NextResponse.json({ success: false, message: "stages 배열이 필요합니다." }, { status: 400 });
      }

      // 1) 최소 스키마만 허용하도록 sanitize
      const sanitized: IStageInfo[] = rawStages
        .map((item) => {
          const stage = toUnknownRecord(item);
          const stageId = String(stage.stageId ?? "").trim();
          const stageName = String(stage.stageName ?? "").trim();
          if (!stageId || !stageName) return null;

          const ref: IStageInfo = {
            stageId,
            stageName,
          };

          if (typeof stage.isDefault === "boolean") ref.isDefault = stage.isDefault;
          if (typeof stage.mode === "string") ref.mode = stage.mode;
          if (typeof stage.layoutVersion === "string") ref.layoutVersion = stage.layoutVersion;
          if (stage.usageType === "game" || stage.usageType === "commerce" || stage.usageType === "both") {
            ref.usageType = stage.usageType;
          }

          return ref;
        })
        .filter((v): v is IStageInfo => v !== null);

      if (sanitized.length === 0) {
        return NextResponse.json(
          { success: false, message: "유효한 stageId / stageName이 없습니다." },
          { status: 400 },
        );
      }

      // 2) isDefault는 최대 1개로 정규화
      let hasDefault = sanitized.some((s) => s.isDefault);
      if (!hasDefault) {
        // 하나도 없으면 첫 항목을 default로
        sanitized[0].isDefault = true;
        hasDefault = true;
      } else {
        let first = true;
        sanitized.forEach((s) => {
          if (s.isDefault) {
            if (first) {
              first = false;
            } else {
              s.isDefault = false;
            }
          }
        });
      }

      // 3) Universe 업데이트
      const updated = await updateUniverseStages(universeId, sanitized);
      if (!updated) {
        return NextResponse.json({ success: false, message: "유니버스를 찾을 수 없습니다." }, { status: 404 });
      }

      // 유니버스/스테이지 관련 캐시 무효화
      try {
        await redisCache.invalidateByTag(CacheKeyManager.universe.tag(universeId));
        await redisCache.invalidateByTag(CacheKeyManager.universe.tagDetails(universeId));
        await redisCache.invalidateByTag(CacheKeyManager.universe.tagList());
        await redisCache.invalidateByTag(CacheKeyManager.universe.tagDetailsAll());
      } catch (e) {
        logger.warn("[UniverseStages][PUT] 캐시 무효화 경고:", e);
      }

      logger.log("[UniverseStages][PUT] 유니버스 스테이지 연결 업데이트:", {
        universeId,
        stagesCount: sanitized.length,
      });

      return NextResponse.json({
        success: true,
        data: updated.stages,
      });
    } catch (error) {
      logger.error("[UniverseStages][PUT] 유니버스 스테이지 연결 업데이트 오류:", error);
      return NextResponse.json(
        { success: false, message: "유니버스 스테이지 연결을 업데이트하는 중 오류가 발생했습니다." },
        { status: 500 },
      );
    }
  },
  undefined,
  "universe/stages_update",
  {
    // 전역 Admin만이 아니라, 해당 Universe 편집 권한이 있는 사용자도 허용
    checkUniversePermission: {
      universeIdParam: "universeId",
      requireEdit: true,
    },
  },
);
