import { NextResponse, type NextRequest } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import {
  enqueueStudioAudioJob,
  listStudioAudioJobsForUser,
} from "libs/server-utils/lab/studioAudioJobQueue";
import { resolveStudioGenerationSource } from "libs/server-utils/lab/studioGenerationSource";
import { getUniverseById } from "libs/database/universe";
import { canEditUniverse } from "libs/server-utils/auth/userRoleUtils";
import type { IUpdateUserData } from "types/user";
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

function requestBody(data: unknown) {
  const body = toUnknownRecord(data);
  const nested = toUnknownRecord(body.request);
  return Object.keys(nested).length ? nested : body;
}

function validatePost(data: unknown) {
  const body = requestBody(data);
  if (!safe(body.clientRequestId)) return { valid: false, error: "clientRequestId_required" };
  if (!safe(body.sourceRevision)) return { valid: false, error: "sourceRevision_required" };
  if (!safe(body.text)) return { valid: false, error: "text_required" };
  return { valid: true };
}

async function handleGET(_data: unknown, user: AuthenticatedUserType, request: NextRequest) {
  const uid = uidOf(user);
  if (!uid) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  const search = request.nextUrl.searchParams;
  const jobIds = safe(search.get("jobIds")).split(",").map(safe).filter(Boolean).slice(0, 20);
  const jobs = await listStudioAudioJobsForUser({
    uid,
    jobIds: jobIds.length ? jobIds : undefined,
    limit: Math.max(1, Math.min(50, Number(search.get("limit") || 20))),
  });
  return NextResponse.json({ ok: true, data: { jobs } });
}

async function handlePOST(data: unknown, user: AuthenticatedUserType, request: NextRequest) {
  const body = requestBody(data);
  const universeId = safe(body.universeId);
  if (body.scope === "universe" || universeId) {
    if (!universeId) return NextResponse.json({ ok: false, error: "universeId_required" }, { status: 400 });
    const universe = await getUniverseById(universeId);
    if (!universe) return NextResponse.json({ ok: false, error: "universe_not_found" }, { status: 404 });
    if (!canEditUniverse(user as unknown as IUpdateUserData, universe)) {
      return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    }
  }
  const trustedRequest = {
    ...body,
    scope: body.scope === "universe" || universeId ? "universe" : "user",
    sourceService: "gen-studio",
    sourceSurface: (await resolveStudioGenerationSource(request, body.embedSessionId)).surface,
  };
  const result = await enqueueStudioAudioJob({ request: trustedRequest, user });
  if (!result.ok) {
    const status = result.errorCode === "UNAUTHORIZED"
      ? 401
      : result.errorCode === "IDEMPOTENCY_CONFLICT"
        ? 409
        : result.errorCode === "MODEL_DISABLED" || result.errorCode === "MODEL_NOT_SELECTABLE"
          ? 403
          : result.errorCode === "SPEECH_MODEL_NOT_AVAILABLE" || result.errorCode === "PROVIDER_CREDENTIAL_UNAVAILABLE"
            ? 503
            : 400;
    return NextResponse.json({ ok: false, error: result.error, errorCode: result.errorCode }, { status });
  }
  return NextResponse.json({ ok: true, data: result.job }, { status: result.reused ? 200 : 202 });
}

export const GET = withAuth(handleGET, undefined, "lab/studio-audio-jobs:get", { bodyParser: "none" });
export const POST = withAuth(handlePOST, validatePost, "lab/studio-audio-jobs:post", { bodyParser: "json" });
