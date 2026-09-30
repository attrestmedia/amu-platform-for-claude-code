import { NextResponse } from "next/server";
import {
  cancelCommerceWorkflowRun,
  completeCommerceWorkflowStage,
  failCommerceWorkflowStage,
  getCommerceDraftByDraftId,
  getCommerceWorkflowRun,
  resumeCommerceWorkflowRun,
  retryCommerceWorkflowStage,
  startCommerceWorkflowStage,
  type CommerceWorkflowRunRecord,
} from "libs/database/commerce";
import { getCharacterReferenceKitByKitId } from "libs/database/character";
import { getContentAssetByAssetId, getImageAssetByAssetId } from "libs/database/lab";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { validateCommerceWorkflowRunAction } from "libs/server-utils/api/routeValidators";
import { commerceDraftErrorResponse } from "libs/server-utils/commerce/commerceDraftContract";
import {
  buildCommerceApiSuccess,
  CommerceWorkflowRunNotFoundError,
  CommerceWorkflowStateValidationError,
  isCommerceWorkflowState,
  normalizeCommerceWorkflowLineage,
  type CommerceWorkflowState,
} from "libs/server-utils/commerce/commerceWorkflowContract";
import { logger } from "utils/log";
import { toUnknownRecord } from "utils/common";

/**
 * @docHint
 * @purpose API 라우트(universe / [universeId] / commerce / drafts / [draftId] / workflow-runs / [runId]) 기능 요청 처리
 * @process 요청 파싱  인증/권한 검증  단계 시작·완료·실패·재시도·취소·재개 적용  JSON 응답 반환
 * @domain commerce.naver
 * @scope universe
 */

function toSafeString(value: unknown) {
  return value == null ? "" : String(value).trim();
}

function uniqueSafeStrings(value: unknown) {
  return Array.from(new Set((Array.isArray(value) ? value : []).map(toSafeString).filter(Boolean)));
}

function assetBelongsToUniverse(value: unknown, universeId: string) {
  const asset = toUnknownRecord(value);
  return Boolean(asset.assetId) && toSafeString(asset.universeId) === toSafeString(universeId) && toSafeString(asset.scope) === "universe";
}

/**
 * 브라우저가 보낸 workflow evidence·과금값을 신뢰하지 않는다.
 * 이 라우트는 guided-flow의 수동 reconciliation만 담당하므로 비용은 0으로 기록하고,
 * draft에 선택된 ID 중에서도 현재 universe의 실제 asset만 lineage로 남긴다.
 * 실제 AI 생성 비용·job lineage는 서버 생성 라우트가 검증된 결과로 직접 적립한다.
 */
async function buildVerifiedGuidedFlowEvidence(args: {
  draft: unknown;
  universeId: string;
  evidence: unknown;
}) {
  const draft = toUnknownRecord(args.draft);
  const assets = toUnknownRecord(draft.assets);
  const requested = normalizeCommerceWorkflowLineage(toUnknownRecord(args.evidence));
  const selectedKitIds = uniqueSafeStrings(assets.selectedModelReferenceKitIds);
  const selectedImageIds = [
    toSafeString(assets.selectedRepresentativeImageAssetId),
    ...Object.values(toUnknownRecord(assets.variantAssetIds)).flatMap((ids) => uniqueSafeStrings(ids)),
  ].filter(Boolean);
  const selectedContentIds = [toSafeString(assets.selectedDescriptionContentAssetId)].filter(Boolean);

  const [kitRecords, imageRecords, contentRecords] = await Promise.all([
    Promise.all(selectedKitIds.map((kitId) => getCharacterReferenceKitByKitId(kitId))),
    Promise.all(selectedImageIds.map((assetId) => getImageAssetByAssetId(assetId))),
    Promise.all(selectedContentIds.map((assetId) => getContentAssetByAssetId(assetId))),
  ]);
  const verifiedKitIds = selectedKitIds.filter((kitId, index) => {
    const kit = toUnknownRecord(kitRecords[index]);
    return kit && toSafeString(kit.kitId) === kitId && toSafeString(kit.universeId) === toSafeString(args.universeId);
  });
  const verifiedImageIds = selectedImageIds.filter((assetId, index) => {
    const asset = toUnknownRecord(imageRecords[index]);
    return assetBelongsToUniverse(asset, args.universeId) && toSafeString(asset.assetId) === assetId;
  });
  const verifiedContentIds = selectedContentIds.filter((assetId, index) => {
    const asset = toUnknownRecord(contentRecords[index]);
    return assetBelongsToUniverse(asset, args.universeId) && toSafeString(asset.assetId) === assetId;
  });
  const intersect = (requestedIds: string[], verifiedIds: string[]) => {
    const verified = new Set(verifiedIds);
    return requestedIds.filter((id) => verified.has(id));
  };

  return normalizeCommerceWorkflowLineage({
    modelReferenceKitIds: intersect(requested.modelReferenceKitIds, verifiedKitIds),
    outputAssetIds: intersect(requested.outputAssetIds, verifiedImageIds),
    selectedAssetIds: intersect(requested.selectedAssetIds, verifiedContentIds),
  });
}

