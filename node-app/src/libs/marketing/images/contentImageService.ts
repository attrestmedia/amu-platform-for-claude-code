import "server-only";

import crypto from "crypto";
import {
  createMarketingAsset,
  createMarketingAssetId,
  getMarketingJobByJobId,
  hasActiveMarketingAssetReference,
  listMarketingAssets,
  updateMarketingAssetsByIds,
} from "libs/database/marketing";
import {
  deleteR2Object,
  getR2PublicBucket,
  isR2StorageEnabled,
  putR2PublicObject,
  r2ObjectExists,
} from "libs/server-utils/storage/r2Storage";
import { toSafeString, toUnknownRecord } from "utils/common/typeUtils";
import { logger } from "utils/log";

const MARKETING_CONTENT_IMAGE_KIND = "uploaded_image";
export const MARKETING_CONTENT_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const MARKETING_CONTENT_IMAGE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const MARKETING_CONTENT_IMAGE_DRAFT_PROTECTION_MS = 90 * 24 * 60 * 60 * 1000;
export const MARKETING_CONTENT_IMAGE_PUBLISHED_PROTECTION_MS = 180 * 24 * 60 * 60 * 1000;
const MARKETING_CONTENT_IMAGE_CACHE_CONTROL = "public, max-age=300, must-revalidate";
const MARKETING_CONTENT_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

type MarketingContentImageCursor = {
  createdAt: string;
  assetId: string;
};

export class MarketingContentImageError extends Error {
  status: number;

  constructor(code: string, status: number) {
    super(code);
    this.name = "MarketingContentImageError";
    this.status = status;
  }
}

function safeStorageSegment(value: unknown, fallback: string) {
  const raw = toSafeString(value);
  const normalized = raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036F]/g, "")
    .replace(/[^a-zA-Z0-9._:-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  const suffix = crypto.createHash("sha256").update(raw || fallback).digest("hex").slice(0, 12);
  return `${normalized || fallback}-${suffix}`;
}

function normalizeMimeType(value: unknown) {
  const mimeType = toSafeString(value).split(";")[0].toLowerCase();
  return mimeType === "image/jpg" ? "image/jpeg" : mimeType;
}

function detectImageMimeType(body: Buffer) {
  if (body.length >= 8 && body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) return "image/jpeg";
  if (body.length >= 12 && body.toString("ascii", 0, 4) === "RIFF" && body.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }
  if (body.length >= 6 && ["GIF87a", "GIF89a"].includes(body.toString("ascii", 0, 6))) return "image/gif";
  return "";
}

function extensionForMimeType(mimeType: string) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  return "gif";
}

function encodeCursor(cursor: MarketingContentImageCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(value: unknown): MarketingContentImageCursor | null {
  const raw = toSafeString(value);
  if (!raw) return null;
  if (raw.length > 2048) throw new MarketingContentImageError("invalid_cursor", 400);

  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Partial<MarketingContentImageCursor>;
    const createdAt = toSafeString(parsed.createdAt);
    const assetId = toSafeString(parsed.assetId);
    if (!createdAt || !assetId || Number.isNaN(new Date(createdAt).getTime())) throw new Error("invalid_cursor");
    return { createdAt, assetId };
  } catch {
    throw new MarketingContentImageError("invalid_cursor", 400);
  }
}

export function serializeMarketingContentImage(asset: unknown) {
  const record = toUnknownRecord(asset);
  const content = toUnknownRecord(record.content);
  const storage = toUnknownRecord(content.storage);
  const createdAt = record.createdAt instanceof Date ? record.createdAt.toISOString() : toSafeString(record.createdAt);
  const updatedAt = record.updatedAt instanceof Date ? record.updatedAt.toISOString() : toSafeString(record.updatedAt);

  return {
    assetId: toSafeString(record.assetId),
    jobId: toSafeString(record.jobId),
    universeId: toSafeString(record.universeId),
    kind: toSafeString(record.kind),
    state: toSafeString(record.state),
    title: toSafeString(record.title),
    mimeType: toSafeString(record.mimeType),
    url: toSafeString(storage.url),
    bytes: Math.max(0, Number(storage.bytes || 0)),
    originalFilename: toSafeString(content.originalFilename),
    retentionMode: toSafeString(content.retentionMode),
    expiresAt: toSafeString(content.expiresAt) || null,
    protectedUntil: toSafeString(content.protectedUntil) || null,
    lastReferencedAt: toSafeString(content.lastReferencedAt) || null,
    hardDeletedAt: toSafeString(content.hardDeletedAt) || null,
    createdAt,
    updatedAt,
  };
}

