import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { withApiTimeout } from "libs/server-utils/api/withApiTimeout";
import { pollStudioVideoJobWorker } from "libs/server-utils/video/videoGenerationJobQueue";
import { toUnknownRecord } from "utils/common";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const POST = withAuth(
  async (data) => await withApiTimeout(async () => {
    const body = toUnknownRecord(data);
    const result = await pollStudioVideoJobWorker({
      workerId: String(body.workerId || "").trim() || `studio-video-worker-${Date.now()}`,
      jobId: String(body.jobId || "").trim(),
    });
    return NextResponse.json({ ok: result.ok, data: result });
  }, 190000),
  (data) => ({ valid: !!data, error: !data ? "no body" : undefined }),
  "lab/studio-video-jobs:worker-poll",
  { requireAdmin: true, bodyParser: "json" },
);
