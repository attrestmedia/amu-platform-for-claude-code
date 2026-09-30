import "server-only";

import crypto from "crypto";
import sharp, { type Metadata } from "sharp";
import { createImageAssets, replaceImageAssetStorageIfCurrent } from "libs/database/lab";
import { optimizeImageForStorage } from "libs/server-utils/file/imageOptimization";
import {
  deleteR2Object,
  getR2ObjectBuffer,
  headR2Object,
  isR2StorageEnabled,
  putR2PrivateObject,
  putR2PublicObject,
} from "libs/server-utils/storage/r2Storage";
import type { PromptVisibilityType } from "types/app";

export type LibraryImageOptimizationMode = "quality" | "compact";

const LIBRARY_IMAGE_QUALITY_POLICY = Object.freeze({
  maxInputBytes: 10 * 1024 * 1024,
  targetMaxBytes: 1_500 * 1024,
  maxOutputBytes: 5 * 1024 * 1024,
  maxSourceDimension: 12_000,
  format: "webp" as const,
  attempts: [
    { quality: 88, maxWidth: 1_920, maxHeight: 1_920 },
    { quality: 84, maxWidth: 1_920, maxHeight: 1_920 },
    { quality: 80, maxWidth: 1_920, maxHeight: 1_920 },
  ] as const,
});

const LIBRARY_IMAGE_COMPACT_POLICY = Object.freeze({
  ...LIBRARY_IMAGE_QUALITY_POLICY,
  maxOutputBytes: 2 * 1024 * 1024,
  attempts: [
    { quality: 80, maxWidth: 1_920, maxHeight: 1_920 },
    { quality: 72, maxWidth: 1_600, maxHeight: 1_600 },
    { quality: 64, maxWidth: 1_280, maxHeight: 1_280 },
  ] as const,
});

export const LIBRARY_IMAGE_UPLOAD_POLICY = LIBRARY_IMAGE_QUALITY_POLICY;

function resolveLibraryImagePolicy(mode: LibraryImageOptimizationMode) {
  return mode === "compact" ? LIBRARY_IMAGE_COMPACT_POLICY : LIBRARY_IMAGE_QUALITY_POLICY;
}

const ALLOWED_INPUT_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

export class LibraryImageUploadError extends Error {
  readonly status: number;

  constructor(code: string, status: number) {
    super(code);
    this.name = "LibraryImageUploadError";
    this.status = status;
  }
}

function safeStorageSegment(value: string) {
  const visible = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036F]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  const hash = crypto.createHash("sha256").update(value).digest("hex").slice(0, 12);
  return `${visible || "user"}-${hash}`;
}

function mimeForSharpFormat(format?: string) {
  if (format === "jpeg") return "image/jpeg";
  if (format === "png") return "image/png";
  if (format === "webp") return "image/webp";
  return "";
}

type LibraryImageAssetLike = {
  assetId?: string;
  uid?: string;
  provider?: string;
  sourceService?: string;
  state?: string;
  visibility?: PromptVisibilityType;
  storage?: Record<string, unknown>;
};

async function optimizeLibraryImageFile(file: File, optimizationMode: LibraryImageOptimizationMode) {
  const policy = resolveLibraryImagePolicy(optimizationMode);
  if (!isR2StorageEnabled()) throw new LibraryImageUploadError("r2_storage_required", 503);
  if (file.size <= 0) throw new LibraryImageUploadError("image_empty", 400);
  if (file.size > policy.maxInputBytes) {
    throw new LibraryImageUploadError("image_too_large", 413);
  }

  const input = Buffer.from(await file.arrayBuffer());
  let metadata: Metadata;
  try {
    metadata = await sharp(input, { animated: false, failOn: "error" }).metadata();
  } catch {
    throw new LibraryImageUploadError("invalid_image", 415);
  }

  const detectedMime = mimeForSharpFormat(metadata.format);
  const requestedMime = String(file.type || "")
    .split(";")[0]
    .trim()
    .toLowerCase()
    .replace("image/jpg", "image/jpeg");
  if (!ALLOWED_INPUT_MIME.has(detectedMime)) throw new LibraryImageUploadError("unsupported_image_type", 415);
  if (requestedMime && requestedMime !== detectedMime) {
    throw new LibraryImageUploadError("image_mime_mismatch", 415);
  }

  const sourceWidth = Number(metadata.width || 0);
  const sourceHeight = Number(metadata.height || 0);
  if (
    !sourceWidth ||
    !sourceHeight ||
    sourceWidth > policy.maxSourceDimension ||
    sourceHeight > policy.maxSourceDimension
  ) {
    throw new LibraryImageUploadError("image_dimensions_invalid", 422);
  }

  let optimized: Awaited<ReturnType<typeof optimizeImageForStorage>>;
  try {
    optimized = await optimizeImageForStorage(input, policy);
  } catch {
    throw new LibraryImageUploadError("image_optimization_failed", 422);
  }
  if (optimized.bytes > policy.maxOutputBytes) {
    throw new LibraryImageUploadError("optimized_image_too_large", 422);
  }

  return {
    inputBytes: input.length,
    detectedMime,
    sourceWidth,
    sourceHeight,
    optimizationMode,
    optimized,
  };
}

