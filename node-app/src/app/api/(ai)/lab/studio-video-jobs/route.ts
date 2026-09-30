import { NextResponse, type NextRequest } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import {
  cancelStudioVideoJobForUser,
  enqueueStudioVideoJob,
  listStudioVideoJobsForUser,
} from "libs/server-utils/video/videoGenerationJobQueue";
import type { VideoGenerationRequest } from "types/ai";
import { toUnknownRecord } from "utils/common";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function resolveUid(user: AuthenticatedUserType) {
  const record = toUnknownRecord(user);
  return String(record.uid || record.ID || record.id || "").trim();
}

function parseJobIds(raw: string | null) {
  return Array.from(new Set(String(raw || "").split(",").map((value) => value.trim()).filter(Boolean))).slice(0, 20);
}

function validateVideoPost(data: unknown) {
  const request = toUnknownRecord(data);
  if (request.modality !== "video") return { valid: false, error: "modality_invalid" };
  if (!String(request.prompt || "").trim()) return { valid: false, error: "prompt_required" };
  if (!String(request.clientRequestId || "").trim()) return { valid: false, error: "clientRequestId_required" };
  if (!String(request.provider || "").trim() || !String(request.modelName || "").trim()) {
    return { valid: false, error: "provider_and_model_required" };
  }
  if (!String(request.mode || "").trim()) return { valid: false, error: "mode_required" };
  return { valid: true };
}

async function handleGET(_data: unknown, user: AuthenticatedUserType, request: NextRequest) {
  const uid = resolveUid(user);
  if (!uid) return NextResponse.json({ ok: false, error: "UNAUTHORIZED", errorCode: "UNAUTHORIZED" }, { status: 401 });
  const jobs = await listStudioVideoJobsForUser({
    uid,
    jobIds: parseJobIds(request.nextUrl.searchParams.get("jobIds")),
    limit: Number(request.nextUrl.searchParams.get("limit") || 8),
  });
  return NextResponse.json({ ok: true, data: { jobs } });
}

async function handlePOST(data: unknown, user: AuthenticatedUserType) {
  const request = toUnknownRecord(data) as unknown as VideoGenerationRequest;
  const result = await enqueueStudioVideoJob({ request, user });
  if (!result.ok) {
    const status = result.errorCode === "COIN_INSUFFICIENT" ? 402 : result.errorCode === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ ok: false, error: result.error, errorCode: result.errorCode }, { status });
  }
  return NextResponse.json({ ok: true, data: { job: result.job, reused: result.reused } }, { status: result.reused ? 200 : 202 });
}

async function handlePATCH(data: unknown, user: AuthenticatedUserType) {
  const jobId = String(toUnknownRecord(data).jobId || "").trim();
  if (!jobId) return NextResponse.json({ ok: false, error: "jobId_required", errorCode: "INVALID_INPUT" }, { status: 400 });
  const result = await cancelStudioVideoJobForUser({ uid: resolveUid(user), jobId });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error, errorCode: result.errorCode }, { status: result.errorCode === "NOT_FOUND" ? 404 : 409 });
  }
  return NextResponse.json({ ok: true, data: { job: result.job } });
}

export const GET = withAuth(handleGET, undefined, "lab/studio-video-jobs:get", { bodyParser: "none" });
export const POST = withAuth(handlePOST, validateVideoPost, "lab/studio-video-jobs:post", { bodyParser: "json" });
export const PATCH = withAuth(handlePATCH, undefined, "lab/studio-video-jobs:cancel", { bodyParser: "json" });
