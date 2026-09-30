import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { normalizeString } from "libs/server-utils/api/apiSafetyHelper";
import { createSpritePipeline } from "libs/server-utils/game/spritePipelineOrchestrator";
import { listGameAssetPipelines } from "libs/database/game";
import type { GameAssetPipelineStatusType } from "types/game/asset-pipeline";
import { GAME_ASSET_PIPELINE_STATUSES } from "types/game/asset-pipeline";
import { logger } from "utils/log";
import { toErrorLike, type UnknownRecord } from "utils/common/typeUtils";

export const runtime = "nodejs";

/**
 * @docHint
 * @purpose 8방향 스프라이트 파이프라인 v2 생성(멱등)/목록 조회 (admin 전용)
 * @process 요청 파싱  인증/권한 검증  멱등 생성(anchor+templateVersion 키) 또는 목록 조회  JSON 응답 반환
 * @domain game.asset-pipeline
 * @scope admin-api
 */

const PIPELINE_STATUS_SET = new Set<string>(GAME_ASSET_PIPELINE_STATUSES);

export const POST = withAuth(
  async (body, user) => {
    try {
      const uid = normalizeString((user as { uid?: string; ID?: string | number })?.uid) || String((user as { ID?: string | number })?.ID || "");
      const { pipeline, created } = await createSpritePipeline({
        uid,
        anchorImageAssetId: normalizeString(body?.anchorImageAssetId),
        anchorSourceUrl: normalizeString(body?.anchorSourceUrl),
        name: normalizeString(body?.name),
        variables: (body?.variables as UnknownRecord) || {},
      });

      return NextResponse.json({ ok: true, data: { pipeline, created } }, { status: created ? 201 : 200 });
    } catch (error) {
      const errLike = toErrorLike(error);
      logger.error("[GameAssetPipeline][POST] failed:", error);
      return NextResponse.json(
        { ok: false, error: String(errLike.message || "pipeline_create_failed"), errorCode: String(errLike.errorCode || "") },
        { status: Number(errLike.status || 500) },
      );
    }
  },
  undefined,
  "game/assets/pipeline:create",
  { requireAdmin: true },
);

export const GET = withAuth(
  async (_data, _user, request) => {
    try {
      const { searchParams } = new URL(request.url);
      const status = normalizeString(searchParams.get("status"));

      const result = await listGameAssetPipelines({
        kind: normalizeString(searchParams.get("kind")),
        status: PIPELINE_STATUS_SET.has(status) ? (status as GameAssetPipelineStatusType) : undefined,
        page: Number(searchParams.get("page") || 1),
        pageSize: Number(searchParams.get("pageSize") || 20),
      });

      return NextResponse.json({ ok: true, data: result.items, pagination: result.pagination });
    } catch (error) {
      logger.error("[GameAssetPipeline][GET] failed:", error);
      return NextResponse.json({ ok: false, error: "pipeline_list_failed" }, { status: 500 });
    }
  },
  undefined,
  "game/assets/pipeline:list",
  { requireAdmin: true },
);
