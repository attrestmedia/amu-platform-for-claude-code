import { NextRequest, NextResponse } from "next/server";
import { getVideoGenJobByJobId, toVideoJobTransport } from "libs/database/lab";
import { validateAgentKey } from "libs/server-utils/auth/agentKeyAuth";
import { AGENT_VIDEO_POLICY, enforceAgentRequestRateLimit } from "libs/server-utils/auth/agentRateLimit";
import { extractCodedError } from "utils/common";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest, context: { params: { jobId?: string } }) {
  try {
    const auth = validateAgentKey(request, { scope: "genstudio:video:read" });
    if (!auth.valid) return NextResponse.json({ ok: false, error: auth.error, errorCode: "UNAUTHORIZED" }, { status: 401 });
    await enforceAgentRequestRateLimit({ uid: auth.uid, endpoint: "ai/agent/gen-studio-video-jobs:read", limitPerMinute: AGENT_VIDEO_POLICY.maxReadRequestsPerMinute, keyHash: auth.keyHash, failClosed: true });
    const jobId = String(context.params?.jobId || "").trim();
    const job = await getVideoGenJobByJobId(jobId);
    if (!job || job.uid !== auth.uid) return NextResponse.json({ ok: false, error: "job_not_found", errorCode: "NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ ok: true, data: { job: await toVideoJobTransport(job) } });
  } catch (error) {
    const { message, errorCode, status } = extractCodedError(error, { message: "Failed to read video job" });
    return NextResponse.json({ ok: false, error: message, errorCode }, { status });
  }
}
