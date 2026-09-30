import { NextResponse } from "next/server";
import { getCommerceDraftByDraftId, getCommercePublishJob, listCommercePublishJobs } from "libs/database/commerce";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { logger } from "utils/log";
import { toErrorMessage } from "utils/common";

/**
 * @docHint
 * @purpose API 라우트(universe / [universeId] / commerce / drafts / [draftId] / publish-jobs) 기능 요청 처리
 * @process 요청 파싱  인증/권한 검증  publish job 목록 조회  JSON 응답 반환
 * @domain commerce.naver
 * @scope universe
 */

function toSafeString(value: unknown) {
  return value == null ? "" : String(value).trim();
}

export const GET = withAuth(
  async (_data, user, request, context) => {
    try {
      const { universeId, draftId } = context.params as { universeId: string; draftId: string };
      const draft = await getCommerceDraftByDraftId(draftId);
      if (!draft || toSafeString(draft.universeId) !== toSafeString(universeId)) {
        return NextResponse.json({ success: false, message: "draft를 찾을 수 없습니다." }, { status: 404 });
      }

      const jobId = toSafeString(new URL(request.url).searchParams.get("jobId"));
      const selectedJob = jobId ? await getCommercePublishJob(jobId) : null;
      if (jobId && (!selectedJob || toSafeString(selectedJob.universeId) !== toSafeString(universeId) || toSafeString(selectedJob.draftId) !== toSafeString(draftId))) {
        return NextResponse.json({ success: false, message: "publish job을 찾을 수 없습니다." }, { status: 404 });
      }
      const jobs = selectedJob ? [selectedJob] : await listCommercePublishJobs({ universeId, draftId, limit: 10 });

      logger.info("스마트스토어 publish job 목록 조회 성공", {
        userId: user.ID,
        universeId,
        draftId,
        count: jobs.length,
      });

      return NextResponse.json({
        success: true,
        data: {
          jobs,
          job: selectedJob,
          totalCount: jobs.length,
        },
      });
    } catch (error) {
      logger.error("스마트스토어 publish job 목록 조회 실패:", error);
      return NextResponse.json(
        { success: false, message: toErrorMessage(error, "publish job 목록 조회 중 오류가 발생했습니다.") },
        { status: 500 },
      );
    }
  },
  undefined,
  "universe_commerce_draft_publish_jobs",
  {
    checkUniversePermission: {
      universeIdParam: "universeId",
      requireEdit: true,
    },
  },
);
