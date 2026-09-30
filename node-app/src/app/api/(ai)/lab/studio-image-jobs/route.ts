import { NextResponse, type NextRequest } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import { listStudioImageJobNotifications } from "libs/database/lab";
import { getUniverseById } from "libs/database/universe";
import { canEditUniverse } from "libs/server-utils/auth/userRoleUtils";
import {
  enqueueStudioImageJob,
  type StudioImageJobKindType,
} from "libs/server-utils/lab/studioImageJobQueue";
import type { ImagePromptBodyType, ImagePromptCustomType } from "types/app";
import type { IUpdateUserData } from "types/user";
import { toUnknownRecord } from "utils/common";
import { resolveStudioGenerationSource } from "libs/server-utils/lab/studioGenerationSource";

/**
 * @docHint
 * @purpose Gen Studio 이미지 생성 Job 생성 및 알림 목록 조회
 * @process 요청 파싱  인증 사용자 확인  Job enqueue 또는 Job/Asset 목록 조회  JSON 응답 반환
 * @domain ai-image
 * @scope lab-api
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function resolveUid(user: AuthenticatedUserType) {
  const u = toUnknownRecord(user);
  return String(u.uid || u.ID || u.id || "").trim();
}

function parseSince(raw: string | null) {
  if (!raw) return undefined;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function normalizeKind(raw: unknown): StudioImageJobKindType | "" {
  const value = String(raw || "").trim();
  return value === "template-image" || value === "basic-image" ? value : "";
}

function validatePostBody(data: unknown) {
  const body = toUnknownRecord(data);
  const kind = normalizeKind(body.kind);
  const payload = toUnknownRecord(body.payload);
  if (!kind) return { valid: false, error: "kind_invalid" };
  if (!Object.keys(payload).length) return { valid: false, error: "payload_required" };
  if (kind === "template-image" && !String(payload.templateKey || "").trim()) {
    return { valid: false, error: "templateKey_required" };
  }

  const hasPrompt = Boolean(String(payload.prompt || "").trim());
  const hasBaseImage =
    (Array.isArray(payload.baseImages) && payload.baseImages.some((item) => Boolean(toUnknownRecord(item).data))) ||
    (Array.isArray(payload.modelImages) && payload.modelImages.some((item) => Boolean(toUnknownRecord(item).data)));
  if (kind === "basic-image" && !hasPrompt && !hasBaseImage) {
    return { valid: false, error: "prompt_or_baseImage_required" };
  }

  return { valid: true };
}

async function handleGET(_data: unknown, user: AuthenticatedUserType, request: NextRequest) {
  const uid = resolveUid(user);
  if (!uid) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  // jobIds를 지정하면 기간·읽음·상한과 무관하게 그 job만 확정 조회한다 (재사용 결과 전달 경로, SSM-203).
  const jobIds = String(sp.get("jobIds") || "")
    .split(",")
    .map((jobId) => jobId.trim())
    .filter(Boolean)
    .slice(0, 20);
  const jobs = await listStudioImageJobNotifications({
    uid,
    limit: Math.max(1, Math.min(20, Number(sp.get("limit") || 8))),
    unreadOnly: sp.get("unread") === "1" || sp.get("unread") === "true",
    includeRunning: sp.get("includeRunning") !== "0",
    since: parseSince(sp.get("since")),
    jobIds: jobIds.length > 0 ? jobIds : undefined,
  });

  return NextResponse.json({ ok: true, data: { jobs } });
}

async function handlePOST(data: unknown, user: AuthenticatedUserType, request: NextRequest) {
  const body = toUnknownRecord(data);
  const kind = normalizeKind(body.kind);
  if (!kind) return NextResponse.json({ ok: false, error: "kind_invalid" }, { status: 400 });

  const payload = {
    ...toUnknownRecord(body.payload),
    // 클라이언트 입력은 신뢰하지 않고 same-origin Referer를 서버에서 고정 출처로 변환한다.
    source: await resolveStudioGenerationSource(request, toUnknownRecord(body.payload).embedSessionId),
  } as ImagePromptBodyType | ImagePromptCustomType;
  const clientRequestId = String(body.clientRequestId || "").trim();
  const universeId = String(payload.universeId || "").trim();

  if (universeId) {
    const universe = await getUniverseById(universeId);
    if (!universe) return NextResponse.json({ ok: false, error: "universe_not_found" }, { status: 404 });
    if (!canEditUniverse(user as unknown as IUpdateUserData, universe)) {
      return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    }
  }

  const result = await enqueueStudioImageJob({
    kind,
    payload,
    user,
    clientRequestId,
  });

  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 401 });
  return NextResponse.json({ ok: true, data: result.job }, { status: result.job.reused ? 200 : 202 });
}

export const GET = withAuth(handleGET, undefined, "lab/studio-image-jobs:get", { bodyParser: "none" });
export const POST = withAuth(handlePOST, validatePostBody, "lab/studio-image-jobs:post", { bodyParser: "json" });
