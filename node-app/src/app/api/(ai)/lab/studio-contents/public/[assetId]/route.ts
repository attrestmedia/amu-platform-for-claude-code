import { NextResponse } from "next/server";
import { getContentAssetByAssetId } from "libs/database/lab";
import type { NextRouteContext } from "libs/server-utils/api/_helpers";
import { truncateContentAssetPreview } from "utils/lab/contentAssetPreview";

export const runtime = "nodejs";

function toSafeString(value: unknown) {
  return String(value || "").trim();
}

export async function GET(_request: Request, context: NextRouteContext) {
  const params = await Promise.resolve(context?.params);
  const assetId = decodeURIComponent(params?.assetId || "");
  if (!assetId) return NextResponse.json({ ok: false, error: "assetId_required" }, { status: 400 });

  const asset = await getContentAssetByAssetId(assetId);
  if (!asset || asset.state !== "active" || asset.visibility !== "public") {
    return NextResponse.json({ ok: false, error: "asset_not_found" }, { status: 404 });
  }

  const text = String(asset?.content?.text || "");
  return NextResponse.json(
    {
      ok: true,
      data: {
        canEdit: false,
        isOwner: false,
        assetId: toSafeString(asset.assetId),
        text,
        textPreview: truncateContentAssetPreview(text),
        templateKey: toSafeString(asset.templateKey),
        visibility: "public",
        createdAt: asset.createdAt || null,
        provider: toSafeString(asset.provider),
        modelName: toSafeString(asset.modelName),
        generationMode: toSafeString(asset.generationMode),
        state: toSafeString(asset.state),
        outputIndex: Number(asset.outputIndex || 0),
        content: {
          chars: Number(asset?.content?.chars || 0),
          bytes: Number(asset?.content?.bytes || 0),
        },
      },
    },
    { headers: { "Cache-Control": "public, max-age=30, s-maxage=60, stale-while-revalidate=300" } },
  );
}
