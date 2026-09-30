import { NextRequest, NextResponse } from "next/server";
import { getUniverseById, getUniverseDetail } from "libs/database/universe";
import { GAME_CONSTANTS as GC } from "consts/game";
import { redisCache } from "libs/cache/redisCacheService";
import CacheKeyManager from "libs/cache/cacheKeyManager";
import { getStageModel } from "libs/database/game";
import type { IUniverse, IStageInfo, IStageDoc } from "types/game";
import { validateStageCoordinateV2 } from "utils/game";
import { collectStageMediaRefs } from "utils/game/stageReleaseContract";
import { getR2PublicObjectFromUrl } from "libs/server-utils/storage/r2Storage";
import { logger } from "utils/log";
import type { UnknownRecord } from "utils/common";

/**
 * @docHint
 * @purpose API 라우트(universe / [universeId] / stage) 기능 요청 처리
 * @process GET 요청 파싱  입력 검증  핵심 처리  JSON 응답 반환
 * @domain stage
 * @scope universe
 */

// 스테이지 원본 데이터 제공 API
export async function GET(request: NextRequest, { params }: { params: Promise<{ universeId: string }> }) {
  try {
    const { universeId } = await params;
    const { searchParams } = new URL(request.url);
    const requestedStageId = searchParams.get("stageId") || "";
    const requestedStageName = searchParams.get("stageName") || "";

    // 1) 유니버스 정보
    const universe = (await getUniverseById(universeId)) as IUniverse | null;
    if (!universe) {
      return NextResponse.json({ success: false, message: "유니버스를 찾을 수 없습니다." }, { status: 404 });
    }
    if (universe.enabled === false) {
      return NextResponse.json(
        { success: false, code: "universe_disabled", message: "비활성 유니버스에는 입장할 수 없습니다." },
        { status: 423 },
      );
    }

    // neg 캐시 먼저 체크
    const neg = await redisCache.get<{ notFound: true }>(CacheKeyManager.universe.detailsNeg(universeId));
    if (neg?.notFound) {
      return NextResponse.json({ success: false, message: "상세 데이터를 찾을 수 없습니다." }, { status: 404 });
    }

    const detail =
      (await redisCache.get<UnknownRecord>(CacheKeyManager.universe.details(universeId))) ??
      (await getUniverseDetail(universeId));

    // DB 스파이크를 줄이기 위한 안전 장치
    if (!detail) {
      await redisCache.setWithTags(CacheKeyManager.universe.detailsNeg(universeId), { notFound: true }, 30, [
        CacheKeyManager.universe.tag(universeId),
        CacheKeyManager.universe.tagDetailsAll(),
        CacheKeyManager.universe.tagDetails(universeId), // 개별 상세 태그 추가
      ]);
      return NextResponse.json({ success: false, message: "상세 데이터를 찾을 수 없습니다." }, { status: 404 });
    }

    // 2) "원본" 해석 함수
    const resolveStage = (stages: IStageInfo[] = [], qStageId: string, qStageName: string): IStageInfo => {
      if (qStageId) {
        const byId = stages.find((s) => s.stageId === qStageId);
        if (byId) return { stageId: byId.stageId, stageName: byId.stageName };
      }

      if (qStageName) {
        const byName = stages.find((s) => s.stageName === qStageName);
        if (byName) return { stageId: byName.stageId, stageName: byName.stageName };
      }

      // 3) Universe에서 명시한 default 우선
      const byDefault = stages.find((s) => s.isDefault);
      if (byDefault) {
        return { stageId: byDefault.stageId, stageName: byDefault.stageName };
      }

      // 4) 유니버스에 아무 것도 없으면, 전역 폴백
      if (stages.length === 0) {
        return { stageId: GC.FALLBACK.STAGE_ID, stageName: GC.FALLBACK.STAGE_NAME };
      }

      // 5) 최종적으로는 첫 항목
      return { stageId: stages[0].stageId, stageName: stages[0].stageName };
    };

    // DB 조회
    const fetchOneByStage = async (sid: string, sname: string) => {
      const StageModel = await getStageModel();
      return (
        (await StageModel.findOne({ stageId: sid, stageName: sname, domain: "stage" }).lean<IStageDoc | null>()) ||
        null
      );
    };

    const resolved = resolveStage(universe.stages || [], requestedStageId, requestedStageName);

    let effective = { stageId: resolved.stageId, stageName: resolved.stageName };
    let doc = await fetchOneByStage(effective.stageId, effective.stageName);

    // 동일 stageId에서 default 이름으로 1차 폴백
    if (!doc && effective.stageName !== GC.FALLBACK.STAGE_NAME) {
      const d2 = await fetchOneByStage(effective.stageId, GC.FALLBACK.STAGE_NAME);
      if (d2) {
        doc = d2;
        effective = { stageId: effective.stageId, stageName: GC.FALLBACK.STAGE_NAME };
      }
    }

    // 전역 폴백
    if (!doc) {
      return NextResponse.json({ success: false, message: "스테이지 데이터를 찾을 수 없습니다." }, { status: 404 });
    }

    if (doc.layout?.mode === "auto" && (!doc.layout.tiles || doc.layout.tiles.length === 0)) {
      return NextResponse.json(
        {
          success: false,
          code: "stage_layout_not_published",
          message: "자동 레이아웃은 관리자 저장 후 공개할 수 있습니다.",
        },
        { status: 409 },
      );
    }

    if (doc.releaseDeployment?.status === "active") {
      const nativeV2 = doc.coordinateContractVersion === 2 && Boolean(doc.projectionConfig);
      const releaseMetadataReady = Boolean(
        doc.releaseDeployment.manifestVersion &&
          doc.releaseDeployment.manifestKey &&
          doc.releaseDeployment.manifestSha256,
      );
      const publicR2MediaReady = collectStageMediaRefs(doc).every((url) => getR2PublicObjectFromUrl(url) !== null);
      if (!nativeV2 || !releaseMetadataReady || !publicR2MediaReady) {
        logger.error("[UniverseStage][active-release-invalid]", {
          universeId,
          stageId: effective.stageId,
          stageName: effective.stageName,
          nativeV2,
          releaseMetadataReady,
          publicR2MediaReady,
        });
        return NextResponse.json(
          {
            success: false,
            code: "stage_active_release_invalid",
            message: "활성 스테이지 배포 계약이 유효하지 않습니다.",
          },
          { status: 409 },
        );
      }
    }

    const cacheKey = CacheKeyManager.stage.resolved(
      universeId,
      effective.stageId,
      effective.stageName,
      requestedStageId,
      requestedStageName,
    );
    const cached = await redisCache.get<IStageDoc | null>(cacheKey);
    if (cached) {
      const cachedValidation = validateStageCoordinateV2(cached);
      if (cachedValidation.valid) {
        return NextResponse.json({
          success: true,
          data: cached,
          releaseDeployment: cached.releaseDeployment ?? null,
        });
      }
    }

    const coordinateValidation = validateStageCoordinateV2(doc as IStageDoc);
    if (!coordinateValidation.valid) {
      logger.error("[UniverseStage][GET] StageDoc 좌표 계약 검증 실패:", {
        universeId,
        stageId: effective.stageId,
        stageName: effective.stageName,
        issues: coordinateValidation.issues,
      });
      return NextResponse.json(
        {
          success: false,
          code: "stage_coordinate_contract_invalid",
          message: "스테이지 좌표 계약이 유효하지 않습니다.",
        },
        { status: 422 },
      );
    }
    // 캐싱 (유니버스/스테이지 태그)
    const tags = [
      CacheKeyManager.universe.tag(universeId),
      CacheKeyManager.universe.tagDetails(universeId),
      CacheKeyManager.stage.tagRequest(requestedStageId, requestedStageName),
      CacheKeyManager.stage.tagStage(effective.stageId, effective.stageName),
    ];
    const ttl = CacheKeyManager.ttl.utils.inMinutes(15);
    const redisOk = await redisCache.setWithTags(cacheKey, doc, ttl, tags);
    if (!redisOk) logger.warn(`[cache] setWithTags 실패 key=${cacheKey}`);

    return NextResponse.json({
      success: true,
      data: doc,
      releaseDeployment: doc.releaseDeployment ?? null,
    });
  } catch (error) {
    logger.error("스테이지 원본 데이터 조회 오류:", error);
    return NextResponse.json(
      { success: false, message: "스테이지 데이터를 가져오는 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
