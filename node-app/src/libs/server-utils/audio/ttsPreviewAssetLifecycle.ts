import "server-only";

import { TTS_PREVIEW_ASSET_LIMIT } from "consts/ai";
import {
  buildTtsPreviewDedupeKey,
  setTtsPreviewAssetModeration,
  setTtsPreviewAssetVisibility,
} from "libs/database/lab";
import type { TtsPreviewModerationStatus, TtsPreviewVisibility } from "models/lab";
import type { UnknownRecord } from "utils/common";
import {
  assertVoiceAssetStorage,
  buildVoicePreviewStorageKey,
  copyVoiceAssetToAccess,
  deleteVoiceAssetByStorage,
  resolveAudioExt,
  resolveVoiceAssetStorageAccess,
  type VoiceAssetStorageAccess,
  type VoiceAssetStorageMeta,
} from "./voiceAssetStorage";

function storageMetaOf(asset: UnknownRecord): VoiceAssetStorageMeta {
  const raw = asset.storage && typeof asset.storage === "object" ? (asset.storage as Record<string, unknown>) : {};
  const storage: VoiceAssetStorageMeta = {
    driver: "r2",
    access: resolveVoiceAssetStorageAccess(raw) || "private",
    bucket: String(raw.bucket || "").trim(),
    key: String(raw.key || "").trim(),
    mimeType: String(raw.mimeType || asset.contentType || "audio/mpeg"),
    ext: String(raw.ext || resolveAudioExt(String(asset.contentType || "audio/mpeg"))),
    bytes: Number(raw.bytes || asset.bytes || 0),
    sha256: String(raw.sha256 || asset.sha256 || "").trim(),
    ...(raw.url ? { url: String(raw.url) } : {}),
  };
  if (String(raw.driver || "") !== "r2" || !storage.bucket || !storage.key) {
    throw new Error("VOICE_ASSET_R2_STORAGE_REQUIRED");
  }
  return storage;
}

function targetStorageKey(asset: UnknownRecord, access: VoiceAssetStorageAccess, storage: VoiceAssetStorageMeta) {
  return buildVoicePreviewStorageKey({
    visibility: access,
    voiceId: String(asset.voiceId || ""),
    assetId: String(asset.assetId || ""),
    ext: String(storage.ext || resolveAudioExt(storage.mimeType)),
  });
}

async function persistWithStorageMove<T>(args: {
  asset: UnknownRecord;
  targetAccess: VoiceAssetStorageAccess;
  persist: (storage: VoiceAssetStorageMeta) => Promise<T>;
}) {
  const source = storageMetaOf(args.asset);
  if (source.access === args.targetAccess) {
    await assertVoiceAssetStorage(source);
    return await args.persist(source);
  }

  const target = await copyVoiceAssetToAccess({
    storage: source,
    targetAccess: args.targetAccess,
    targetKey: targetStorageKey(args.asset, args.targetAccess, source),
  });
  const sourceDeleted = await deleteVoiceAssetByStorage(source);
  if (!sourceDeleted) {
    await deleteVoiceAssetByStorage(target).catch(() => false);
    throw new Error("VOICE_ASSET_SOURCE_DELETE_FAILED");
  }

  try {
    const saved = await args.persist(target);
    if (!saved) throw new Error("VOICE_PREVIEW_DB_UPDATE_FAILED");
    return saved;
  } catch (error) {
    try {
      const restored = await copyVoiceAssetToAccess({
        storage: target,
        targetAccess: source.access,
        targetKey: source.key,
      });
      await assertVoiceAssetStorage(restored);
      await deleteVoiceAssetByStorage(target);
    } catch {
      throw new Error("VOICE_ASSET_STORAGE_ROLLBACK_FAILED", { cause: error });
    }
    throw error;
  }
}

export async function transitionTtsPreviewVisibility(args: {
  asset: UnknownRecord;
  visibility: TtsPreviewVisibility;
}) {
  const assetId = String(args.asset.assetId || "");
  const ownerUid = String(args.asset.ownerUid || "");
  const source = String(args.asset.source || "custom");
  const moderationStatus: TtsPreviewModerationStatus =
    args.visibility === "public" && source === "custom" ? "pending" : "approved";
  const targetAccess: VoiceAssetStorageAccess =
    args.visibility === "public" && moderationStatus === "approved" ? "public" : "private";
  const dedupeKey = buildTtsPreviewDedupeKey({
    uid: ownerUid,
    baseKey: String(args.asset.baseKey || ""),
    visibility: args.visibility,
  });

  return await persistWithStorageMove({
    asset: args.asset,
    targetAccess,
    persist: async (storage) =>
      await setTtsPreviewAssetVisibility({
        assetId,
        visibility: args.visibility,
        dedupeKey,
        moderationStatus,
        storage,
        source: source === "default" ? "default" : "custom",
        ownerUid,
        limit: TTS_PREVIEW_ASSET_LIMIT[args.visibility],
      }),
  });
}

export async function moderateTtsPreviewAsset(args: {
  asset: UnknownRecord;
  decision: "approved" | "rejected";
  moderatedBy: string;
  reason?: string;
}) {
  return await persistWithStorageMove({
    asset: args.asset,
    targetAccess: args.decision === "approved" ? "public" : "private",
    persist: async (storage) =>
      await setTtsPreviewAssetModeration({
        assetId: String(args.asset.assetId || ""),
        moderationStatus: args.decision,
        moderatedBy: args.moderatedBy,
        reason: args.reason,
        storage,
      }),
  });
}
