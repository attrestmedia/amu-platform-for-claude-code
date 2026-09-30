import { NextResponse } from "next/server";
import {
  archiveCommerceDraft,
  getCommerceDraftByDraftId,
  removeCommerceStorefrontProductForDraft,
  snapshotCommerceDraftRevision,
  updateCommerceDraft,
} from "libs/database/commerce";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { validateCommerceDraftPatch } from "libs/server-utils/api/routeValidators";
import { invalidateUniverseDetailPromptCache } from "libs/server-utils/system-prompt/commercePromptData";
import {
  commerceDraftErrorResponse,
  commerceDraftErrorResponseForCode,
} from "libs/server-utils/commerce/commerceDraftContract";
import {
  isSmartstorePipelineStep,
  SMARTSTORE_PIPELINE_STEP_DEFS,
} from "libs/server-utils/commerce/commercePipelineProgressContract";
import { logger } from "utils/log";
import { toErrorMessage, toUnknownRecord } from "utils/common";

/**
 * @docHint
 * @purpose API 라우트(universe / [universeId] / commerce / drafts / [draftId]) 기능 요청 처리
 * @process 요청 파싱  인증/권한 검증  draft 조회/수정/보관 처리  JSON 응답 반환
 * @domain commerce.naver
 * @scope universe
 */

function toSafeString(value: unknown) {
  return value == null ? "" : String(value).trim();
}

function getInvalidPipelineSkippedSteps(patch: unknown) {
  const display = toUnknownRecord(toUnknownRecord(patch).display);
  const progress = toUnknownRecord(display.pipelineProgress);
  if (!Object.prototype.hasOwnProperty.call(progress, "skippedSteps")) return [];
  if (!Array.isArray(progress.skippedSteps)) return [progress.skippedSteps];
  const skippedSteps = progress.skippedSteps;
  return skippedSteps.filter(
    (step) => !isSmartstorePipelineStep(step) || !SMARTSTORE_PIPELINE_STEP_DEFS[step].skippable,
  );
}

function hasPipelineSkippedStepsPatch(patch: unknown) {
  const display = toUnknownRecord(toUnknownRecord(patch).display);
  const progress = toUnknownRecord(display.pipelineProgress);
  return Object.prototype.hasOwnProperty.call(progress, "skippedSteps");
}

export const GET = withAuth(
  async (_data, user, _request, context) => {
    try {
      const { universeId, draftId } = context.params as { universeId: string; draftId: string };
      const draft = await getCommerceDraftByDraftId(draftId);
      if (!draft || toSafeString(draft.universeId) !== toSafeString(universeId)) {
        return NextResponse.json({ success: false, message: "draft를 찾을 수 없습니다." }, { status: 404 });
      }

      logger.info("스마트스토어 draft 상세 조회 성공", {
        userId: user.ID,
        universeId,
        draftId,
      });

      return NextResponse.json({
        success: true,
        data: {
          draft,
        },
      });
    } catch (error) {
      logger.error("스마트스토어 draft 상세 조회 실패:", error);
      return NextResponse.json(
        { success: false, message: toErrorMessage(error, "draft 조회 중 오류가 발생했습니다.") },
        { status: 500 },
      );
    }
  },
  undefined,
  "universe_commerce_draft_detail",
  {
    checkUniversePermission: {
      universeIdParam: "universeId",
      requireEdit: true,
    },
  },
);

export const PATCH = withAuth(
  async (data, user, _request, context) => {
    try {
      const { universeId, draftId } = context.params as { universeId: string; draftId: string };
      const current = await getCommerceDraftByDraftId(draftId);
      if (!current || toSafeString(current.universeId) !== toSafeString(universeId)) {
        return NextResponse.json({ success: false, message: "draft를 찾을 수 없습니다." }, { status: 404 });
      }

      if (
        hasPipelineSkippedStepsPatch(data?.patch) &&
        (data?.expectedRevision === undefined || data?.expectedRevision === null || data?.expectedRevision === "")
      ) {
        return commerceDraftErrorResponseForCode({
          code: "pipeline_step_revision_required",
          message: "단계 건너뛰기는 최신 상품 revision을 확인한 뒤 다시 시도해야 합니다.",
          status: 400,
        });
      }

      const invalidSkippedSteps = getInvalidPipelineSkippedSteps(data?.patch);
      if (invalidSkippedSteps.length > 0) {
        return commerceDraftErrorResponseForCode({
          code: "pipeline_step_not_skippable",
          message: "사진·기본 정보·검토 단계는 건너뛸 수 없습니다.",
          status: 422,
          details: { steps: invalidSkippedSteps.map(toSafeString) },
        });
      }

      const draft = await updateCommerceDraft({
        draftId,
        patch: data?.patch || {},
        updatedBy: String(user.ID || ""),
        expectedRevision: data?.expectedRevision == null ? undefined : Number(data.expectedRevision),
      });

      if (!draft) {
        return NextResponse.json({ success: false, message: "draft를 찾을 수 없습니다." }, { status: 404 });
      }

      await snapshotCommerceDraftRevision({
        draftId,
        actor: String(user.ID || ""),
        source: "manual_edit",
        summary: "draft 수정",
        patchMeta: {
          fields: Object.keys(data?.patch || {}),
        },
      });

      logger.info("스마트스토어 draft 수정 성공", {
        userId: user.ID,
        universeId,
        draftId,
      });

      return NextResponse.json({
        success: true,
        data: {
          draft,
        },
      });
    } catch (error) {
      logger.error("스마트스토어 draft 수정 실패:", error);
      return commerceDraftErrorResponse(error, "draft 수정 중 오류가 발생했습니다.");
    }
  },
  (data) => validateCommerceDraftPatch({ ...data, draftId: data?.draftId || "__from_route__" }),
  "universe_commerce_draft_update",
  {
    checkUniversePermission: {
      universeIdParam: "universeId",
      requireEdit: true,
    },
  },
);

export const DELETE = withAuth(
  async (_data, user, _request, context) => {
    try {
      const { universeId, draftId } = context.params as { universeId: string; draftId: string };
      const current = await getCommerceDraftByDraftId(draftId);
      if (!current || toSafeString(current.universeId) !== toSafeString(universeId)) {
        return NextResponse.json({ success: false, message: "draft를 찾을 수 없습니다." }, { status: 404 });
      }

      const draft = await archiveCommerceDraft({
        draftId,
        actor: String(user.ID || ""),
      });
      await removeCommerceStorefrontProductForDraft(draftId);
      invalidateUniverseDetailPromptCache(universeId);

      await snapshotCommerceDraftRevision({
        draftId,
        actor: String(user.ID || ""),
        source: "manual_edit",
        summary: "draft 보관",
        patchMeta: {
          archived: true,
        },
      });

      logger.info("스마트스토어 draft 보관 성공", {
        userId: user.ID,
        universeId,
        draftId,
      });

      return NextResponse.json({
        success: true,
        data: {
          draft,
        },
      });
    } catch (error) {
      logger.error("스마트스토어 draft 보관 실패:", error);
      return NextResponse.json(
        { success: false, message: toErrorMessage(error, "draft 보관 중 오류가 발생했습니다.") },
        { status: 500 },
      );
    }
  },
  undefined,
  "universe_commerce_draft_archive",
  {
    checkUniversePermission: {
      universeIdParam: "universeId",
      requireEdit: true,
    },
  },
);
