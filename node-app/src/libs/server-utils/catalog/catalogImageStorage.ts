import "server-only";

import crypto from "crypto";
import sharp from "sharp";
import {
  deleteR2Object,
  headR2Object,
  isR2StorageEnabled,
  putR2PublicObject,
} from "libs/server-utils/storage/r2Storage";

export const CATALOG_IMAGE_MAX_BYTES = 3 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 1920;
const ALLOWED_INPUT_MIME = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif"]);

export class CatalogImageStorageError extends Error {
  readonly status: number;

  constructor(code: string, status: number) {
    super(code);
    this.name = "CatalogImageStorageError";
    this.status = status;
  }
}

function safeStorageSegment(value: unknown, fallback: string) {
  const raw = String(value || "").trim();
  const visible = raw.normalize("NFKD").replace(/[\u0300-\u036F]/g, "").replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48);
  const hash = crypto.createHash("sha256").update(raw || fallback).digest("hex").slice(0, 12);
  return `${visible || fallback}-${hash}`;
}

function mimeForSharpFormat(format?: string) {
  if (format === "jpeg") return "image/jpeg";
  if (format === "png") return "image/png";
  if (format === "gif") return "image/gif";
  if (format === "webp") return "image/webp";
  if (format === "heif" || format === "avif") return "image/avif";
  return "";
}

export async function storeCatalogImage(args: {
  file: File;
  userId: string;
  category: string;
  subCategory: string;
}) {
  if (!isR2StorageEnabled()) throw new CatalogImageStorageError("r2_storage_required", 503);
  if (args.file.size <= 0) throw new CatalogImageStorageError("image_empty", 400);
  if (args.file.size > CATALOG_IMAGE_MAX_BYTES) throw new CatalogImageStorageError("image_too_large", 413);

  const input = Buffer.from(await args.file.arrayBuffer());
  const metadata = await sharp(input, { animated: false, failOn: "error" }).metadata();
  const detectedMime = mimeForSharpFormat(metadata.format);
  const requestedMime = String(args.file.type || "").split(";")[0].trim().toLowerCase().replace("image/jpg", "image/jpeg");
  if (!ALLOWED_INPUT_MIME.has(detectedMime)) throw new CatalogImageStorageError("unsupported_image_type", 415);
  if (requestedMime && requestedMime !== detectedMime) throw new CatalogImageStorageError("image_mime_mismatch", 415);
  if (!metadata.width || !metadata.height || metadata.width > 12000 || metadata.height > 12000) {
    throw new CatalogImageStorageError("image_dimensions_invalid", 422);
  }

  const transformed = await sharp(input, { animated: false, failOn: "error" })
    .rotate()
    .resize({ width: MAX_IMAGE_DIMENSION, height: MAX_IMAGE_DIMENSION, fit: sharp.fit.inside, withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer({ resolveWithObject: true });
  const assetId = `catalog_img_${crypto.randomUUID().replace(/-/g, "")}`;
  const sha256 = crypto.createHash("sha256").update(transformed.data).digest("hex");
  const key = [
    "catalog",
    "users",
    safeStorageSegment(args.userId, "user"),
    safeStorageSegment(args.category, "category"),
    safeStorageSegment(args.subCategory, "subcategory"),
    `${assetId}.jpg`,
  ].join("/");
  const storage = await putR2PublicObject({ key, body: transformed.data, contentType: "image/jpeg", sha256 });
  const head = await headR2Object({ bucket: storage.bucket, key: storage.key });
  if (!head || head.bytes !== transformed.data.length || head.contentType !== "image/jpeg" || head.sha256 !== sha256) {
    await deleteR2Object({ bucket: storage.bucket, key: storage.key }).catch(() => false);
    throw new CatalogImageStorageError("r2_object_verification_failed", 502);
  }

  return {
    assetId,
    url: storage.url,
    storage: {
      ...storage,
      mimeType: "image/jpeg",
      bytes: transformed.data.length,
      sha256,
      width: Number(transformed.info.width || 0),
      height: Number(transformed.info.height || 0),
      originalFilename: String(args.file.name || "").slice(0, 255),
      migrationState: "r2",
    },
  };
}

export async function deleteCatalogImageObject(storage: Record<string, unknown>) {
  const bucket = String(storage.bucket || "").trim();
  const key = String(storage.key || "").trim();
  return bucket && key ? deleteR2Object({ bucket, key }) : false;
}