async function putVerifiedLibraryImage(args: {
  uid: string;
  visibility: PromptVisibilityType;
  optimized: Awaited<ReturnType<typeof optimizeImageForStorage>>;
}) {
  const uploadId = crypto.randomUUID().replace(/-/g, "");
  const sha256 = crypto.createHash("sha256").update(args.optimized.buffer).digest("hex");
  const key = `gen-studio/users/${safeStorageSegment(args.uid)}/uploads/${uploadId}.webp`;
  const storage =
    args.visibility === "public"
      ? await putR2PublicObject({
          key,
          body: args.optimized.buffer,
          contentType: args.optimized.mimeType,
          sha256,
        })
      : await putR2PrivateObject({
          key,
          body: args.optimized.buffer,
          contentType: args.optimized.mimeType,
          sha256,
        });

  const verified = await headR2Object({ bucket: storage.bucket, key: storage.key });
  if (
    !verified ||
    verified.bytes !== args.optimized.bytes ||
    verified.contentType !== args.optimized.mimeType ||
    verified.sha256 !== sha256
  ) {
    await deleteR2Object({ bucket: storage.bucket, key: storage.key }).catch(() => false);
    throw new LibraryImageUploadError("r2_object_verification_failed", 502);
  }

  return { uploadId, sha256, storage };
}

function buildLibraryImageStorage(args: {
  file: File;
  prepared: Awaited<ReturnType<typeof optimizeLibraryImageFile>>;
  stored: Awaited<ReturnType<typeof putVerifiedLibraryImage>>;
}) {
  return {
    ...args.stored.storage,
    mimeType: args.prepared.optimized.mimeType,
    ext: args.prepared.optimized.ext,
    bytes: args.prepared.optimized.bytes,
    sha256: args.stored.sha256,
    width: args.prepared.optimized.width,
    height: args.prepared.optimized.height,
    originalFilename: String(args.file.name || "").slice(0, 255),
    optimization: {
      mode: args.prepared.optimizationMode,
      sourceMimeType: args.prepared.detectedMime,
      sourceBytes: args.prepared.inputBytes,
      sourceWidth: args.prepared.sourceWidth,
      sourceHeight: args.prepared.sourceHeight,
    },
  };
}

export async function storeLibraryImageUpload(args: {
  file: File;
  uid: string;
  sourceSurface?: string;
  optimizationMode?: LibraryImageOptimizationMode;
}) {
  if (!args.uid) throw new LibraryImageUploadError("user_id_required", 401);
  const prepared = await optimizeLibraryImageFile(args.file, args.optimizationMode || "quality");
  const stored = await putVerifiedLibraryImage({
    uid: args.uid,
    visibility: "private",
    optimized: prepared.optimized,
  });
  const storage = buildLibraryImageStorage({ file: args.file, prepared, stored });

  try {
    const [asset] = await createImageAssets({
      jobId: `upload_${stored.uploadId}`,
      scope: "user",
      uid: args.uid,
      urls: [],
      provider: "user-upload",
      modelName: "optimized-webp",
      generationMode: "custom",
      sourceService: "upload",
      sourceSurface: String(args.sourceSurface || "library-upload").trim().slice(0, 80),
      deletePolicy: "soft",
      visibility: "private",
      storages: [storage],
    });
    if (!asset) throw new Error("image_asset_registration_failed");
    return { asset, sourceBytes: prepared.inputBytes, optimizedBytes: prepared.optimized.bytes };
  } catch (error) {
    await deleteR2Object({ bucket: storage.bucket, key: storage.key }).catch(() => false);
    throw error;
  }
}

