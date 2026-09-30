import { NextRequest, NextResponse } from "next/server";
import { listVideoGenJobs, listVideoAssetsByJobId } from "libs/database/lab";
import { validateAgentKey } from "libs/server-utils/auth/agentKeyAuth";
import { AGENT_VIDEO_POLICY, enforceAgentRequestRateLimit } from "libs/server-utils/auth/agentRateLimit";
import { enqueueStudioVideoJob } from "libs/server-utils/video/videoGenerationJobQueue";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import { extractCodedError } from "utils/common";
import { toUnknownRecord } from "utils/common";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const ENDPOINT = "ai/agent/gen-studio-video-jobs";

function safe(value: unknown) {
  return String(value || "").trim();
}

function parseIds(raw: string | null) {
  return Array.from(new Set(String(raw || "").split(",").map(safe).filter(Boolean))).slice(0, 20);
}

function validateVideoAgentBody(data: unknown) {
  const body = toUnknownRecord(data);
  const prompt = safe(body.prompt);
  if (body.modality !== "video") return { valid: false, error: "modality_invalid" };
  if (!prompt) return { valid: false, error: "prompt_required" };
  if (prompt.length > AGENT_VIDEO_POLICY.maxPromptChars) return { valid: false, error: "prompt_too_long" };
  if (!safe(body.clientRequestId)) return { valid: false, error: "clientRequestId_required" };
  const images = Array.isArray(body.inputImages) ? body.inputImages : [];
  if (images.length > AGENT_VIDEO_POLICY.maxReferenceImages) return { valid: false, error: "too_many_reference_images" };
  return { valid: true };
}

export async function GET(request: NextRequest) {
  try {
    const auth = validateAgentKey(request, { scope: "genstudio:video:read" });
    if (!auth.valid) return NextResponse.json({ ok: false, error: auth.error, errorCode: "UNAUTHORIZED" }, { status: 401 });
    await enforceAgentRequestRateLimit({ uid: auth.uid, endpoint: `${ENDPOINT}:read`, limitPerMinute: AGENT_VIDEO_POLICY.maxReadRequestsPerMinute, keyHash: auth.keyHash, failClosed: true });
    const jobs = await listVideoGenJobs({ uid: auth.uid, jobIds: parseIds(request.nextUrl.searchParams.get("jobIds")), limit: Number(request.nextUrl.searchParams.get("limit") || 8) });
    const transports = await Promise.all(jobs.map(async (job) => {
      const assets = await listVideoAssetsByJobId(job.jobId);
      return { jobId: job.jobId, status: job.status, provider: job.provider, modelName: job.modelName, requestedDurationSeconds: job.requestedDurationSeconds, actualDurationSeconds: job.actualDurationSeconds, estimatedCoins: job.estimatedCoins, actualCoins: job.actualCoins, pricingRevision: job.pricingRevision, assets: assets.map((asset) => asset.assetId), errorCode: job.error?.code, errorMessage: job.error?.message };
    }));
    return NextResponse.json({ ok: true, data: { jobs: transports } });
  } catch (error) {
    const { message, errorCode, status } = extractCodedError(error, { message: "Failed to read video jobs" });
    return NextResponse.json({ ok: false, error: message, errorCode }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = validateAgentKey(request, { scope: "genstudio:video:generate" });
    if (!auth.valid) return NextResponse.json({ ok: false, error: auth.error, errorCode: "UNAUTHORIZED" }, { status: 401 });
    await enforceAgentRequestRateLimit({ uid: auth.uid, endpoint: `${ENDPOINT}:generate`, limitPerMinute: AGENT_VIDEO_POLICY.maxRequestsPerMinute, keyHash: auth.keyHash, failClosed: true });
    const body = await request.json();
    const validation = validateVideoAgentBody(body);
    if (!validation.valid) return NextResponse.json({ ok: false, error: validation.error, errorCode: "INVALID_INPUT" }, { status: 400 });
    const result = await enqueueStudioVideoJob({ request: body, user: { uid: auth.uid, ID: auth.uid } as AuthenticatedUserType });
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error, errorCode: result.errorCode }, { status: result.errorCode === "COIN_INSUFFICIENT" ? 402 : 400 });
    return NextResponse.json({ ok: true, data: { job: result.job, reused: result.reused } }, { status: result.reused ? 200 : 202 });
  } catch (error) {
    const { message, errorCode, status } = extractCodedError(error, { message: "Failed to enqueue video job" });
    return NextResponse.json({ ok: false, error: message, errorCode }, { status });
  }
}
