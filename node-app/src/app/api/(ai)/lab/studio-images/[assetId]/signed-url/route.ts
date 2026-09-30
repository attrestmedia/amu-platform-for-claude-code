import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { getImageAssetByAssetId } from "libs/database/lab";
import { canAccessImageAsset } from "libs/server-utils/lab/imageAssetAccess";
import { resolveImageAssetDisplayUrl } from "libs/server-utils/lab/imageAssetDisplay";
import type { AuthenticatedUserType, NextRouteContext } from "libs/server-utils/api/_helpers";

export const runtime = "nodejs";

async function handler(_data: unknown, user: AuthenticatedUserType, _req: NextRequest, ctx: NextRouteContext) {
  const assetId = decodeURIComponent(ctx?.params?.assetId || "");
  if (!assetId) return NextResponse.json({ ok: false, error: "assetId_required" }, { status: 400 });

  const asset = await getImageAssetByAssetId(assetId);
  if (!asset) return NextResponse.json({ ok: false, error: "asset_not_found" }, { status: 404 });

  const allowed = await canAccessImageAsset(user, asset);
  if (!allowed) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

  const display = await resolveImageAssetDisplayUrl(asset, { delivery: "signed" });
  if (!display.url) return NextResponse.json({ ok: false, error: "asset_url_unavailable" }, { status: 404 });

  return NextResponse.json({
    ok: true,
    data: {
      assetId,
      url: display.url,
      urlKind: display.urlKind,
      urlExpiresAt: display.urlExpiresAt,
      refreshUrl: display.refreshUrl,
    },
  });
}

export const GET = withAuth(handler, undefined, "lab/studio-images:signed-url", { bodyParser: "none" });
