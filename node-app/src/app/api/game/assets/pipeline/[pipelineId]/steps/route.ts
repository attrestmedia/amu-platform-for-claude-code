import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { normalizeString } from "libs/server-utils/api/apiSafetyHelper";
import { runSpritePipelineStep } from "libs/server-utils/game/spritePipelineOrchestrator";
import { getGameAssetPipelineById } from "libs/database/game";
import { getSpriteDirectionPricingQuote } from "libs/server-utils/game/spriteDirectionGenerationService";
import { logger } from "utils/log";
import { presentSpritePipelineForClient } from "libs/server-utils/game/spritePipelinePresenter";

export const runtime = "nodejs";

/**
 * @docHint
 * @purpose 파이프라인 step 실행 (멱등 — running/success 재호출은 재실행 없이 현재 상태 반환, 중복 과금 차단)
 * @process 요청 파싱  인증/권한 검증  방향 견적 또는 step 원자 시작 판정  생성 실행/dedupe 응답  JSON 응답 반환
 * @domain game.asset-pipeline
 * @scope admin-api
 */

type RouteParams = { pipelineId: string };

export const POST = withAuth(
  async (body, user, _request, { params }: { params: Promise<RouteParams> }) => {
    try {
      const { pipelineId } = await params;
      const uid =
        normalizeString((user as { uid?: string })?.uid) || String((user as { ID?: string | number })?.ID || "");

      const result = await runSpritePipelineStep({
        uid,
        pipelineId,
        stepKey: normalizeString(body?.stepKey),
        direction: normalizeString(body?.direction),
        mirrorConfirmed: body?.mirrorConfirmed === true,
      });

      if (!result.ok) {
        return NextResponse.json(
          { ok: false, error: result.error, errorCode: result.errorCode || "", data: result.pipeline || null },
          { status: Number(result.status || 500) },
        );
      }

      // deduped=true → 202: 이미 실행 중/완료된 step에 대한 재호출 (재실행/재과금 없음)
      return NextResponse.json(
        {
          ok: true,
          data: {
            pipeline: await presentSpritePipelineForClient(result.pipeline),
            deduped: result.deduped,
            reason: result.reason || "",
          },
        },
        { status: result.deduped ? 202 : 200 },
      );
    } catch (error) {
      logger.error("[GameAssetPipeline][POST:steps] failed:", error);
      return NextResponse.json({ ok: false, error: "pipeline_step_failed" }, { status: 500 });
    }
  },
  undefined,
  "game/assets/pipeline:step",
  { requireAdmin: true },
);

export const GET = withAuth(
  async (_body, _user, _request, { params }: { params: Promise<RouteParams> }) => {
    try {
      const { pipelineId } = await params;
      const pipeline = await getGameAssetPipelineById(pipelineId);
      if (!pipeline) return NextResponse.json({ ok: false, error: "pipeline_not_found" }, { status: 404 });
      const quote = await getSpriteDirectionPricingQuote(pipeline);
      return NextResponse.json({ ok: true, data: quote });
    } catch (error) {
      logger.error("[GameAssetPipeline][GET:direction-quote] failed:", error);
      return NextResponse.json(
        { ok: false, error: "direction_pricing_quote_unavailable", errorCode: "DIRECTION_PRICING_QUOTE_UNAVAILABLE" },
        { status: 503 },
      );
    }
  },
  undefined,
  "game/assets/pipeline:direction-quote",
  { requireAdmin: true, bodyParser: "none" },
);
