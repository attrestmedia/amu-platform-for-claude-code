import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { withApiTimeout } from "libs/server-utils/api/withApiTimeout";
import { retryMarketingJob } from "libs/marketing/ingest/contentQueueService";
import { isMarketingFeatureEnabled } from "libs/marketing/access";
import { resolveMarketingJobAccess } from "libs/marketing/operator/access";
import { toSafeString } from "utils/common";

/**
 * @docHint
 * @purpose API 라우트(marketing / content-queue / [jobId] / retry) 기능 요청 처리
 * @process 요청 요청 파싱  인증/권한 검증  핵심 처리  JSON 응답 반환
 * @domain marketing
 * @scope operator-api
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const POST = withAuth(
  async (data, user, _request, { params }: { params: Promise<{ jobId: string }> }) =>
    await withApiTimeout(async () => {
      if (!isMarketingFeatureEnabled()) {
        return NextResponse.json({ success: false, message: "마케팅 기능이 비활성화되어 있습니다." }, { status: 404 });
      }

      const { jobId } = await params;
      const access = await resolveMarketingJobAccess({
        user,
        jobId,
        universeId: toSafeString(data?.universeId),
      });
      if (!access.ok) {
        return NextResponse.json({ success: false, error: access.error }, { status: access.status });
      }

      const result = await retryMarketingJob({
        universeId: access.universeId,
        jobId: toSafeString(jobId),
        stepId: toSafeString(data?.stepId),
        reason: toSafeString(data?.reason) || "operator_retry",
        resetTo: "queued",
        requestedBy: toSafeString(user?.userEmail || user?.userEmailLower),
      });

      if (!result.ok) {
        return NextResponse.json({ success: false, error: result.error }, { status: result.status });
      }

      return NextResponse.json({ success: true, data: result });
    }, 20000),
  (data) => ({ valid: !!data, error: !data ? "no body" : undefined }),
  "marketing_content_queue_retry",
);
