import { NextResponse, type NextRequest } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import type { AuthenticatedUserType, NextRouteContext } from "libs/server-utils/api/_helpers";
import { cancelStudioAudioJobForUser, getStudioAudioJobForUser } from "libs/server-utils/lab/studioAudioJobQueue";
import { toUnknownRecord } from "utils/common";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function safe(value: unknown) {
  return String(value || "").trim();
}

function uidOf(user: AuthenticatedUserType) {
  return safe(user?.uid || user?.ID || user?.id);
}

async function handleGET(_data: unknown, user: AuthenticatedUserType, _request: NextRequest, context: NextRouteContext) {
  const uid = uidOf(user);
  const jobId = safe(context?.params?.jobId);
  if (!uid) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  if (!jobId) return NextResponse.json({ ok: false, error: "jobId_required" }, { status: 400 });
  const job = await getStudioAudioJobForUser({ uid, jobId });
  if (!job) return NextResponse.json({ ok: false, error: "job_not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, data: { job } });
}

async function handlePATCH(data: unknown, user: AuthenticatedUserType, _request: NextRequest, context: NextRouteContext) {
  const uid = uidOf(user);
  const jobId = safe(context?.params?.jobId);
  const body = toUnknownRecord(data);
  if (!uid) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  if (body.action && body.action !== "cancel") return NextResponse.json({ ok: false, error: "action_invalid" }, { status: 400 });
  const result = await cancelStudioAudioJobForUser({ uid, jobId });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error, errorCode: result.errorCode }, { status: result.errorCode === "NOT_FOUND" ? 404 : 409 });
  }
  return NextResponse.json({ ok: true, data: { job: result.job } });
}

export const GET = withAuth(handleGET, undefined, "lab/studio-audio-jobs:read", { bodyParser: "none" });
export const PATCH = withAuth(handlePATCH, undefined, "lab/studio-audio-jobs:cancel", { bodyParser: "json" });