export async function uploadMarketingContentImage(args: {
  universeId: string;
  jobId: string;
  originalFilename: string;
  mimeType: string;
  body: Buffer;
  retained?: boolean;
  requestedBy?: string;
}) {
  const universeId = toSafeString(args.universeId);
  const jobId = toSafeString(args.jobId);
  if (!universeId) throw new MarketingContentImageError("universe_id_required", 400);
  if (!jobId) throw new MarketingContentImageError("job_id_required", 400);
  if (!Buffer.isBuffer(args.body) || args.body.length === 0) {
    throw new MarketingContentImageError("image_file_required", 400);
  }
  if (args.body.length > MARKETING_CONTENT_IMAGE_MAX_BYTES) {
    throw new MarketingContentImageError("image_too_large", 413);
  }

  const detectedMimeType = detectImageMimeType(args.body);
  const requestedMimeType = normalizeMimeType(args.mimeType);
  if (!MARKETING_CONTENT_IMAGE_MIME_TYPES.has(detectedMimeType)) {
    throw new MarketingContentImageError("unsupported_image_type", 415);
  }
  if (requestedMimeType && requestedMimeType !== detectedMimeType) {
    throw new MarketingContentImageError("image_mime_mismatch", 400);
  }
  if (!isR2StorageEnabled()) {
    throw new MarketingContentImageError("r2_storage_required", 503);
  }

  const job = await getMarketingJobByJobId(jobId);
  if (!job) throw new MarketingContentImageError("job_not_found", 404);
  if (toSafeString(job.universeId) !== universeId) {
    throw new MarketingContentImageError("job_universe_mismatch", 403);
  }

  const assetId = createMarketingAssetId();
  const objectId = crypto.randomUUID().replace(/-/g, "");
  const key = [
    "marketing-content",
    "universes",
    safeStorageSegment(universeId, "universe"),
    assetId,
    `${objectId}.${extensionForMimeType(detectedMimeType)}`,
  ].join("/");
  const sha256 = crypto.createHash("sha256").update(args.body).digest("hex");
  const retained = args.retained === true;
  const expiresAt = retained ? null : new Date(Date.now() + MARKETING_CONTENT_IMAGE_TTL_MS).toISOString();

  let storage: Awaited<ReturnType<typeof putR2PublicObject>>;
  try {
    storage = await putR2PublicObject({
      key,
      body: args.body,
      contentType: detectedMimeType,
      cacheControl: MARKETING_CONTENT_IMAGE_CACHE_CONTROL,
    });
    if (!(await r2ObjectExists({ bucket: storage.bucket, key: storage.key }))) {
      await deleteR2Object({ bucket: storage.bucket, key: storage.key }).catch(() => false);
      throw new MarketingContentImageError("r2_object_verification_failed", 502);
    }
  } catch (error) {
    if (error instanceof MarketingContentImageError) throw error;
    logger.error("[marketing/content-images] R2 upload failed", { error, universeId, jobId, assetId, key });
    throw new MarketingContentImageError("r2_upload_failed", 502);
  }

  try {
    const asset = await createMarketingAsset({
      assetId,
      jobId,
      universeId,
      kind: MARKETING_CONTENT_IMAGE_KIND,
      title: toSafeString(args.originalFilename).slice(0, 255) || "image",
      mimeType: detectedMimeType,
      state: "active",
      content: {
        storage: {
          ...storage,
          mimeType: detectedMimeType,
          bytes: args.body.length,
          sha256,
        },
        originalFilename: toSafeString(args.originalFilename).slice(0, 255) || "image",
        retentionMode: retained ? "retained" : "temporary",
        expiresAt,
        protectedUntil: null,
        lastReferencedAt: null,
        hardDeletedAt: null,
      },
      meta: {
        uploadedBy: toSafeString(args.requestedBy),
        uploadSource: "marketing_ops_review",
      },
    });
    return serializeMarketingContentImage(asset);
  } catch (error) {
    const rollbackDeleted = await deleteR2Object({ bucket: storage.bucket, key: storage.key }).catch(() => false);
    logger.error("[marketing/content-images] registry create failed", {
      error,
      universeId,
      jobId,
      assetId,
      key,
      rollbackDeleted,
    });
    throw new MarketingContentImageError("marketing_image_registry_failed", 500);
  }
}

