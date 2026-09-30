import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import type { AuthenticatedUserType, NextRouteContext } from "libs/server-utils/api/_helpers";
import { getImageAssetByAssetId } from "libs/database/lab";
import { canAccessImageAsset, getAuthenticatedUid } from "libs/server-utils/lab/imageAssetAccess";
import { resolveImageAssetDisplayUrl } from "libs/server-utils/lab/imageAssetDisplay";
import {
  LibraryImageUploadError,
  type LibraryImageOptimizationMode,
  overwriteLibraryImageUpload,
  storeLibraryImageUpload,
} from "libs/server-utils/lab/libraryImageUploadService";
import { hasLibraryImageUploadAccess } from "utils/auth/libraryImageUploadAccess";
import { logger } from "utils/log";

export const runtime = "nodejs";

type LibraryImageEditSaveMode = "new" | "overwrite";

async function handlePOST(_data: unknown, user: AuthenticatedUserType, request: NextRequest, ctx: NextRouteContext) {
  if (!hasLibraryImageUploadAccess(user)) {
    return NextResponse.json({ ok: false, error: "membership_required" }, { status: 403 });
  }

  const uid = getAuthenticatedUid(user);
  const assetId = decodeURIComponent(ctx?.params?.assetId || "").trim();
  if (!uid) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  if (!assetId) return NextResponse.json({ ok: false, error: "assetId_required" }, { status: 400 });

  const asset = await getImageAssetByAssetId(assetId);
  if (!asset) return NextResponse.json({ ok: false, error: "asset_not_found" }, { status: 404 });
  if (!(await canAccessImageAsset(user, asset))) {
    return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
  }
  if (asset.provider !== "user-upload" || asset.sourceService !== "upload" || asset.state !== "active") {
    return NextResponse.json({ ok: false, error: "image_edit_target_invalid" }, { status: 409 });
  }

  try {
    const form = await request.formData();
    const file = form.get("file");
    const saveMode = String(form.get("saveMode") || "").trim() as LibraryImageEditSaveMode;
    const optimizationMode = String(form.get("optimizationMode") || "quality").trim() as LibraryImageOptimizationMode;
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "image_file_required" }, { status: 400 });
    }
    if (saveMode !== "new" && saveMode !== "overwrite") {
      return NextResponse.json({ ok: false, error: "invalid_save_mode" }, { status: 400 });
    }
    if (optimizationMode !== "quality" && optimizationMode !== "compact") {
      return NextResponse.json({ ok: false, error: "invalid_optimization_mode" }, { status: 400 });
    }

    const stored =
      saveMode === "overwrite"
        ? await overwriteLibraryImageUpload({ file, uid, asset, optimizationMode })
        : await storeLibraryImageUpload({ file, uid, sourceSurface: "library-edit-copy", optimizationMode });
    const display = await resolveImageAssetDisplayUrl(stored.asset).catch(() => ({
      url: "",
      urlKind: "none" as const,
      urlExpiresAt: undefined,
      refreshUrl: undefined,
    }));
    const storage = stored.asset.storage || {};

    return NextResponse.json({
      ok: true,
      data: {
        saveMode,
        optimizationMode,
        assetId: stored.asset.assetId,
        url: display.url,
        urlKind: display.urlKind,
        urlExpiresAt: display.urlExpiresAt,
        refreshUrl: display.refreshUrl,
        visibility: stored.asset.visibility,
        sourceService: stored.asset.sourceService,
        sourceSurface: stored.asset.sourceSurface,
        width: Number(storage.width || 0) || undefined,
        height: Number(storage.height || 0) || undefined,
        storage: {
          driver: String(storage.driver || ""),
          access: String(storage.access || ""),
          mimeType: String(storage.mimeType || ""),
          ext: String(storage.ext || ""),
          bytes: Number(storage.bytes || 0),
          width: Number(storage.width || 0) || undefined,
          height: Number(storage.height || 0) || undefined,
        },
        sourceBytes: stored.sourceBytes,
        bytes: stored.optimizedBytes,
      },
    });
  } catch (error) {
    logger.error("[library:image-edit] failed", {
      uid,
      assetId,
      code: error instanceof Error ? error.message : "image_edit_failed",
    });
    const status = error instanceof LibraryImageUploadError ? error.status : 500;
    const code = error instanceof LibraryImageUploadError ? error.message : "image_edit_failed";
    return NextResponse.json({ ok: false, error: code }, { status });
  }
}

export const POST = withAuth(handlePOST, undefined, "lab/studio-images:edit", { bodyParser: "none" });
