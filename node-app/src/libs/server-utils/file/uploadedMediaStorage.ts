import "server-only";

import crypto from "crypto";
import sharp from "sharp";
import { MONGODB_APPS_URL } from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import {
  UploadedMediaAssetSchema,
  type IUploadedMediaAssetDocument,
  type UploadedMediaScope,
} from "models/media/UploadedMediaAssetSchema";
import {
  deleteR2Object,
  headR2Object,
  isR2StorageEnabled,
  putR2PublicObject,
} from "libs/server-utils/storage/r2Storage";

const COLLECTION = "uploaded_media_assets";
const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
export const UPLOADED_MEDIA_MAX_BYTES = 10 * 1024 * 1024;

export class UploadedMediaError extends Error {
  readonly status: number;

  constructor(code: string, status: number) {
    super(code);
    this.name = "UploadedMediaError";
    this.status = status;
  }
}

function safeSegment(value: unknown, fallback: string) {
  const raw = String(value || "").trim();
  const visible = raw.normalize("NFKD").replace(/[\u0300-\u036F]/g, "").replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48);
  const hash = crypto.createHash("sha256").update(raw || fallback).digest("hex").slice(0, 12);
  return `${visible || fallback}-${hash}`;
}

function detectImageMime(body: Buffer) {
  if (body.length >= 8 && body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) return "image/jpeg";
  if (body.length >= 12 && body.toString("ascii", 0, 4) === "RIFF" && body.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (body.length >= 6 && ["GIF87a", "GIF89a"].includes(body.toString("ascii", 0, 6))) return "image/gif";
  return "";
}

function extensionForMime(mime: string) {
  return mime === "image/png" ? "png" : mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : "gif";
}

async function getUploadedMediaModel() {
  return getModel<IUploadedMediaAssetDocument>(MONGODB_APPS_URL, "UploadedMediaAsset", UploadedMediaAssetSchema, COLLECTION);
}

export async function storeUploadedMedia(args: {
  file: File;
  scope: UploadedMediaScope;
  ownerId: string;
  universeId?: string;
  kind: string;
  pid: string;
  createdBy: string;
  optimizeImage?: (input: Buffer) => Promise<{
    buffer: Buffer;
    mimeType: string;
    bytes: number;
    width?: number;
    height?: number;
    force?: boolean;
  }>;
  maxOriginalGifBytes?: number;
}) {
  if (!isR2StorageEnabled()) throw new UploadedMediaError("r2_storage_required", 503);
  if (args.file.size <= 0) throw new UploadedMediaError("empty_file", 400);
  if (args.file.size > UPLOADED_MEDIA_MAX_BYTES) throw new UploadedMediaError("file_too_large", 413);

  const sourceBody = Buffer.from(await args.file.arrayBuffer());
  const sourceMimeType = detectImageMime(sourceBody);
  const requestedMime = String(args.file.type || "").split(";")[0].toLowerCase().replace("image/jpg", "image/jpeg");
  if (!ALLOWED_MIME.has(sourceMimeType)) throw new UploadedMediaError("invalid_file_type", 415);
  if (requestedMime && requestedMime !== sourceMimeType) throw new UploadedMediaError("image_mime_mismatch", 415);
  if (
    sourceMimeType === "image/gif" &&
    args.maxOriginalGifBytes !== undefined &&
    sourceBody.length > args.maxOriginalGifBytes
  ) {
    throw new UploadedMediaError("animated_image_too_large", 413);
  }

  const sourceMetadata = await sharp(sourceBody, { animated: false }).metadata();
  const sourceWidth = Number(sourceMetadata.width || 0);
  const sourceHeight = Number(sourceMetadata.height || 0);
  if (!sourceWidth || !sourceHeight || sourceWidth > 12000 || sourceHeight > 12000) {
    throw new UploadedMediaError("image_dimensions_invalid", 422);
  }

  let body: Buffer = sourceBody;
  let mimeType = sourceMimeType;
  let width = sourceWidth;
  let height = sourceHeight;
  let optimized = false;
  if (args.optimizeImage && sourceMimeType !== "image/gif") {
    try {
      const transformed = await args.optimizeImage(sourceBody);
      const transformedWidth = Number(transformed.width || 0);
      const transformedHeight = Number(transformed.height || 0);
      if (!transformedWidth || !transformedHeight || !ALLOWED_MIME.has(transformed.mimeType)) {
        throw new Error("optimized_image_invalid");
      }
      const dimensionsReduced = transformedWidth < sourceWidth || transformedHeight < sourceHeight;
      if (transformed.force || transformed.bytes < sourceBody.length || dimensionsReduced) {
        body = transformed.buffer;
        mimeType = transformed.mimeType;
        width = transformedWidth;
        height = transformedHeight;
        optimized = true;
      }
    } catch {
      throw new UploadedMediaError("image_optimization_failed", 422);
    }
  }

  const assetId = `media_${crypto.randomUUID().replace(/-/g, "")}`;
  const sha256 = crypto.createHash("sha256").update(body).digest("hex");
  const key = [
    "uploads",
    args.scope,
    safeSegment(args.ownerId, "owner"),
    safeSegment(args.kind, "misc"),
    safeSegment(args.pid, "draft"),
    `${assetId}.${extensionForMime(mimeType)}`,
  ].join("/");

  const storage = await putR2PublicObject({ key, body, contentType: mimeType, sha256 });
  const storageMetadata = {
    ...storage,
    mimeType,
    bytes: body.length,
    sha256,
    width,
    height,
    optimization: {
      applied: optimized,
      sourceMimeType,
      sourceBytes: sourceBody.length,
      sourceWidth,
      sourceHeight,
    },
  };
  const verified = await headR2Object({ bucket: storage.bucket, key: storage.key });
  if (!verified || verified.bytes !== body.length || verified.contentType !== mimeType || verified.sha256 !== sha256) {
    await deleteR2Object({ bucket: storage.bucket, key: storage.key }).catch(() => false);
    throw new UploadedMediaError("r2_object_verification_failed", 502);
  }

  try {
    const model = await getUploadedMediaModel();
    const doc = await model.create({
      assetId,
      scope: args.scope,
      ownerId: args.ownerId,
      universeId: args.universeId || "",
      kind: args.kind,
      pid: args.pid,
      originalFilename: String(args.file.name || "").slice(0, 255),
      mimeType,
      bytes: body.length,
      sha256,
      width,
      height,
      storage: storageMetadata,
      state: "active",
      createdBy: args.createdBy,
    });
    return {
      assetId,
      url: storage.url,
      filename: `${assetId}.${extensionForMime(mimeType)}`,
      mimeType,
      bytes: body.length,
      sha256,
      width,
      height,
      optimized,
      sourceBytes: sourceBody.length,
      storage: storageMetadata,
      doc,
    };
  } catch (error) {
    await deleteR2Object({ bucket: storage.bucket, key: storage.key }).catch(() => false);
    throw error;
  }
}

export async function deleteUploadedMedia(args: { url: string; scope: UploadedMediaScope; ownerId: string }) {
  const model = await getUploadedMediaModel();
  const doc = await model.findOne({ "storage.url": args.url, scope: args.scope, ownerId: args.ownerId, state: "active" });
  if (!doc) throw new UploadedMediaError("uploaded_media_not_found", 404);
  const storage = doc.storage || {};
  const bucket = String(storage.bucket || "");
  const key = String(storage.key || "");
  if (!bucket || !key) throw new UploadedMediaError("invalid_storage_metadata", 409);
  await deleteR2Object({ bucket, key });
  doc.state = "deleted";
  doc.deletedAt = new Date();
  await doc.save();
}

export async function isOwnedUploadedMediaUrl(args: { url: string; scope: UploadedMediaScope; ownerId: string; kind?: string }) {
  const model = await getUploadedMediaModel();
  const query: Record<string, unknown> = {
    "storage.url": args.url,
    scope: args.scope,
    ownerId: args.ownerId,
    state: "active",
  };
  if (args.kind) query.kind = args.kind;
  return Boolean(await model.exists(query));
}

export async function getUploadedMediaAsset(args: { assetId: string; scope?: UploadedMediaScope; ownerId?: string }) {
  const model = await getUploadedMediaModel();
  const query: Record<string, unknown> = { assetId: args.assetId, state: "active" };
  if (args.scope) query.scope = args.scope;
  if (args.ownerId) query.ownerId = args.ownerId;
  return await model.findOne(query).lean();
}

export async function listUploadedMedia(args: {
  scope: UploadedMediaScope;
  ownerId: string;
  kind?: string;
  limit?: number;
}) {
  const model = await getUploadedMediaModel();
  const query: Record<string, unknown> = { scope: args.scope, ownerId: args.ownerId, state: "active" };
  if (args.kind) query.kind = args.kind;
  const limit = Math.max(1, Math.min(60, Number(args.limit || 30)));
  return await model.find(query).sort({ createdAt: -1 }).limit(limit).lean();
}
