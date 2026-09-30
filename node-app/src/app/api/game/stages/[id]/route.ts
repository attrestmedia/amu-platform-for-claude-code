import { NextResponse } from "next/server";
import { getStageModel } from "libs/database/game";
import type { IStageDoc } from "types/game";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { redisCache } from "libs/cache/redisCacheService";
import CacheKeyManager from "libs/cache/cacheKeyManager";
import { logger } from "utils/log";
import {
  hasStageCoordinateWrite,
  validateStageCoordinateV2,
  validateStageCoordinateWrite,
} from "utils/game/stageCoordinateContract";

/**
 * @docHint
 * @purpose API 라우트(game / stages / [id]) 기능 요청 처리
 * @process 요청 요청 파싱  인증/권한 검증  핵심 처리  JSON 응답 반환
 * @domain game.stage.admin
 * @scope admin_api
 */

type RouteParams = { id: string };

// 단일 StageDoc 조회
// - GET /api/game/stages/[id]
export const GET = withAuth(
  async (_data, _user, _request, { params }: { params: Promise<RouteParams> }) => {
    try {
      const { id } = await params;
      const StageModel = await getStageModel();
      const doc = await StageModel.findById(id).lean<IStageDoc | null>();

      if (!doc) {
        return NextResponse.json({ success: false, message: "StageDoc을 찾을 수 없습니다." }, { status: 404 });
      }

      const coordinateValidation = validateStageCoordinateV2(doc);
      if (!coordinateValidation.valid) {
        return NextResponse.json(
          {
            success: false,
            code: "stage_coordinate_contract_invalid",
            message: "StageDoc 좌표 계약 v2 검증에 실패했습니다.",
            issues: coordinateValidation.issues,
          },
          { status: 422 },
        );
      }

      return NextResponse.json({
        success: true,
        data: doc,
      });
    } catch (error) {
      logger.error("[StageAdmin][GET:id] StageDoc 조회 오류:", error);
      return NextResponse.json(
        { success: false, message: "StageDoc을 조회하는 중 오류가 발생했습니다." },
        { status: 500 },
      );
    }
  },
  undefined,
  "game/stages_get",
  { requireAdmin: true },
);

// StageDoc 수정
// - PUT /api/game/stages/[id]
export const PUT = withAuth(
  async (data, _user, _request, { params }: { params: Promise<RouteParams> }) => {
    try {
      const { id } = await params;
      const payload = data as Partial<IStageDoc>;

      // _id, createdAt 등은 강제 덮어쓰지 않도록 제거
      delete (payload as Partial<IStageDoc> & { _id?: unknown; createdAt?: unknown; updatedAt?: unknown })._id;
      delete (payload as Partial<IStageDoc> & { _id?: unknown; createdAt?: unknown; updatedAt?: unknown }).createdAt;
      delete (payload as Partial<IStageDoc> & { _id?: unknown; createdAt?: unknown; updatedAt?: unknown }).updatedAt;
      const StageModel = await getStageModel();
      const existing = await StageModel.findById(id).lean<IStageDoc | null>();
      if (!existing) {
        return NextResponse.json({ success: false, message: "StageDoc을 찾을 수 없습니다." }, { status: 404 });
      }

      if (
        hasStageCoordinateWrite(payload) &&
        existing.releaseDeployment?.status === "active"
      ) {
        return NextResponse.json(
          {
            success: false,
            code: "stage_release_locked",
            message: "활성 release는 직접 수정할 수 없습니다. 새 versioned release를 생성해 주세요.",
          },
          { status: 409 },
        );
      }

      if (hasStageCoordinateWrite(payload)) {
        const coordinateValidation = validateStageCoordinateWrite(payload, existing);
        if (!coordinateValidation.valid) {
          return NextResponse.json(
            {
              success: false,
              code: "stage_coordinate_contract_invalid",
              message: "StageDoc 좌표 계약 v2 검증에 실패했습니다.",
              issues: coordinateValidation.issues,
            },
            { status: 422 },
          );
        }
      }

      const updated = await StageModel.findByIdAndUpdate(id, payload, {
        new: true,
        runValidators: true,
      }).lean<IStageDoc | null>();

      if (!updated) {
        return NextResponse.json({ success: false, message: "StageDoc을 찾을 수 없습니다." }, { status: 404 });
      }

      logger.log("[StageAdmin][PUT:id] StageDoc 업데이트 완료:", {
        id,
        stageId: updated.stageId,
        stageName: updated.stageName,
      });

      // Stage 관련 캐시 무효화
      try {
        await redisCache.invalidateByTag(CacheKeyManager.stage.tagStage(updated.stageId, updated.stageName));
        await redisCache.invalidateByTag(CacheKeyManager.stage.tagRequest(updated.stageId, updated.stageName));
      } catch (e) {
        logger.warn("[StageAdmin][PUT:id] 캐시 무효화 경고:", e);
      }

      return NextResponse.json({ success: true, data: updated });
    } catch (error) {
      logger.error("[StageAdmin][PUT:id] StageDoc 수정 오류:", error);
      return NextResponse.json(
        { success: false, message: "StageDoc을 수정하는 중 오류가 발생했습니다." },
        { status: 500 },
      );
    }
  },
  undefined,
  "game/stages_update",
  { requireAdmin: true },
);

// StageDoc 삭제
// - DELETE /api/game/stages/[id]
export const DELETE = withAuth(
  async (_data, _user, _request, { params }: { params: Promise<RouteParams> }) => {
    try {
      const { id } = await params;
      const StageModel = await getStageModel();

      const existing = await StageModel.findById(id).lean<IStageDoc | null>();
      if (!existing) {
        return NextResponse.json({ success: false, message: "StageDoc을 찾을 수 없습니다." }, { status: 404 });
      }
      if (existing.releaseDeployment?.status === "active") {
        return NextResponse.json(
          {
            success: false,
            code: "stage_release_locked",
            message: "활성 release는 삭제할 수 없습니다.",
          },
          { status: 409 },
        );
      }

      const deleted = await StageModel.findByIdAndDelete(id).lean<IStageDoc | null>();

      if (!deleted) {
        return NextResponse.json({ success: false, message: "StageDoc을 찾을 수 없습니다." }, { status: 404 });
      }

      logger.log("[StageAdmin][DELETE:id] StageDoc 삭제 완료:", {
        id,
        stageId: deleted.stageId,
        stageName: deleted.stageName,
      });

      // Stage 관련 캐시 무효화
      try {
        await redisCache.invalidateByTag(CacheKeyManager.stage.tagStage(deleted.stageId, deleted.stageName));
        await redisCache.invalidateByTag(CacheKeyManager.stage.tagRequest(deleted.stageId, deleted.stageName));
      } catch (e) {
        logger.warn("[StageAdmin][DELETE:id] 캐시 무효화 경고:", e);
      }

      return NextResponse.json({ success: true });
    } catch (error) {
      logger.error("[StageAdmin][DELETE:id] StageDoc 삭제 오류:", error);
      return NextResponse.json(
        { success: false, message: "StageDoc을 삭제하는 중 오류가 발생했습니다." },
        { status: 500 },
      );
    }
  },
  undefined,
  "game/stages_delete",
  { requireAdmin: true },
);