export async function readEditableLibraryImageUpload(asset: LibraryImageAssetLike) {
  if (asset.provider !== "user-upload" || asset.sourceService !== "upload" || asset.state !== "active") {
    throw new LibraryImageUploadError("image_edit_target_invalid", 409);
  }

  const storage = asset.storage || {};
  const bucket = String(storage.bucket || "").trim();
  const key = String(storage.key || "").trim();
  const bytes = Number(storage.bytes || 0);
  const mimeType = String(storage.mimeType || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  const sha256 = String(storage.sha256 || "").trim();

  if (
    storage.driver !== "r2" ||
    !bucket ||
    !key ||
    bytes <= 0 ||
    bytes > LIBRARY_IMAGE_UPLOAD_POLICY.maxOutputBytes ||
    !ALLOWED_INPUT_MIME.has(mimeType) ||
    !/^[a-f0-9]{64}$/i.test(sha256)
  ) {
    throw new LibraryImageUploadError("image_edit_source_storage_invalid", 409);
  }

  const head = await headR2Object({ bucket, key });
  if (!head) throw new LibraryImageUploadError("image_edit_source_unavailable", 502);
  if (head.bytes !== bytes || head.contentType !== mimeType || head.sha256 !== sha256) {
    throw new LibraryImageUploadError("image_edit_source_verification_failed", 409);
  }

  const buffer = await getR2ObjectBuffer({ bucket, key });
  if (!buffer) throw new LibraryImageUploadError("image_edit_source_unavailable", 502);

  const downloadedSha256 = crypto.createHash("sha256").update(buffer).digest("hex");
  if (buffer.length !== bytes || downloadedSha256 !== sha256) {
    throw new LibraryImageUploadError("image_edit_source_verification_failed", 409);
  }

  return { buffer, bytes, mimeType };
}

export async function overwriteLibraryImageUpload(args: {
  file: File;
  uid: string;
  asset: LibraryImageAssetLike;
  optimizationMode?: LibraryImageOptimizationMode;
}) {
  const assetId = String(args.asset.assetId || "").trim();
  const ownerUid = String(args.asset.uid || "").trim();
  if (!args.uid || !assetId || ownerUid !== args.uid) {
    throw new LibraryImageUploadError("image_overwrite_forbidden", 403);
  }
  if (
    args.asset.provider !== "user-upload" ||
    args.asset.sourceService !== "upload" ||
    args.asset.state !== "active"
  ) {
    throw new LibraryImageUploadError("image_overwrite_target_invalid", 409);
  }

  const currentStorage = args.asset.storage || {};
  const currentBucket = String(currentStorage.bucket || "").trim();
  const currentKey = String(currentStorage.key || "").trim();
  const currentBytes = Number(currentStorage.bytes || 0);
  const currentMimeType = String(currentStorage.mimeType || "").trim();
  const currentSha256 = String(currentStorage.sha256 || "").trim();
  if (
    currentStorage.driver !== "r2" ||
    !currentBucket ||
    !currentKey ||
    !currentBytes ||
    !currentMimeType ||
    !currentSha256
  ) {
    throw new LibraryImageUploadError("image_overwrite_storage_invalid", 409);
  }

  const currentHead = await headR2Object({ bucket: currentBucket, key: currentKey });
  if (
    !currentHead ||
    currentHead.bytes !== currentBytes ||
    currentHead.contentType !== currentMimeType ||
    currentHead.sha256 !== currentSha256
  ) {
    throw new LibraryImageUploadError("image_overwrite_source_verification_failed", 409);
  }

  const visibility = args.asset.visibility === "public" ? "public" : "private";
  const prepared = await optimizeLibraryImageFile(args.file, args.optimizationMode || "quality");
  const stored = await putVerifiedLibraryImage({ uid: args.uid, visibility, optimized: prepared.optimized });
  const storage = buildLibraryImageStorage({ file: args.file, prepared, stored });

  try {
    const asset = await replaceImageAssetStorageIfCurrent({
      assetId,
      expectedBucket: currentBucket,
      expectedKey: currentKey,
      storage,
    });
    if (!asset) throw new LibraryImageUploadError("image_overwrite_conflict", 409);

    await deleteR2Object({ bucket: currentBucket, key: currentKey }).catch(() => false);
    return { asset, sourceBytes: prepared.inputBytes, optimizedBytes: prepared.optimized.bytes };
  } catch (error) {
    await deleteR2Object({ bucket: storage.bucket, key: storage.key }).catch(() => false);
    throw error;
  }
}