/** run은 반드시 요청 경로의 universe·draft에 속해야 한다. 소속이 다르면 존재 자체를 노출하지 않는다. */
async function assertRunScope(universeId: string, draftId: string, runId: string) {
  const draft = await getCommerceDraftByDraftId(draftId);
  if (!draft || toSafeString(draft.universeId) !== toSafeString(universeId)) return null;
  const run = await getCommerceWorkflowRun(runId, universeId);
  if (!run || toSafeString(run.draftId) !== toSafeString(draftId)) return null;
  return { draft, run };
}

export const GET = withAuth(
  async (_data, user, _request, context) => {
    try {
      const { universeId, draftId, runId } = context.params as {
        universeId: string;
        draftId: string;
        runId: string;
      };
      const scoped = await assertRunScope(universeId, draftId, runId);
      if (!scoped) {
        return NextResponse.json({ success: false, message: "workflow run을 찾을 수 없습니다." }, { status: 404 });
      }

      logger.info("스마트스토어 workflow run 조회 성공", { userId: user.ID, universeId, draftId, runId });
      return NextResponse.json(buildCommerceApiSuccess({ run: scoped.run }));
    } catch (error) {
      logger.error("스마트스토어 workflow run 조회 실패:", error);
      return commerceDraftErrorResponse(error, "workflow run 조회 중 오류가 발생했습니다.");
    }
  },
  undefined,
  "universe_commerce_workflow_run_detail",
  {
    checkUniversePermission: {
      universeIdParam: "universeId",
      requireEdit: true,
    },
  },
);

export const POST = withAuth(
  async (data, user, _request, context) => {
    try {
      const { universeId, draftId, runId } = context.params as {
        universeId: string;
        draftId: string;
        runId: string;
      };
      const scoped = await assertRunScope(universeId, draftId, runId);
      if (!scoped) {
        return NextResponse.json({ success: false, message: "workflow run을 찾을 수 없습니다." }, { status: 404 });
      }

      const action = toSafeString(data?.action);
      const actor = String(user.ID || "");
      const idempotencyKey = toSafeString(data?.idempotencyKey);
      const rawStage = toSafeString(data?.stage);
      if (action !== "cancel" && action !== "resume" && !isCommerceWorkflowState(rawStage)) {
        throw new CommerceWorkflowStateValidationError(rawStage);
      }
      const stage = rawStage as CommerceWorkflowState;

      let run: CommerceWorkflowRunRecord | null = null;
      if (action === "start_stage") {
        run = await startCommerceWorkflowStage({
          runId,
          universeId,
          stage,
          idempotencyKey,
          estimatedCost: data?.estimatedCost,
          draftRevision: Number(scoped.draft.revision) || 0,
          actor,
        });
      } else if (action === "complete_stage") {
        const verifiedEvidence = await buildVerifiedGuidedFlowEvidence({
          draft: scoped.draft,
          universeId,
          evidence: data?.evidence,
        });
        run = await completeCommerceWorkflowStage({
          runId,
          universeId,
          stage,
          idempotencyKey,
          // completion API는 브라우저가 비용을 신고하는 경로가 아니다. 실제 비용은 생성 라우트가
          // 서버 결과에서 직접 적립한다.
          appliedCost: 0,
          evidence: verifiedEvidence,
          actor,
        });
      } else if (action === "fail_stage") {
        const error = toUnknownRecord(data?.error);
        run = await failCommerceWorkflowStage({
          runId,
          universeId,
          stage,
          idempotencyKey,
          error: {
            code: toSafeString(error.code) || "commerce_workflow_stage_failed",
            message: toSafeString(error.message),
            retryable: error.retryable === undefined ? true : Boolean(error.retryable),
            traceId: toSafeString(error.traceId),
          },
          actor,
        });
      } else if (action === "retry_stage") {
        run = await retryCommerceWorkflowStage({ runId, universeId, stage, actor });
      } else if (action === "cancel") {
        run = await cancelCommerceWorkflowRun({ runId, universeId, reason: toSafeString(data?.reason), actor });
      } else {
        run = await resumeCommerceWorkflowRun({ runId, universeId, actor });
      }

      if (!run) throw new CommerceWorkflowRunNotFoundError(runId);

      logger.info("스마트스토어 workflow run 단계 처리 성공", {
        userId: user.ID,
        universeId,
        draftId,
        runId,
        action,
        stage: action === "cancel" || action === "resume" ? "" : stage,
        status: run.status,
        lifecycle: run.lifecycle,
        appliedCost: run.appliedCost,
      });

      return NextResponse.json(buildCommerceApiSuccess({ run, action }, { idempotencyKey }));
    } catch (error) {
      logger.error("스마트스토어 workflow run 단계 처리 실패:", error);
      return commerceDraftErrorResponse(error, "workflow run 처리 중 오류가 발생했습니다.");
    }
  },
  (data) => validateCommerceWorkflowRunAction(data || {}),
  "universe_commerce_workflow_run_action",
  {
    checkUniversePermission: {
      universeIdParam: "universeId",
      requireEdit: true,
    },
  },
);
