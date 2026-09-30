import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { normalizeString } from "libs/server-utils/api/apiSafetyHelper";
import {
  getGameAssetPipelineById,
  getPipelineStepState,
  resetPipelineStepAtomic,
} from "libs/database/game";
import {
  SPRITE_PIPELINE_STEP_KEYS,
  type SpritePipelineStepKeyType,
} from "types/game/asset-pipeline";
import { SPRITE_PIPELINE_STEP_RUNNING_STATUS } from "utils/game/assetPipeline";
import { logger } from "utils/log";

export const runtime = "nodejs";

/**
 * @docHint
 * @purpose 소진되거나 잘못 집계된 파이프라인 step attempt를 관리자 감사 로그와 함께 복구
 * @process 요청 검증  관리자 인증  pipeline/step 상태 확인  exact-attempt 원자 reset  감사 이력 포함 응답
 * @domain game.asset-pipeline
 * @scope admin-api
 */

type RouteParams = { pipelineId: string };

export const POST = withAuth(
  async (body, user, _request, { params }: { params: Promise<RouteParams> }) => {
    try {
      const { pipelineId } = await params;
      const stepKey = normalizeString(body?.stepKey) as SpritePipelineStepKeyType;
      const reason = normalizeString(body?.reason);
      const resetBy =
        normalizeString((user as { uid?: string })?.uid) ||
        String((user as { ID?: string | number })?.ID || "");

      if (!SPRITE_PIPELINE_STEP_KEYS.includes(stepKey)) {
        return NextResponse.json(
          { ok: false, error: "invalid_step_key", errorCode: "INVALID_STEP_KEY" },
          { status: 400 },
        );
      }
      if (reason.length < 8 || reason.length > 500) {
        return NextResponse.json(
          { ok: false, error: "reset_reason_invalid", errorCode: "RESET_REASON_INVALID" },
          { status: 400 },
        );
      }

      const pipeline = await getGameAssetPipelineById(pipelineId);
      if (!pipeline) {
        return NextResponse.json(
          { ok: false, error: "pipeline_not_found", errorCode: "PIPELINE_NOT_FOUND" },
          { status: 404 },
        );
      }
      if (pipeline.status === "composed") {
        return NextResponse.json(
          { ok: false, error: "composed_pipeline_reset_forbidden", errorCode: "PIPELINE_RESET_FORBIDDEN" },
          { status: 409 },
        );
      }

      const step = getPipelineStepState(pipeline, stepKey);
      const attempt = Math.max(0, Number(step?.attempt || 0));
      if (!step || !["pending", "failed"].includes(step.status) || attempt < 1) {
        return NextResponse.json(
          { ok: false, error: "pipeline_step_not_resettable", errorCode: "PIPELINE_STEP_NOT_RESETTABLE" },
          { status: 409 },
        );
      }

      const reset = await resetPipelineStepAtomic({
        pipelineId,
        stepKey,
        expectedAttempt: attempt,
        pipelineStatus: SPRITE_PIPELINE_STEP_RUNNING_STATUS[stepKey],
        reason,
        resetBy,
      });
      if (!reset) {
        const latest = await getGameAssetPipelineById(pipelineId);
        return NextResponse.json(
          {
            ok: false,
            error: "pipeline_step_state_changed",
            errorCode: "PIPELINE_STEP_STATE_CHANGED",
            data: latest,
          },
          { status: 409 },
        );
      }

      return NextResponse.json({ ok: true, data: reset });
    } catch (error) {
      logger.error("[GameAssetPipeline][POST:reset] failed:", error);
      return NextResponse.json(
        { ok: false, error: "pipeline_step_reset_failed", errorCode: "PIPELINE_STEP_RESET_FAILED" },
        { status: 500 },
      );
    }
  },
  undefined,
  "game/assets/pipeline:reset",
  { requireAdmin: true },
);
