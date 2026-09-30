import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import type { AuthenticatedUserType, NextRouteContext } from "libs/server-utils/api/_helpers";
import { getImageAssetByAssetId } from "libs/database/lab";
import { canAccessImageAsset, getAuthenticatedUid } from "libs/server-utils/lab/imageAssetAccess";
import {
  LibraryImageUploadError,
  readEditableLibraryImageUpload,
} from "libs/server-utils/lab/libraryImageUploadService";
import { hasLibraryImageUploadAccess } from "utils/auth/libraryImageUploadAccess";
import { logger } from "utils/log";

export const runtime = "nodejs";

function safeFilename(assetId: string, mimeType: string) {
  const safeAssetId = assetId.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 160) || "image";
  const ext = mimeType === "image/jpeg" ? "jpg" : mimeType === "image/png" ? "png" : "webp";
  return `library-${safeAssetId}.${ext}`;
}

async function handleGET(_data: unknown, user: AuthenticatedUserType, _request: NextRequest, ctx: NextRouteContext) {
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

  try {
    const source = await readEditableLibraryImageUpload(asset);
    return new NextResponse(new Uint8Array(source.buffer), {
      status: 200,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Disposition": `inline; filename="${safeFilename(assetId, source.mimeType)}"`,
        "Content-Length": String(source.bytes),
        "Content-Type": source.mimeType,
        "Cross-Origin-Resource-Policy": "same-origin",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const status = error instanceof LibraryImageUploadError ? error.status : 500;
    const code = error instanceof LibraryImageUploadError ? error.message : "image_edit_source_failed";
    logger.error("[library:image-edit-source] failed", { uid, assetId, code });
    return NextResponse.json({ ok: false, error: code }, { status });
  }
}

export const GET = withAuth(handleGET, undefined, "lab/studio-images:editable-file", { bodyParser: "none" });
