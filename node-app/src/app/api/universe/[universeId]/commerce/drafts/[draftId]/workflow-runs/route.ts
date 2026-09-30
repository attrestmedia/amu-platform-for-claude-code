import { NextResponse } from "next/server";
import {
  createCommerceWorkflowRun,
  getActiveCommerceWorkflowRun,
  getCommerceDraftByDraftId,
  listCommerceWorkflowRuns,
} from "libs/database/commerce";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { validateCommerceWorkflowRunCreate } from "libs/server-utils/api/routeValidators";
import {
  assertCommerceDraftExpectedRevision,
  commerceDraftErrorResponse,
} from "libs/server-utils/commerce/commerceDraftContract";
import { buildCommerceApiSuccess } from "libs/server-utils/commerce/commerceWorkflowContract";
import { logger } from "utils/log";

/**
 * @docHint
 * @purpose API 라우트(universe / [universeId] / commerce / drafts / [draftId] / workflow-runs) 기능 요청 처리
 * @process 요청 파싱  인증/권한 검증  workflow run 조회 또는 생성·재사용  JSON 응답 반환
 * @domain commerce.naver
 * @scope universe
 */

function toSafeString(value: unknown) {
  return value == null ? "" : String(value).trim();
}

async function loadDraftInUniverse(universeId: string, draftId: string) {
  const draft = await getCommerceDraftByDraftId(draftId);
  if (!draft || toSafeString(draft.universeId) !== toSafeString(universeId)) return null;
  return draft;
}

export const GET = withAuth(
  async (_data, user, _request, context) => {
    try {
      const { universeId, draftId } = context.params as { universeId: string; draftId: string };
      const draft = await loadDraftInUniverse(universeId, draftId);
      if (!draft) return NextResponse.json({ success: false, message: "draft를 찾을 수 없습니다." }, { status: 404 });

      const runs = await listCommerceWorkflowRuns({ universeId, draftId, limit: 10 });
      const activeRun = runs.find((run) => run.lifecycle === "active" || run.lifecycle === "failed") || null;

      logger.info("스마트스토어 workflow run 목록 조회 성공", {
        userId: user.ID,
        universeId,
        draftId,
        count: runs.length,
      });

      return NextResponse.json(
        buildCommerceApiSuccess({ runs, activeRun, totalCount: runs.length }),
      );
    } catch (error) {
      logger.error("스마트스토어 workflow run 목록 조회 실패:", error);
      return commerceDraftErrorResponse(error, "workflow run 목록 조회 중 오류가 발생했습니다.");
    }
  },
  undefined,
  "universe_commerce_workflow_runs_list",
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
      const { universeId, draftId } = context.params as { universeId: string; draftId: string };
      const draft = await loadDraftInUniverse(universeId, draftId);
      if (!draft) return NextResponse.json({ success: false, message: "draft를 찾을 수 없습니다." }, { status: 404 });

      // 화면이 오래된 draft를 보고 있으면 run을 새로 만들지 않는다.
      if (data?.expectedRevision !== undefined) {
        assertCommerceDraftExpectedRevision({ draft, expectedRevision: data.expectedRevision });
      }

      const requestedKey = toSafeString(data?.idempotencyKey);
      // 명시 키가 없으면 draft당 하나의 파이프라인 run을 재사용한다. 저장으로 revision이 올라가도 run은 이어진다.
      if (!requestedKey) {
        const activeRun = await getActiveCommerceWorkflowRun({ universeId, draftId });
        if (activeRun) {
          return NextResponse.json(
            buildCommerceApiSuccess({ run: activeRun, created: false }, { idempotencyKey: activeRun.idempotencyKey }),
          );
        }
      }

      let idempotencyKey = requestedKey || `${draftId}:pipeline`;
      if (!requestedKey) {
        // 취소된 run은 terminal 기록으로 보존한다. 같은 기본 키를 다시 쓰면 repo가 취소된
        // run을 재사용하므로, 가장 최근 취소 기록을 기준으로 결정적인 새 세대 키를 만든다.
        const latestRun = (await listCommerceWorkflowRuns({ universeId, draftId, limit: 1 }))[0];
        if (latestRun?.lifecycle === "cancelled") {
          idempotencyKey = `${draftId}:pipeline:rerun:${latestRun.runId}`;
        }
      }
      const run = await createCommerceWorkflowRun({
        universeId,
        draftId,
        draftRevision: Number(draft.revision) || 1,
        idempotencyKey,
        createdBy: String(user.ID || ""),
        estimatedCost: data?.estimatedCost,
      });

      logger.info("스마트스토어 workflow run 생성/재사용 성공", {
        userId: user.ID,
        universeId,
        draftId,
        runId: run?.runId,
        lifecycle: run?.lifecycle,
      });

      return NextResponse.json(
        buildCommerceApiSuccess({ run, created: Boolean(run && run.runRevision === 1) }, { idempotencyKey }),
      );
    } catch (error) {
      logger.error("스마트스토어 workflow run 생성 실패:", error);
      return commerceDraftErrorResponse(error, "workflow run 생성 중 오류가 발생했습니다.");
    }
  },
  (data) => validateCommerceWorkflowRunCreate({ ...data, draftId: data?.draftId || "__from_route__" }),
  "universe_commerce_workflow_run_create",
  {
    checkUniversePermission: {
      universeIdParam: "universeId",
      requireEdit: true,
    },
  },
);