export async function listMarketingContentImages(args: { universeId: string; limit?: number; cursor?: string }) {
  const universeId = toSafeString(args.universeId);
  if (!universeId) throw new MarketingContentImageError("universe_id_required", 400);

  const requestedLimit = Number(args.limit || 60);
  const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(100, Math.floor(requestedLimit))) : 60;
  const cursor = decodeCursor(args.cursor);
  const rows = await listMarketingAssets({
    universeId,
    kind: MARKETING_CONTENT_IMAGE_KIND,
    state: "active",
    beforeCreatedAt: cursor?.createdAt,
    beforeAssetId: cursor?.assetId,
    limit: limit + 1,
  });
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit).map(serializeMarketingContentImage);
  const last = hasMore ? items[items.length - 1] : null;

  return {
    items,
    nextCursor:
      last?.createdAt && last.assetId
        ? encodeCursor({ createdAt: last.createdAt, assetId: last.assetId })
        : null,
  };
}

export async function setMarketingContentImageRetention(args: {
  universeId: string;
  assetId: string;
  retained: boolean;
  updatedBy?: string;
}) {
  const universeId = toSafeString(args.universeId);
  const assetId = toSafeString(args.assetId);
  if (!universeId) throw new MarketingContentImageError("universe_id_required", 400);
  if (!assetId) throw new MarketingContentImageError("asset_id_required", 400);

  const [asset] = await listMarketingAssets({
    universeId,
    assetIds: [assetId],
    kind: MARKETING_CONTENT_IMAGE_KIND,
    state: "active",
    limit: 1,
  });
  if (!asset) throw new MarketingContentImageError("marketing_image_not_found", 404);

  const content = toUnknownRecord(asset.content);
  const now = new Date();
  const nextContent = {
    ...content,
    retentionMode: args.retained ? "retained" : "temporary",
    expiresAt: args.retained ? null : new Date(now.getTime() + MARKETING_CONTENT_IMAGE_TTL_MS).toISOString(),
  };
  const updateResult = await updateMarketingAssetsByIds({
    universeId,
    assetIds: [assetId],
    kind: MARKETING_CONTENT_IMAGE_KIND,
    state: "active",
    set: {
      content: nextContent,
      meta: {
        ...(asset.meta || {}),
        retentionUpdatedBy: toSafeString(args.updatedBy),
        retentionUpdatedAt: now.toISOString(),
      },
    },
  });
  if (updateResult.matchedCount !== 1) {
    throw new MarketingContentImageError("marketing_image_retention_update_failed", 409);
  }
  const [updated] = await listMarketingAssets({
    universeId,
    assetIds: [assetId],
    kind: MARKETING_CONTENT_IMAGE_KIND,
    state: "active",
    limit: 1,
  });
  if (!updated) throw new MarketingContentImageError("marketing_image_retention_update_failed", 409);
  return serializeMarketingContentImage(updated);
}

