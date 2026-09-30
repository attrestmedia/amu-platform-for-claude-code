import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { withApiTimeout } from "libs/server-utils/api/withApiTimeout";
import { isMarketingFeatureEnabled } from "libs/marketing/access";
import { assertMarketingUniverseAccess } from "libs/marketing/operator/access";
import { getMarketingGrowthAnalysis } from "libs/marketing/analytics/marketingGrowthAnalysisService";
import { toSafeString } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose S6 목표·전략·성과 스냅샷 분석 API — 저장된 원장만 읽어 다음 행동 초안을 반환
 * @process 유니버스 권한 검증 → 목표/전략·성과 스냅샷 조회 → 데이터 준비도·퍼널·병렬 트랙·다음 행동 반환
 * @domain marketing
 * @scope operator-api
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function toBoundedInt(value: unknown, fallback: number, min: number, max: number) {
  const next = Number(value || fallback);
  if (!Number.isFinite(next)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(next)));
}

export const GET = withAuth(
  async (_data, user, request) =>
    await withApiTimeout(async () => {
      if (!isMarketingFeatureEnabled()) {
        return NextResponse.json({ success: false, message: "마케팅 기능이 비활성화되어 있습니다." }, { status: 404 });
      }

      const searchParams = request ? new URL(request.url).searchParams : undefined;
      const universeId = toSafeString(searchParams?.get("universeId"));
      const access = await assertMarketingUniverseAccess({ user, universeId });
      if (!access.ok) {
        return NextResponse.json({ success: false, error: access.error }, { status: access.status });
      }

      const data = await getMarketingGrowthAnalysis({
        universeId: access.universeId,
        days: toBoundedInt(searchParams?.get("days"), 28, 1, 180),
        campaignId: toSafeString(searchParams?.get("campaignId")),
        sourceFingerprint: toSafeString(searchParams?.get("sourceFingerprint")),
        draftId: toSafeString(searchParams?.get("draftId")),
      });

      return NextResponse.json({ success: true, data });
    }, 20000),
  undefined,
  "marketing_growth_analysis_get",
  { bodyParser: "none" },
);
