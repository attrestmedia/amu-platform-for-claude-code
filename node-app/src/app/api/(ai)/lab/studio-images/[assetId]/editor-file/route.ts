import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { getImageAssetByAssetId } from "libs/database/lab";
import { canAccessImageAsset } from "libs/server-utils/lab/imageAssetAccess";
import { readLegacyGenStudioImage } from "libs/server-utils/file/genStudioLegacyStorage";
import { getR2ObjectBuffer, headR2Object, isR2PrivateStorage, isR2PublicStorage } from "libs/server-utils/storage/r2Storage";
import type { AuthenticatedUserType, NextRouteContext } from "libs/server-utils/api/_helpers";

export const runtime = "nodejs";

const MAX_EDITOR_ASSET_BYTES = 10 * 1024 * 1024;
const ALLOWED_EDITOR_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

function toSafeString(value: unknown) {
  return String(value || "").trim();
}

function normalizeMimeType(value: unknown) {
  return toSafeString(value).split(";", 1)[0].toLowerCase();
}

function mimeTypeFromLegacyUrl(url: string) {
  const extension = url.split("?", 1)[0].split(".").pop()?.toLowerCase();
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  return "";
}

function imageResponse(buffer: Buffer, mimeType: string, filename?: string) {
  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": mimeType,
      "Content-Length": String(buffer.length),
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": "default-src 'none'; img-src 'self' blob:;",
      "Cross-Origin-Resource-Policy": "same-origin",
      "X-Content-Type-Options": "nosniff",
      ...(filename ? { "Content-Disposition": `attachment; filename="${filename}"` } : {}),
    },
  });
}

async function prepareImageResponse(buffer: Buffer, mimeType: string, assetId: string, format?: "jpg" | "webp") {
  if (!format) return imageResponse(buffer, mimeType);

  try {
    const pipeline = sharp(buffer).rotate();
    const converted =
      format === "jpg"
        ? await pipeline.flatten({ background: "#ffffff" }).jpeg({ quality: 90 }).toBuffer()
        : await pipeline.webp({ quality: 90 }).toBuffer();
    const safeAssetId = assetId.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 160) || "image";
    const extension = format === "jpg" ? "jpg" : "webp";
    return imageResponse(
      converted,
      format === "jpg" ? "image/jpeg" : "image/webp",
      `generated-${safeAssetId}.${extension}`,
    );
  } catch {
    return NextResponse.json({ ok: false, error: "image_download_conversion_failed" }, { status: 422 });
  }
}

async function handler(_data: unknown, user: AuthenticatedUserType, request: NextRequest, context: NextRouteContext) {
  const assetId = decodeURIComponent(context?.params?.assetId || "");
  if (!assetId) return NextResponse.json({ ok: false, error: "assetId_required" }, { status: 400 });

  const searchParams = new URL(request.url).searchParams;
  const downloadRequested = searchParams.get("download") === "1";
  const rawFormat = searchParams.get("format");
  if (downloadRequested && rawFormat && rawFormat !== "jpg" && rawFormat !== "webp") {
    return NextResponse.json({ ok: false, error: "unsupported_download_format" }, { status: 400 });
  }
  const downloadFormat = downloadRequested ? (rawFormat === "jpg" ? "jpg" : "webp") : undefined;

  const asset = await getImageAssetByAssetId(assetId);
  if (!asset || asset.state !== "active") {
    return NextResponse.json({ ok: false, error: "asset_not_found" }, { status: 404 });
  }
  const isPublicAsset = asset.visibility === "public";
  if (!isPublicAsset && !(await canAccessImageAsset(user, asset))) {
    return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
  }

  const storage = asset.storage || {};
  const bucket = toSafeString(storage.bucket);
  const key = toSafeString(storage.key);
  const declaredMimeType = normalizeMimeType(storage.mimeType);
  const declaredBytes = Number(storage.bytes || 0);

  if (isPublicAsset && storage.driver === "r2" && isR2PublicStorage(storage) && bucket && key) {
    const head = await headR2Object({ bucket, key });
    const mimeType = normalizeMimeType(head?.contentType);
    const bytes = Number(head?.bytes || 0);
    if (
      !head ||
      !ALLOWED_EDITOR_MIME.has(mimeType) ||
      (declaredMimeType && declaredMimeType !== mimeType) ||
      (declaredBytes > 0 && declaredBytes !== bytes) ||
      !Number.isInteger(bytes) ||
      bytes <= 0 ||
      bytes > MAX_EDITOR_ASSET_BYTES
    ) {
      return NextResponse.json({ ok: false, error: "editor_asset_verification_failed" }, { status: 409 });
    }

    const buffer = await getR2ObjectBuffer({ bucket, key });
    if (!buffer || buffer.length !== bytes) {
      return NextResponse.json({ ok: false, error: "editor_asset_unavailable" }, { status: 502 });
    }
    return prepareImageResponse(buffer, mimeType, assetId, downloadFormat);
  }

  if (isPublicAsset && storage.driver === "local") {
    const url = toSafeString(storage.url);
    const buffer = url ? await readLegacyGenStudioImage(url) : null;
    const mimeType = declaredMimeType || mimeTypeFromLegacyUrl(url);
    if (!buffer || !ALLOWED_EDITOR_MIME.has(mimeType) || buffer.length <= 0 || buffer.length > MAX_EDITOR_ASSET_BYTES) {
      return NextResponse.json({ ok: false, error: "editor_asset_unavailable" }, { status: 404 });
    }
    return prepareImageResponse(buffer, mimeType, assetId, downloadFormat);
  }

  const mimeType = declaredMimeType;
  const bytes = declaredBytes;
  if (
    asset.visibility !== "private" ||
    storage.driver !== "r2" ||
    !isR2PrivateStorage(storage) ||
    !bucket ||
    !key ||
    !ALLOWED_EDITOR_MIME.has(mimeType) ||
    !Number.isInteger(bytes) ||
    bytes <= 0 ||
    bytes > MAX_EDITOR_ASSET_BYTES
  ) {
    return NextResponse.json({ ok: false, error: "editor_asset_unavailable" }, { status: 404 });
  }

  const head = await headR2Object({ bucket, key });
  if (!head || head.bytes !== bytes || head.contentType !== mimeType) {
    return NextResponse.json({ ok: false, error: "editor_asset_verification_failed" }, { status: 409 });
  }

  const buffer = await getR2ObjectBuffer({ bucket, key });
  if (!buffer || buffer.length !== bytes) {
    return NextResponse.json({ ok: false, error: "editor_asset_unavailable" }, { status: 502 });
  }

  return prepareImageResponse(buffer, mimeType, assetId, downloadFormat);
}

export const GET = withAuth(handler, undefined, "lab/studio-images:editor-file", { bodyParser: "none" });