export async function deleteMarketingContentImage(args: {
  universeId: string;
  assetId: string;
  deletedBy?: string;
}) {
  const universeId = toSafeString(args.universeId);
  const assetId = toSafeString(args.assetId);
  if (!universeId) throw new MarketingContentImageError("universe_id_required", 400);
  if (!assetId) throw new MarketingContentImageError("asset_id_required", 400);
  if (!isR2StorageEnabled()) throw new MarketingContentImageError("r2_storage_required", 503);

  const [asset] = await listMarketingAssets({
    universeId,
    assetIds: [assetId],
    kind: MARKETING_CONTENT_IMAGE_KIND,
    state: "active",
    limit: 1,
  });
  if (!asset) throw new MarketingContentImageError("marketing_image_not_found", 404);

  const content = toUnknownRecord(asset.content);
  const storage = toUnknownRecord(content.storage);
  const expectedBucket = getR2PublicBucket();
  const bucket = toSafeString(storage.bucket);
  const key = toSafeString(storage.key);
  if (
    toSafeString(storage.driver) !== "r2" ||
    toSafeString(storage.access) !== "public" ||
    bucket !== expectedBucket ||
    !key.startsWith("marketing-content/")
  ) {
    throw new MarketingContentImageError("invalid_marketing_image_storage", 409);
  }

  const claimedAt = new Date();
  const originalMeta = toUnknownRecord(asset.meta);
  const claimResult = await updateMarketingAssetsByIds({
    universeId,
    assetIds: [assetId],
    kind: MARKETING_CONTENT_IMAGE_KIND,
    state: "active",
    set: {
      state: "archived",
      meta: {
        ...originalMeta,
        manualDeletionClaimedAt: claimedAt.toISOString(),
        manualDeletionClaimedBy: toSafeString(args.deletedBy),
      },
    },
  });
  if (claimResult.matchedCount !== 1) {
    throw new MarketingContentImageError("marketing_image_delete_conflict", 409);
  }

  const releaseClaim = async (reason: string) => {
    const result = await updateMarketingAssetsByIds({
      universeId,
      assetIds: [assetId],
      kind: MARKETING_CONTENT_IMAGE_KIND,
      state: "archived",
      set: {
        state: "active",
        meta: {
          ...originalMeta,
          manualDeletionLastFailedAt: new Date().toISOString(),
          manualDeletionLastError: reason,
        },
      },
    });
    if (result.matchedCount !== 1) {
      logger.error("[marketing/content-images] manual deletion claim release conflict", {
        universeId,
        assetId,
        reason,
      });
    }
  };

  const [claimedAsset] = await listMarketingAssets({
    universeId,
    assetIds: [assetId],
    kind: MARKETING_CONTENT_IMAGE_KIND,
    state: "archived",
    limit: 1,
  });
  if (!claimedAsset) {
    await releaseClaim("claim_snapshot_missing");
    throw new MarketingContentImageError("marketing_image_delete_conflict", 409);
  }
  const claimedContent = toUnknownRecord(claimedAsset.content);
  const protectedUntil = new Date(toSafeString(claimedContent.protectedUntil)).getTime();
  if (Number.isFinite(protectedUntil) && protectedUntil > claimedAt.getTime()) {
    await releaseClaim("protected");
    throw new MarketingContentImageError("marketing_image_protected", 409);
  }
  if (await hasActiveMarketingAssetReference({ assetId })) {
    await releaseClaim("active_reference");
    throw new MarketingContentImageError("marketing_image_active_reference", 409);
  }

  try {
    await deleteR2Object({ bucket, key });
  } catch (error) {
    await releaseClaim("r2_delete_failed");
    logger.error("[marketing/content-images] manual R2 deletion failed", { error, universeId, assetId, key });
    throw new MarketingContentImageError("r2_delete_failed", 502);
  }

  const deletedAt = new Date().toISOString();
  const finalizeResult = await updateMarketingAssetsByIds({
    universeId,
    assetIds: [assetId],
    kind: MARKETING_CONTENT_IMAGE_KIND,
    state: "archived",
    set: {
      state: "deleted",
      content: {
        ...claimedContent,
        hardDeletedAt: deletedAt,
      },
      meta: {
        ...originalMeta,
        deleteReason: "manual_operator",
        manualDeletedAt: deletedAt,
        manualDeletedBy: toSafeString(args.deletedBy),
        manualDeletionObjectDeleted: true,
        manualDeletionRegistryUpdated: true,
      },
    },
  });
  if (finalizeResult.matchedCount !== 1) {
    logger.error("[marketing/content-images] manual deletion registry finalize conflict", {
      universeId,
      assetId,
      key,
    });
    throw new MarketingContentImageError("marketing_image_delete_finalize_failed", 500);
  }

  return { assetId, deletedAt };
}

export async function resolveMarketingContentImagesByIds(args: {
  universeId: string;
  assetIds: string[];
  strict?: boolean;
}) {
  const universeId = toSafeString(args.universeId);
  const assetIds = Array.from(new Set((args.assetIds || []).map(toSafeString).filter(Boolean))).slice(0, 20);
  if (!assetIds.length) return [];

  const rows = await listMarketingAssets({
    universeId,
    assetIds,
    kind: MARKETING_CONTENT_IMAGE_KIND,
    state: "active",
    limit: assetIds.length,
  });
  const byId = new Map(rows.map((row) => [toSafeString(row.assetId), serializeMarketingContentImage(row)]));
  const missingAssetId = assetIds.find((assetId) => !byId.has(assetId));
  if (missingAssetId && args.strict !== false) throw new MarketingContentImageError("marketing_image_not_found", 404);
  return assetIds.map((assetId) => byId.get(assetId)).filter(Boolean);
}

export async function protectMarketingContentImages(args: {
  universeId: string;
  assetIds: string[];
  protectedUntil: string | Date;
}) {
  const assetIds = Array.from(new Set((args.assetIds || []).map(toSafeString).filter(Boolean))).slice(0, 20);
  if (!assetIds.length) return { matchedCount: 0, modifiedCount: 0 };

  const protectedUntil = args.protectedUntil instanceof Date ? args.protectedUntil : new Date(args.protectedUntil);
  if (Number.isNaN(protectedUntil.getTime())) {
    throw new MarketingContentImageError("invalid_protected_until", 400);
  }
  const now = new Date().toISOString();
  const result = await updateMarketingAssetsByIds({
    universeId: args.universeId,
    assetIds,
    kind: MARKETING_CONTENT_IMAGE_KIND,
    state: "active",
    set: { "content.lastReferencedAt": now },
    max: { "content.protectedUntil": protectedUntil.toISOString() },
  });
  if (result.matchedCount !== assetIds.length) {
    throw new MarketingContentImageError("marketing_image_protection_conflict", 409);
  }
  return result;
}
