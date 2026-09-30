import crypto from "crypto";
import path from "path";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { DEFAULT_PLAY_UNIVERSE } from "consts/app";
import { getGameAssetById } from "libs/database/game";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { isR2StorageEnabled, putR2PublicObject } from "libs/server-utils/storage/r2Storage";
import { logger } from "utils/log";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_IMAGE_EDGE = 8192;

function sanitizeSegment(value: unknown) {
  const normalized = String(value ?? "").trim();
  return /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/.test(normalized) ? normalized : null;
}

function sanitizeFileName(value: unknown) {
  const normalized = String(value ?? "")
    .trim()
    .replace(/[/\\?%*:|"<>]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_");
  return normalized ? normalized.slice(-180) : null;
}

function inferExtension(mimeType: string) {
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/webp") return ".webp";
  if (mimeType === "image/jpeg") return ".jpg";
  return "";
}

function inferMimeType(format: string | undefined) {
  if (format === "png") return "image/png";
  if (format === "webp") return "image/webp";
  if (format === "jpeg") return "image/jpeg";
  return null;
}

export const POST = withAuth(
  async (_data, _user, request) => {
    try {
      if (!(request.headers.get("content-type") || "").toLowerCase().includes("multipart/form-data")) {
        return NextResponse.json({ ok: false, error: "multipart_form_required" }, { status: 400 });
      }
      if (!isR2StorageEnabled()) {
        return NextResponse.json({ ok: false, error: "r2_storage_required" }, { status: 503 });
      }

      const form = await request.formData();
      const gameAssetId = sanitizeSegment(form.get("gameAssetId"));
      const requestedUniverseId = sanitizeSegment(form.get("universeId"));
      if (!gameAssetId) {
        return NextResponse.json({ ok: false, error: "gameAssetId_invalid" }, { status: 400 });
      }
      const asset = await getGameAssetById(gameAssetId);
      if (!asset) return NextResponse.json({ ok: false, error: "game_asset_not_found" }, { status: 404 });
      const universeId = sanitizeSegment(asset.universeId) || DEFAULT_PLAY_UNIVERSE;
      if (requestedUniverseId && requestedUniverseId !== universeId) {
        return NextResponse.json({ ok: false, error: "game_asset_universe_mismatch" }, { status: 409 });
      }

      const file = form.get("file");
      if (!file || typeof file !== "object" || !("arrayBuffer" in file)) {
        return NextResponse.json({ ok: false, error: "file_required" }, { status: 400 });
      }
      const imageFile = file as File;
      if (!["image/png", "image/webp", "image/jpeg"].includes(imageFile.type)) {
        return NextResponse.json({ ok: false, error: "unsupported_image_type" }, { status: 415 });
      }
      if (imageFile.size > MAX_FILE_BYTES) {
        return NextResponse.json({ ok: false, error: "image_too_large" }, { status: 413 });
      }

      const body = Buffer.from(await imageFile.arrayBuffer());
      const metadata = await sharp(body).metadata();
      const detectedMimeType = inferMimeType(metadata.format);
      if (!detectedMimeType || detectedMimeType !== imageFile.type) {
        return NextResponse.json({ ok: false, error: "image_type_mismatch" }, { status: 415 });
      }
      const width = Number(metadata.width || 0);
      const height = Number(metadata.height || 0);
      if (!width || !height || width > MAX_IMAGE_EDGE || height > MAX_IMAGE_EDGE) {
        return NextResponse.json({ ok: false, error: "image_dimensions_invalid" }, { status: 422 });
      }

      const preferred = sanitizeFileName(form.get("preferredFileName"));
      const original = sanitizeFileName(imageFile.name) || `edited-asset${inferExtension(imageFile.type)}`;
      const requestedFileName = preferred || original;
      const extension = inferExtension(detectedMimeType);
      const baseName = path.basename(requestedFileName, path.extname(requestedFileName));
      const sha256 = crypto.createHash("sha256").update(body).digest("hex");
      const fileName = `${baseName}-${sha256.slice(0, 12)}${extension}`;
      const key = `game/assets/${universeId}/${gameAssetId}/${fileName}`;
      const stored = await putR2PublicObject({ key, body, contentType: detectedMimeType });

      logger.log("[GameAssetUpload] uploaded", {
        gameAssetId,
        universeId,
        bucket: stored.bucket,
        key: stored.key,
        bytes: body.length,
        sha256,
        width,
        height,
      });

      return NextResponse.json({
        ok: true,
        data: {
          ...stored,
          url: stored.url,
          mimeType: detectedMimeType,
          width,
          height,
          bytes: body.length,
          sha256,
          ext: extension.replace(/^\./, ""),
        },
      });
    } catch (error) {
      logger.error("[GameAssetUpload] failed:", error);
      return NextResponse.json({ ok: false, error: "game_asset_upload_failed" }, { status: 500 });
    }
  },
  undefined,
  "game/assets:upload",
  { requireAdmin: true, bodyParser: "none" },
);
