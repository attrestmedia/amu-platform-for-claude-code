import { NextResponse } from "next/server";
import { assertMarketingUniverseAccess } from "libs/marketing/operator/access";
import { handleUploadPOST } from "libs/server-utils/file/fileUploadHandler";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { toSafeString } from "utils/common/typeUtils";
import { optimizePromoAssetImage, PROMO_ASSET_IMAGE_POLICY } from "libs/marketing/promo/promoAssetImagePolicy";

export const runtime = "nodejs";

export const POST = withAuth(
  async (_data, user, request) => {
    if (!user.roles?.includes("administrator")) {
      return NextResponse.json({ success: false, error: "administrator_required" }, { status: 403 });
    }
    const form = await request.formData();
    const universeId = toSafeString(form.get("universeId"));
    const access = await assertMarketingUniverseAccess({ user, universeId });
    if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    form.set("kind", "marketing-promo");
    return handleUploadPOST(
      request,
      {
        scope: "universe",
        ownerId: access.universeId,
        universeId: access.universeId,
        createdBy: toSafeString(user.userEmail || user.uid),
        optimizeImage: optimizePromoAssetImage,
        maxOriginalGifBytes: PROMO_ASSET_IMAGE_POLICY.maxAnimatedGifBytes,
      },
      form,
    );
  },
  undefined,
  "marketing_promo_asset_upload",
  { bodyParser: "none" },
);
