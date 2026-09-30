import { NextResponse } from "next/server";
import { getStageModel } from "libs/database/game";
import type { IStageDoc, IStagesListResponse } from "types/game";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { redisCache } from "libs/cache/redisCacheService";
import CacheKeyManager from "libs/cache/cacheKeyManager";
import { logger } from "utils/log";
import { toUnknownRecord } from "utils/common/typeUtils";
import { validateStageCoordinateV2 } from "utils/game/stageCoordinateContract";

/**
 * @docHint
 * @purpose API 라우트(game / stages) 기능 요청 처리
 * @process 요청 요청 파싱  인증/권한 검증  핵심 처리  JSON 응답 반환
 * @domain game.stage.admin
 * @scope admin_api
 */

// StageDoc 목록 조회 (Admin 전용)
// - GET /api/game/stages?ownerType=&ownerId=&usageType=&domain=&visibility=&stageId=&stageName=&q=&page=&pageSize=
export const GET = withAuth(
  async (_data, _user, request) => {
    try {
      const { searchParams } = new URL(request.url);

      const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
      const rawPageSize = parseInt(searchParams.get("pageSize") ?? "20", 10);
      const pageSize = Math.min(Math.max(1, rawPageSize || 20), 100);

      const ownerType = searchParams.get("ownerType");
      const ownerId = searchParams.get("ownerId");
      const usageType = searchParams.get("usageType");
      const domain = searchParams.get("domain");
      const visibility = searchParams.get("visibility");
      const stageId = searchParams.get("stageId");
      const stageName = searchParams.get("stageName");
      const q = searchParams.get("q");

      const filter: Record<string, unknown> = { coordinateContractVersion: 2 };

      if (ownerType) filter.ownerType = ownerType;
      if (ownerId) filter.ownerId = ownerId;
      if (usageType) filter.usageType = usageType;
      if (domain) filter.domain = domain;
      if (visibility) filter.visibility = visibility;
      if (stageId) filter.stageId = stageId;
      if (stageName) filter.stageName = stageName;

      if (q) {
        const regex = new RegExp(q, "i");
        filter.$or = [{ stageId: regex }, { stageName: regex }];
      }

      const StageModel = await getStageModel();

      const [items, total] = await Promise.all([
        StageModel.find(filter)
          .sort({ createdAt: -1 })
          .skip((page - 1) * pageSize)
          .limit(pageSize)
          .lean<IStageDoc[]>(),
        StageModel.countDocuments(filter),
      ]);

      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const resolvedItems = items.filter((item) => validateStageCoordinateV2(item).valid);

      const response: IStagesListResponse = {
        success: true,
        data: resolvedItems,
        pagination: {
          page,
          pageSize,
          total,
          totalPages,
        },
      };

      return NextResponse.json(response);
    } catch (error) {
      logger.error("[StageAdmin][GET] Stage 목록 조회 오류:", error);
      return NextResponse.json(
        {
          success: false,
          message: "Stage 목록을 가져오는 중 오류가 발생했습니다.",
        },
        { status: 500 },
      );
    }
  },
  undefined, // 별도 validator는 없음
  "game/stages_list", // endpoint 식별자
  { requireAdmin: true }, // 관리자 전용
);

// StageDoc 생성 (Admin 전용)
// - POST /api/game/stages
export const POST = withAuth(
  async (data, user) => {
    try {
      const payload = data as Partial<IStageDoc>;

      const stageId = payload.stageId?.trim();
      const stageName = payload.stageName?.trim();

      if (!stageId || !stageName) {
        return NextResponse.json({ success: false, message: "stageId와 stageName은 필수입니다." }, { status: 400 });
      }

      const StageModel = await getStageModel();

      // 같은 domain + stageId + stageName 조합이 이미 있으면 경고
      const domain = (payload.domain ?? "stage") as IStageDoc["domain"];
      const exists = await StageModel.findOne({ stageId, stageName, domain }).lean();

      if (exists) {
        return NextResponse.json(
          {
            success: false,
            message: "동일한 stageId / stageName / domain 조합의 StageDoc이 이미 존재합니다.",
          },
          { status: 409 },
        );
      }

      // 공통 오너 키 계산
      const userRecord = toUnknownRecord(user);
      const userOwnerKey =
        (typeof userRecord.userEmailLower === "string" && userRecord.userEmailLower.trim().toLowerCase()) ||
        (typeof userRecord.userEmail === "string" && userRecord.userEmail.trim().toLowerCase()) ||
        (typeof userRecord.email === "string" && userRecord.email.trim().toLowerCase()) ||
        (userRecord.ID ? String(userRecord.ID) : undefined);

      const ownerType = (payload.ownerType ?? "global") as IStageDoc["ownerType"];

      const docToCreate: Partial<IStageDoc> = {
        stageId,
        stageName,
        coordinateContractVersion: payload.coordinateContractVersion,
        projectionConfig: payload.projectionConfig,
        domain,
        ownerType: (payload.ownerType ?? "global") as IStageDoc["ownerType"],
        ownerId: ownerType === "user" ? (userOwnerKey ?? payload.ownerId) : payload.ownerId,
        visibility: (payload.visibility ?? "private") as IStageDoc["visibility"],
        usageType: (payload.usageType ?? "game") as IStageDoc["usageType"],
        background: payload.background,
        border: payload.border,
        assets: payload.assets ?? [],
        layout: payload.layout,
        createdBy: payload.createdBy,
      };
      const coordinateValidation = validateStageCoordinateV2(docToCreate as IStageDoc);
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

      const StageModelInstance = await getStageModel();
      const createdDoc = await StageModelInstance.create(docToCreate);
      const created = createdDoc.toObject() as IStageDoc;

      logger.log("[StageAdmin][POST] StageDoc 생성 완료:", {
        id: createdDoc._id?.toString?.(),
        stageId,
        stageName,
        domain,
      });

      // Stage 관련 캐시 무효화
      try {
        await redisCache.invalidateByTag(CacheKeyManager.stage.tagStage(stageId, stageName));
        await redisCache.invalidateByTag(CacheKeyManager.stage.tagRequest(stageId, stageName));
      } catch (e) {
        logger.warn("[StageAdmin][POST] 캐시 무효화 경고:", e);
      }

      return NextResponse.json(
        {
          success: true,
          data: created,
        },
        { status: 201 },
      );
    } catch (error) {
      logger.error("[StageAdmin][POST] StageDoc 생성 오류:", error);
      return NextResponse.json(
        { success: false, message: "StageDoc을 생성하는 중 오류가 발생했습니다." },
        { status: 500 },
      );
    }
  },
  undefined,
  "game/stages_create",
  { requireAdmin: true },
);
