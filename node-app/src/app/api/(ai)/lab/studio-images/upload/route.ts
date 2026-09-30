import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import { resolveImageAssetDisplayUrl } from "libs/server-utils/lab/imageAssetDisplay";
import {
  LibraryImageUploadError,
  storeLibraryImageUpload,
} from "libs/server-utils/lab/libraryImageUploadService";
import { hasLibraryImageUploadAccess } from "utils/auth/libraryImageUploadAccess";
import { logger } from "utils/log";

export const runtime = "nodejs";

async function handlePOST(_data: unknown, user: AuthenticatedUserType, request: NextRequest) {
  if (!hasLibraryImageUploadAccess(user)) {
    return NextResponse.json({ ok: false, error: "membership_required" }, { status: 403 });
  }

  const uid = String(user?.uid || user?.ID || "").trim();
  if (!uid) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "image_file_required" }, { status: 400 });
    }

    const stored = await storeLibraryImageUpload({ file, uid });
    const display = await resolveImageAssetDisplayUrl(stored.asset).catch(() => ({
      url: "",
      urlKind: "none" as const,
      urlExpiresAt: undefined,
      refreshUrl: undefined,
    }));
    return NextResponse.json({
      ok: true,
      data: {
        assetId: stored.asset.assetId,
        url: display.url,
        urlKind: display.urlKind,
        urlExpiresAt: display.urlExpiresAt,
        refreshUrl: display.refreshUrl,
        visibility: stored.asset.visibility,
        sourceService: stored.asset.sourceService,
        sourceBytes: stored.sourceBytes,
        bytes: stored.optimizedBytes,
      },
    });
  } catch (error) {
    logger.error("[library:image-upload] failed", {
      uid,
      code: error instanceof Error ? error.message : "upload_failed",
    });
    const status = error instanceof LibraryImageUploadError ? error.status : 500;
    const code = error instanceof LibraryImageUploadError ? error.message : "image_upload_failed";
    return NextResponse.json({ ok: false, error: code }, { status });
  }
}

export const POST = withAuth(handlePOST, undefined, "lab/studio-images:upload", { bodyParser: "none" });
