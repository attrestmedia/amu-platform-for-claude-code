import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { withApiTimeout } from "libs/server-utils/api/withApiTimeout";
import { pollStudioContentJobWorker } from "libs/server-utils/lab/studioContentJobQueue";
import { toUnknownRecord } from "utils/common";

/**
 * @docHint
 * @purpose Gen Studio 콘텐츠 생성 서버 worker poll 처리
 * @process 관리자 인증  Redis queue Job claim  콘텐츠 생성 processor 실행  JSON 응답 반환
 * @domain ai-content
 * @scope worker-api
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function toWorkerId(value: unknown) {
  const next = String(value || "").trim();
  return next || `studio-content-worker-${Date.now()}`;
}

export const POST = withAuth(
  async (data) =>
    await withApiTimeout(async () => {
      const body = toUnknownRecord(data);
      const result = await pollStudioContentJobWorker({
        workerId: toWorkerId(body.workerId),
        jobId: String(body.jobId || "").trim(),
      });

      return NextResponse.json({ ok: result.ok, data: result });
    }, 190000),
  (data) => ({ valid: !!data, error: !data ? "no body" : undefined }),
  "lab/studio-content-jobs:worker-poll",
  { requireAdmin: true, bodyParser: "json" },
);
