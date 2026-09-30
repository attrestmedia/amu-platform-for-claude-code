import { NextResponse } from "next/server";
import { listMarketingPromoCreatives } from "libs/database/marketing";
import { assertMarketingUniverseAccess } from "libs/marketing/operator/access";
import { purgeWordPressPromoCache } from "libs/marketing/promo/promoCachePurgeService";
import {
  removeMarketingPromoCreative,
  saveMarketingPromoCreative,
  transitionMarketingPromoCreative,
} from "libs/marketing/promo/promoCreativeService";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { withApiTimeout } from "libs/server-utils/api/withApiTimeout";
import { MARKETING_PROMO_STATUSES, type MarketingPromoStatus } from "models/marketing";
import { toSafeString } from "utils/common/typeUtils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function isAdministrator(user: { roles?: string[] }) {
  return user.roles?.includes("administrator") === true;
}

export const GET = withAuth(
  async (_data, user, request) =>
    withApiTimeout(async () => {
      if (!isAdministrator(user)) {
        return NextResponse.json({ success: false, error: "administrator_required" }, { status: 403 });
      }
      const searchParams = new URL(request.url).searchParams;
      const access = await assertMarketingUniverseAccess({
        user,
        universeId: toSafeString(searchParams.get("universeId")),
      });
      if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status });
      const data = await listMarketingPromoCreatives({ universeId: access.universeId, limit: 300 });
      return NextResponse.json({ success: true, data });
    }, 20_000),
  undefined,
  "marketing_promo_creatives_get",
  { bodyParser: "none" },
);

export const POST = withAuth(
  async (body, user) =>
    withApiTimeout(async () => {
      if (!isAdministrator(user)) {
        return NextResponse.json({ success: false, error: "administrator_required" }, { status: 403 });
      }
      const access = await assertMarketingUniverseAccess({ user, universeId: toSafeString(body?.universeId) });
      if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status });
      const actor = toSafeString(user.userEmail || user.uid);
      const action = toSafeString(body?.action);

      if (action === "save") {
        const result = await saveMarketingPromoCreative({
          universeId: access.universeId,
          creativeId: toSafeString(body?.creativeId) || undefined,
          input: body?.creative,
          actor,
        });
        return NextResponse.json(
          { success: result.ok, data: result.ok ? result.data : null, error: result.ok ? undefined : result.error, issues: result.issues },
          { status: result.ok ? 200 : result.status },
        );
      }

      if (action === "delete") {
        const result = await removeMarketingPromoCreative({
          universeId: access.universeId,
          creativeId: toSafeString(body?.creativeId),
        });
        return NextResponse.json(
          { success: result.ok, data: result.ok ? result.data : null, error: result.ok ? undefined : result.error },
          { status: result.ok ? 200 : result.status },
        );
      }

      if (action === "transition") {
        const nextStatus = toSafeString(body?.nextStatus) as MarketingPromoStatus;
        if (!(MARKETING_PROMO_STATUSES as readonly string[]).includes(nextStatus)) {
          return NextResponse.json({ success: false, error: "promo_status_invalid" }, { status: 400 });
        }
        const result = await transitionMarketingPromoCreative({
          universeId: access.universeId,
          creativeId: toSafeString(body?.creativeId),
          nextStatus,
          actor,
          allowActivation: true,
        });
        if (!result.ok) {
          return NextResponse.json({ success: false, error: result.error, issues: result.issues }, { status: result.status });
        }
        let cachePurge = ["active", "paused", "closed"].includes(nextStatus)
          ? await purgeWordPressPromoCache()
          : { ok: true as const, skipped: true as const };
        if (!cachePurge.ok && ["active", "paused", "closed"].includes(nextStatus)) {
          cachePurge = await purgeWordPressPromoCache();
        }
        return NextResponse.json({ success: true, data: result.data, cachePurge });
      }

      return NextResponse.json({ success: false, error: "unsupported_action" }, { status: 400 });
    }, 30_000),
  (data) => ({ valid: !!data, error: !data ? "no body" : undefined }),
  "marketing_promo_creatives_post",
);
