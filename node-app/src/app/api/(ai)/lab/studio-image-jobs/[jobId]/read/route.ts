import { NextResponse, type NextRequest } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import type { AuthenticatedUserType, NextRouteContext } from "libs/server-utils/api/_helpers";
import { markStudioImageJobNotificationRead } from "libs/database/lab";
import { toUnknownRecord } from "utils/common";

/**
 * @docHint
 * @purpose Gen Studio 이미지 생성 Job 알림 읽음 처리
 * @process route params 검증  인증 사용자 소유권 조건으로 readAt 업데이트  JSON 응답 반환
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

async function handlePATCH(_data: unknown, user: AuthenticatedUserType, _request: NextRequest, ctx: NextRouteContext) {
  const uid = resolveUid(user);
  const jobId = String(ctx?.params?.jobId || "").trim();
  if (!uid) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  if (!jobId) return NextResponse.json({ ok: false, error: "jobId_required" }, { status: 400 });

  const updated = await markStudioImageJobNotificationRead({ uid, jobId });
  if (!updated) return NextResponse.json({ ok: false, error: "job_not_found" }, { status: 404 });

  return NextResponse.json({ ok: true, data: { jobId } });
}

export const PATCH = withAuth(handlePATCH, undefined, "lab/studio-image-jobs:read", { bodyParser: "none" });

