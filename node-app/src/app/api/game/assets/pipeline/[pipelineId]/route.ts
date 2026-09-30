import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { getGameAssetPipelineById } from "libs/database/game";
import { logger } from "utils/log";
import { presentSpritePipelineForClient } from "libs/server-utils/game/spritePipelinePresenter";

export const runtime = "nodejs";

/**
 * @docHint
 * @purpose 파이프라인 상태 폴링 조회 (admin 전용 — 클라이언트 타임아웃과 무관하게 진행 상태 확인)
 * @process 요청 파싱  인증/권한 검증  pipelineId 조회  JSON 응답 반환
 * @domain game.asset-pipeline
 * @scope admin-api
 */

type RouteParams = { pipelineId: string };

export const GET = withAuth(
  async (_data, _user, _request, { params }: { params: Promise<RouteParams> }) => {
    try {
      const { pipelineId } = await params;
      const pipeline = await getGameAssetPipelineById(pipelineId);
      if (!pipeline) {
        return NextResponse.json({ ok: false, error: "pipeline_not_found" }, { status: 404 });
      }
      return NextResponse.json({ ok: true, data: await presentSpritePipelineForClient(pipeline) });
    } catch (error) {
      logger.error("[GameAssetPipeline][GET:id] failed:", error);
      return NextResponse.json({ ok: false, error: "pipeline_get_failed" }, { status: 500 });
    }
  },
  undefined,
  "game/assets/pipeline:get",
  { requireAdmin: true },
);
