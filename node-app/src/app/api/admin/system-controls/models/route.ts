import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { listSystemModelControls } from "libs/server-utils/api/systemModelControl";

export const runtime = "nodejs";

/**
 * @docHint
 * @purpose API 라우트(admin / system-controls / models) 조회 처리
 * @process 관리자 인증  모델 설정 조회  JSON 응답 반환
 * @domain system-control
 * @scope admin-api
 */
async function getHandler() {
  const models = await listSystemModelControls();
  return NextResponse.json({ ok: true, models });
}

export const GET = withAuth(getHandler, undefined, "admin/system-controls/models:get", { requireAdmin: true });
