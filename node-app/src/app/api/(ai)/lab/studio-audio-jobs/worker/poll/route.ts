import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { withApiTimeout } from "libs/server-utils/api/withApiTimeout";
import { pollStudioAudioJobWorker } from "libs/server-utils/lab/studioAudioJobQueue";
import { toUnknownRecord } from "utils/common";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const POST = withAuth(
  async (data) => await withApiTimeout(async () => {
    const body = toUnknownRecord(data);
    const result = await pollStudioAudioJobWorker({
      workerId: String(body.workerId || "").trim() || `studio-audio-worker-${Date.now()}`,
      jobId: String(body.jobId || "").trim(),
    });
    return NextResponse.json({ ok: result.ok, data: result });
  }, 190000),
  (data) => ({ valid: !!data, error: !data ? "no body" : undefined }),
  "lab/studio-audio-jobs:worker-poll",
  { requireAdmin: true, bodyParser: "json" },
);
