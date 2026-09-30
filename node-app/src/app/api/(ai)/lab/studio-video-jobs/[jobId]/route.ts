import { NextResponse, type NextRequest } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import type { AuthenticatedUserType, NextRouteContext } from "libs/server-utils/api/_helpers";
import { getStudioVideoJobForUser } from "libs/server-utils/video/videoGenerationJobQueue";
import { toUnknownRecord } from "utils/common";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

async function handleGET(_data: unknown, user: AuthenticatedUserType, _request: NextRequest, context: NextRouteContext) {
  const record = toUnknownRecord(user);
  const uid = String(record.uid || record.ID || record.id || "").trim();
  const jobId = String(context?.params?.jobId || "").trim();
  if (!uid) return NextResponse.json({ ok: false, error: "UNAUTHORIZED", errorCode: "UNAUTHORIZED" }, { status: 401 });
  if (!jobId) return NextResponse.json({ ok: false, error: "jobId_required", errorCode: "INVALID_INPUT" }, { status: 400 });
  const job = await getStudioVideoJobForUser({ uid, jobId });
  if (!job) return NextResponse.json({ ok: false, error: "job_not_found", errorCode: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ ok: true, data: { job } });
}

export const GET = withAuth(handleGET, undefined, "lab/studio-video-jobs:read", { bodyParser: "none" });
