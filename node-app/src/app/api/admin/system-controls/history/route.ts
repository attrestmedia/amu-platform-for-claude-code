import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { listRecentSystemControlAudits } from "libs/database/system";
import type { UnknownRecord } from "utils/common";

export const runtime = "nodejs";

function validateQuery(data: UnknownRecord) {
  if (data?.limit != null && Number.isNaN(Number(data.limit))) {
    return { valid: false, error: "limit 형식이 올바르지 않습니다." };
  }
  return { valid: true };
}

/**
 * @docHint
 * @purpose API 라우트(admin / system-controls / history) 기능 요청 처리
 * @process 인증/권한 검증  최근 시스템 컨트롤 변경 이력 조회  JSON 응답 반환
 * @domain system-control
 * @scope admin-api
 */
async function getHandler(data: UnknownRecord) {
  const audits = await listRecentSystemControlAudits(Number(data?.limit || 20));
  return NextResponse.json({ ok: true, audits });
}

export const GET = withAuth(getHandler, validateQuery, "admin/system-controls/history:get", { requireAdmin: true });
