import { NextRequest, NextResponse } from "next/server";
import { getStudioAudioJobForUser } from "libs/server-utils/lab/studioAudioJobQueue";
import { validateAgentKey } from "libs/server-utils/auth/agentKeyAuth";
import { AGENT_AUDIO_POLICY, enforceAgentRequestRateLimit } from "libs/server-utils/auth/agentRateLimit";
import { extractCodedError } from "utils/common";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * @docHint
 * @purpose Agent/MCP 단일 audio job 조회(소유자 한정, 서버 발급 임시 URL만)
 * @process agent key(genstudio:audio:read) -> fail-closed rate limit -> getStudioAudioJobForUser(uid 소유 필터) -> transport
 * @domain gen-studio
 * @scope agent-api
 */
export async function GET(request: NextRequest, context: { params: { jobId?: string } }) {
  try {
    const auth = validateAgentKey(request, { scope: "genstudio:audio:read" });
    if (!auth.valid) return NextResponse.json({ ok: false, error: auth.error, errorCode: "UNAUTHORIZED" }, { status: 401 });
    await enforceAgentRequestRateLimit({
      uid: auth.uid,
      endpoint: "ai/agent/gen-studio-audio-jobs:read",
      limitPerMinute: AGENT_AUDIO_POLICY.maxReadRequestsPerMinute,
      keyHash: auth.keyHash,
      failClosed: true,
    });
    const jobId = String(context.params?.jobId || "").trim();
    if (!jobId) return NextResponse.json({ ok: false, error: "jobId_required", errorCode: "INVALID_INPUT" }, { status: 400 });
    const job = await getStudioAudioJobForUser({ uid: auth.uid, jobId });
    if (!job) return NextResponse.json({ ok: false, error: "job_not_found", errorCode: "NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ ok: true, data: { job } });
  } catch (error) {
    const { message, errorCode, status } = extractCodedError(error, { message: "Failed to read audio job" });
    return NextResponse.json({ ok: false, error: message, errorCode }, { status });
  }
}
