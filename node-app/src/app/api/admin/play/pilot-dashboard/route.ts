import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { aggregatePilotDashboard } from "libs/server-utils/play/playPilotMetrics";

export const runtime = "nodejs";

/**
 * @docHint
 * @purpose Play 파일럿 내부 allowlist cohort 대시보드 (관리자 전용)
 * @process 관리자 인증  metric 집계  rarity 분포·creation retry율·discovery 완료율 반환
 * @domain play-narrative
 * @scope admin-api
 */

export const GET = withAuth(
  async (_body, _user, request) => {
    const universeId = new URL(request.url).searchParams.get("universeId")?.trim() || "the-universe";
    const dashboard = await aggregatePilotDashboard(universeId);
    return NextResponse.json(
      {
        ok: true,
        data: {
          ...dashboard,
          goNoGo: {
            note: "공개 확대는 OOC-072 판정 전 금지. 최소 관찰 기간은 첫 계측일 기준으로 판정한다.",
            observationFirstAt: dashboard.observation.firstAt,
            observationLastAt: dashboard.observation.lastAt,
          },
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  },
  undefined,
  "admin/play/pilot-dashboard:read",
  { requireAdmin: true, bodyParser: "none" },
);
