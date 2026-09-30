import "server-only";

import crypto from "crypto";
import {
  claimExpiredMarketingAsset,
  completeMarketingAssetCleanup,
  hasActiveMarketingAssetReference,
  listExpiredMarketingAssets,
  releaseMarketingAssetCleanup,
} from "libs/database/marketing";
import { deleteR2Object, getR2PublicBucket } from "libs/server-utils/storage/r2Storage";
import { toErrorMessage, toSafeString, toUnknownRecord } from "utils/common/typeUtils";
import { logger } from "utils/log";

const MARKETING_CONTENT_IMAGE_KIND = "uploaded_image";
const CLEANUP_LEASE_MS = 5 * 60 * 1000;
const CLEANUP_REASON = "retention_expired";

type CleanupOutcome = "dry_run" | "deleted" | "skipped" | "failed";

type CleanupItem = {
  assetId: string;
  universeId: string;
  expiresAt: string;
  outcome: CleanupOutcome;
  reason: string;
  objectDeleted: boolean;
  cachePurgeRequested: boolean;
  registryUpdated: boolean;
};

function describeAsset(asset: unknown) {
  const record = toUnknownRecord(asset);
  const content = toUnknownRecord(record.content);
  const storage = toUnknownRecord(content.storage);
  return {
    assetId: toSafeString(record.assetId),
    universeId: toSafeString(record.universeId),
    expiresAt: toSafeString(content.expiresAt),
    bucket: toSafeString(storage.bucket),
    key: toSafeString(storage.key),
    driver: toSafeString(storage.driver),
    access: toSafeString(storage.access),
  };
}

function makeItem(asset: unknown, outcome: CleanupOutcome, reason: string, updates?: Partial<CleanupItem>): CleanupItem {
  const snapshot = describeAsset(asset);
  return {
    assetId: snapshot.assetId,
    universeId: snapshot.universeId,
    expiresAt: snapshot.expiresAt,
    outcome,
    reason,
    objectDeleted: false,
    cachePurgeRequested: false,
    registryUpdated: false,
    ...updates,
  };
}

function storageError(asset: unknown, expectedBucket: string) {
  const storage = describeAsset(asset);
  if (storage.driver !== "r2" || storage.access !== "public") return "invalid_r2_storage";
  if (!storage.bucket || storage.bucket !== expectedBucket) return "invalid_r2_bucket";
  if (!storage.key || !storage.key.startsWith("marketing-content/")) return "invalid_r2_key";
  return "";
}

async function releaseClaim(args: { assetId: string; leaseToken: string; error: string }) {
  try {
    await releaseMarketingAssetCleanup({
      assetId: args.assetId,
      leaseToken: args.leaseToken,
      releasedAt: new Date(),
      error: args.error,
    });
  } catch (error) {
    logger.error("[marketing/content-image-retention] cleanup lease release failed", {
      assetId: args.assetId,
      error,
    });
  }
}

export async function cleanupExpiredMarketingContentImages(args: {
  dryRun: boolean;
  limit?: number;
  trigger?: string;
  requestId?: string;
}) {
  const startedAt = new Date();
  const now = new Date();
  const requestedLimit = Number(args.limit || 50);
  const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(100, Math.floor(requestedLimit))) : 50;
  const expectedBucket = getR2PublicBucket();
  const candidates = await listExpiredMarketingAssets({ kind: MARKETING_CONTENT_IMAGE_KIND, now, limit });
  const items: CleanupItem[] = [];

  for (const candidate of candidates) {
    const candidateSnapshot = describeAsset(candidate);
    const invalidStorage = storageError(candidate, expectedBucket);
    const hasActiveReference = await hasActiveMarketingAssetReference({ assetId: candidateSnapshot.assetId });

    if (hasActiveReference) {
      items.push(makeItem(candidate, "skipped", "active_reference"));
      continue;
    }
    if (invalidStorage) {
      items.push(makeItem(candidate, "failed", invalidStorage));
      continue;
    }
    if (args.dryRun) {
      items.push(makeItem(candidate, "dry_run", "eligible"));
      continue;
    }

    const leaseToken = crypto.randomUUID();
    const claimedAt = new Date();
    const claimed = await claimExpiredMarketingAsset({
      assetId: candidateSnapshot.assetId,
      kind: MARKETING_CONTENT_IMAGE_KIND,
      now: claimedAt,
      leaseToken,
      leaseExpiresAt: new Date(claimedAt.getTime() + CLEANUP_LEASE_MS),
    });
    if (!claimed) {
      items.push(makeItem(candidate, "skipped", "candidate_changed"));
      continue;
    }

    const claimedSnapshot = describeAsset(claimed);
    let objectDeleted = false;
    try {
      if (await hasActiveMarketingAssetReference({ assetId: claimedSnapshot.assetId })) {
        await releaseClaim({ assetId: claimedSnapshot.assetId, leaseToken, error: "active_reference" });
        items.push(makeItem(claimed, "skipped", "active_reference"));
        continue;
      }

      const claimedStorageError = storageError(claimed, expectedBucket);
      if (claimedStorageError) {
        await releaseClaim({ assetId: claimedSnapshot.assetId, leaseToken, error: claimedStorageError });
        items.push(makeItem(claimed, "failed", claimedStorageError));
        continue;
      }

      await deleteR2Object({ bucket: claimedSnapshot.bucket, key: claimedSnapshot.key });
      objectDeleted = true;
      const completed = await completeMarketingAssetCleanup({
        assetId: claimedSnapshot.assetId,
        leaseToken,
        completedAt: new Date(),
        reason: CLEANUP_REASON,
      });
      if (!completed) {
        items.push(
          makeItem(claimed, "failed", "registry_finalize_conflict", {
            objectDeleted: true,
          }),
        );
        continue;
      }
      items.push(
        makeItem(completed, "deleted", CLEANUP_REASON, {
          objectDeleted: true,
          registryUpdated: true,
        }),
      );
    } catch (error) {
      const reason = toErrorMessage(error, "cleanup_failed").slice(0, 500);
      if (!objectDeleted) {
        await releaseClaim({ assetId: claimedSnapshot.assetId, leaseToken, error: reason });
      }
      logger.error("[marketing/content-image-retention] asset cleanup failed", {
        assetId: claimedSnapshot.assetId,
        requestId: toSafeString(args.requestId),
        error,
      });
      items.push(makeItem(claimed, "failed", reason, { objectDeleted }));
    }
  }

  const result = {
    dryRun: args.dryRun,
    trigger: toSafeString(args.trigger) || "manual",
    requestId: toSafeString(args.requestId),
    startedAt: startedAt.toISOString(),
    completedAt: new Date().toISOString(),
    candidateCount: candidates.length,
    processedCount: items.length,
    eligibleCount: items.filter((item) => item.outcome === "dry_run").length,
    deletedCount: items.filter((item) => item.outcome === "deleted").length,
    skippedCount: items.filter((item) => item.outcome === "skipped").length,
    failedCount: items.filter((item) => item.outcome === "failed").length,
    items,
  };
  logger.info("[marketing/content-image-retention] cleanup completed", {
    ...result,
    items: result.items.map(({ assetId, outcome, reason }) => ({ assetId, outcome, reason })),
  });
  return result;
}
