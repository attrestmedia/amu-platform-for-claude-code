import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { withApiTimeout } from "libs/server-utils/api/withApiTimeout";
import { isMarketingFeatureEnabled } from "libs/marketing/access";
import { assertMarketingUniverseAccess } from "libs/marketing/operator/access";
import { getNaverKeywordTrends } from "libs/marketing/analytics/naverTrendService";

/**
 * @docHint
 * @purpose API 라우트(marketing / keyword-profiles/trend) — 후보 키워드 상대 추세 비교 (외부 유료 호출)
 * @process 인증/유니버스 권한 검증  getNaverKeywordTrends(프로필/임시 앵커 override)  상대지수/모멘텀/시즌성 반환
 * @domain marketing
 * @scope operator-api
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function toSafeString(value: unknown, max = 200) {
  return String(value ?? "").trim().slice(0, max);
}

export const POST = withAuth(
  async (data, user) =>
    await withApiTimeout(async () => {
      if (!isMarketingFeatureEnabled()) {
        return NextResponse.json({ success: false, message: "마케팅 기능이 비활성화되어 있습니다." }, { status: 404 });
      }

      const body = (data ?? {}) as Record<string, unknown>;
      const universeId = toSafeString(body.universeId, 120);
      const access = await assertMarketingUniverseAccess({ user, universeId });
      if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status });

      const keywords = Array.isArray(body.candidateKeywords)
        ? (body.candidateKeywords as unknown[]).map((k) => toSafeString(k, 80)).filter(Boolean)
        : [];
      if (keywords.length === 0) {
        return NextResponse.json({ success: false, error: "candidateKeywords_required" }, { status: 400 });
      }

      const timeUnitRaw = toSafeString(body.timeUnit, 10);
      const result = await getNaverKeywordTrends({
        universeId: access.universeId,
        keywords,
        timeUnit: timeUnitRaw === "week" || timeUnitRaw === "date" ? timeUnitRaw : "month",
        profileKey: toSafeString(body.profileKey, 60) || undefined,
        anchorKeyword: toSafeString(body.anchorKeyword, 80) || undefined,
        force: body.force === true,
      });
      if (!result.ok) return NextResponse.json({ success: false, error: result.error }, { status: 409 });
      return NextResponse.json({ success: true, data: result });
    }, 30000),
  (data) => {
    if (!data) return { valid: false, error: "no body" };
    if (!String((data as Record<string, unknown>)?.universeId ?? "").trim()) return { valid: false, error: "universeId_required" };
    return { valid: true };
  },
  "marketing_keyword_profiles_trend",
);
