import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { NEWSLETTER_CAMPAIGN_ENABLED } from "consts/env/server";
import { assertMarketingUniverseAccess } from "libs/marketing/operator/access";
import { getNewsletterPerformance } from "libs/server-utils/mail/newsletterPerformanceService";
import { toSafeString } from "utils/common/typeUtils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function boundedDays(value: string | null) {
  const parsed = Number(value || 30);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(180, Math.floor(parsed))) : 30;
}

export const GET = withAuth(
  async (_data, user, request: NextRequest) => {
    if (!NEWSLETTER_CAMPAIGN_ENABLED) {
      return NextResponse.json({ success: false, error: "newsletter_campaign_disabled" }, { status: 404 });
    }
    const search = new URL(request.url).searchParams;
    const requestedUniverseId = toSafeString(search.get("universeId"));
    const access = await assertMarketingUniverseAccess({ user, universeId: requestedUniverseId });
    if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    const data = await getNewsletterPerformance({ universeId: access.universeId, days: boundedDays(search.get("days")) });
    return NextResponse.json({ success: true, data }, { headers: { "Cache-Control": "no-store" } });
  },
  undefined,
  "newsletter_performance_get",
  { requireAdmin: true, bodyParser: "none" },
);

