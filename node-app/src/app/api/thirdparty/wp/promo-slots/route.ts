import { NextRequest, NextResponse } from "next/server";
import { verifyWpBridgeRequest } from "libs/server-utils/api/wpBridgeAuth";
import { getMarketingPromoSlots } from "libs/marketing/promo/promoCreativeService";
import { MARKETING_PROMO_SLOTS, type MarketingPromoSlot } from "models/marketing";
import { logger } from "utils/log";
import { toErrorMessage, toSafeString } from "utils/common/typeUtils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function values(searchParams: URLSearchParams, key: string, max = 40) {
  return Array.from(
    new Set(
      searchParams
        .getAll(key)
        .flatMap((value) => value.split(","))
        .map((value) => toSafeString(value).toLowerCase())
        .filter(Boolean),
    ),
  ).slice(0, max);
}

function limit(value: string | null) {
  const number = Number(value || 2);
  return Math.max(1, Math.min(5, Number.isFinite(number) ? Math.floor(number) : 2));
}

export async function GET(request: NextRequest) {
  const auth = verifyWpBridgeRequest({ request });
  if (!auth.ok) {
    logger.warn("[thirdparty/wp/promo-slots] auth failed", { error: auth.error });
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const searchParams = new URL(request.url).searchParams;
  const slotId = toSafeString(searchParams.get("slot")) as MarketingPromoSlot;
  if (!(MARKETING_PROMO_SLOTS as readonly string[]).includes(slotId)) {
    return NextResponse.json({ ok: false, error: "promo_slot_invalid" }, { status: 400 });
  }

  try {
    const slots = await getMarketingPromoSlots({
      universeId: toSafeString(process.env.WP_PROMO_UNIVERSE_ID) || "amu",
      context: {
        slotId,
        postId: toSafeString(searchParams.get("postId")).slice(0, 40),
        postSlug: toSafeString(searchParams.get("postSlug")).slice(0, 200),
        categories: values(searchParams, "categorySlug"),
        tags: values(searchParams, "tag"),
        templateKey: toSafeString(searchParams.get("templateKey")).toLowerCase().slice(0, 160),
      },
      limit: limit(searchParams.get("limit")),
    });

    return NextResponse.json(
      { ok: true, site: auth.site, slots },
      { status: 200, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    logger.error("[thirdparty/wp/promo-slots] failed", { error: toErrorMessage(error, "unknown") });
    return NextResponse.json({ ok: false, error: "internal_server_error" }, { status: 500 });
  }
}
