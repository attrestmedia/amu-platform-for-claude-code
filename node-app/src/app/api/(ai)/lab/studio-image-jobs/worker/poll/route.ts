import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { withApiTimeout } from "libs/server-utils/api/withApiTimeout";
import { pollStudioImageJobWorker } from "libs/server-utils/lab/studioImageJobQueue";
import { toUnknownRecord } from "utils/common";

/**
 * @docHint
 * @purpose Gen Studio 이미지 생성 서버 worker poll 처리
 * @process 관리자 인증  Redis queue Job claim  이미지 생성 processor 실행  JSON 응답 반환
 * @domain ai-image
 * @scope worker-api
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function toWorkerId(value: unknown) {
  const next = String(value || "").trim();
  return next || `studio-image-worker-${Date.now()}`;
}

export const POST = withAuth(
  async (data) =>
    await withApiTimeout(async () => {
      const body = toUnknownRecord(data);
      const result = await pollStudioImageJobWorker({
        workerId: toWorkerId(body.workerId),
        jobId: String(body.jobId || "").trim(),
      });

      return NextResponse.json({ ok: result.ok, data: result });
    }, 190000),
  (data) => ({ valid: !!data, error: !data ? "no body" : undefined }),
  "lab/studio-image-jobs:worker-poll",
  { requireAdmin: true, bodyParser: "json" },
);

