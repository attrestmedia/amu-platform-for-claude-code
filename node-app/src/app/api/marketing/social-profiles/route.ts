import { NextResponse } from "next/server";
import { fetchSocialProfiles } from "libs/marketing/profiles/socialProfileService";
import { assertMarketingUniverseAccess } from "libs/marketing/operator/access";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { withApiTimeout } from "libs/server-utils/api/withApiTimeout";
import { toSafeString } from "utils/common/typeUtils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const GET = withAuth(
  async (_data, user, request) =>
    withApiTimeout(async () => {
      const searchParams = new URL(request.url).searchParams;
      const access = await assertMarketingUniverseAccess({
        user,
        universeId: toSafeString(searchParams.get("universeId")),
      });
      if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status });
      const channels = toSafeString(searchParams.get("channel")).split(",").map(toSafeString).filter(Boolean);
      const data = await fetchSocialProfiles({ universeId: access.universeId, channels });
      return NextResponse.json({ success: true, data });
    }, 30_000),
  undefined,
  "marketing_social_profiles_get",
  { bodyParser: "none" },
);
