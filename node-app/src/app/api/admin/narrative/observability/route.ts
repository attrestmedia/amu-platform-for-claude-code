import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { aggregateNarrativeOperationalStatus } from "libs/server-utils/narrative/narrativeObservability";

export const runtime = "nodejs";

/**
 * @docHint
 * @purpose Narrative Runtime 운영 관측성·kill switch 스냅샷 (관리자 전용, OOC-071)
 * @process 관리자 인증  global flag  Play/Tutors kill switch·guardrail·파일럿 대시보드 통합
 * @domain narrative-operations
 * @scope admin-api
 */

export const GET = withAuth(
  async (_body, _user, request) => {
    const universeId = new URL(request.url).searchParams.get("universeId")?.trim() || "the-universe";
    const status = await aggregateNarrativeOperationalStatus(universeId);
    return NextResponse.json({ ok: true, data: status }, { headers: { "Cache-Control": "no-store" } });
  },
  undefined,
  "admin/narrative/observability:read",
  { requireAdmin: true, bodyParser: "none" },
);
