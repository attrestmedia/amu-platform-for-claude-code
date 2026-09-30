import "server-only";
import crypto from "crypto";
import {
  buildR2PublicUrl,
  copyR2Object,
  deleteR2Object,
  getR2PrivateBucket,
  getR2PublicBucket,
  getR2SignedGetUrl,
  headR2Object,
  isR2PrivateStorage,
  isR2PublicStorage,
  isR2StorageEnabled,
  putR2PrivateObject,
  putR2PublicObject,
  r2ObjectExists,
} from "libs/server-utils/storage/r2Storage";

export type VoiceAssetStorageAccess = "private" | "public";

export type VoiceAssetStorageMeta = {
  driver: "r2";
  access: VoiceAssetStorageAccess;
  bucket: string;
  key: string;
  url?: string;
  mimeType?: string;
  ext?: string;
  bytes?: number;
  sha256?: string;
  temporary?: boolean;
  expiresAt?: string;
};

export function resolveVoiceAssetStorageAccess(storageRaw: unknown): VoiceAssetStorageAccess | null {
  const storage = storageRaw && typeof storageRaw === "object" ? (storageRaw as Record<string, unknown>) : {};
  if (isR2PublicStorage(storage)) return "public";
  if (isR2PrivateStorage(storage)) return "private";
  return null;
}

function safeSegment(value: unknown, fallback = "unknown") {
  const normalized = String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9._:-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
  return normalized || fallback;
}

export function resolveAudioExt(contentType?: string, fallback = "mp3") {
  const mime = String(contentType || "").split(";")[0].trim().toLowerCase();
  if (mime.includes("wav")) return "wav";
  if (mime.includes("opus")) return "opus";
  if (mime.includes("aac")) return "aac";
  if (mime.includes("flac")) return "flac";
  if (mime.includes("pcm")) return "pcm";
  return fallback;
}

export function buildChatVoiceStorageKey(args: {
  uid: string;
  routeHint: string;
  universeId: string;
  npcId: string;
  sessionId: string;
  cacheKey: string;
  ext: string;
}) {
  return [
    "voice",
    "chat",
    safeSegment(args.routeHint, "route"),
    safeSegment(args.uid, "uid"),
    safeSegment(args.universeId, "universe"),
    safeSegment(args.npcId, "npc"),
    safeSegment(args.sessionId, "session"),
    `${safeSegment(args.cacheKey, "audio")}.${safeSegment(args.ext, "mp3")}`,
  ].join("/");
}

export function buildVoicePreviewStorageKey(args: {
  visibility: VoiceAssetStorageAccess;
  voiceId: string;
  assetId: string;
  ext: string;
}) {
  return [
    "voice",
    "previews",
    safeSegment(args.visibility, "private"),
    safeSegment(args.voiceId, "voice"),
    `${safeSegment(args.assetId, "asset")}.${safeSegment(args.ext, "mp3")}`,
  ].join("/");
}

export function buildVoiceStorageMeta(args: {
  storage: VoiceAssetStorageMeta | { driver: "r2"; access: VoiceAssetStorageAccess; bucket: string; key: string; url?: string };
  body: Buffer;
  contentType: string;
  ext?: string;
  temporary?: boolean;
  expiresAt?: string;
}): VoiceAssetStorageMeta {
  return {
    ...args.storage,
    mimeType: args.contentType,
    ext: args.ext || resolveAudioExt(args.contentType),
    bytes: args.body.length,
    sha256: crypto.createHash("sha256").update(args.body).digest("hex"),
    ...(args.temporary ? { temporary: true } : {}),
    ...(args.expiresAt ? { expiresAt: args.expiresAt } : {}),
  };
}

export async function saveVoiceBufferToR2(args: {
  key: string;
  body: Buffer;
  contentType: string;
  access?: VoiceAssetStorageAccess;
  cacheControl?: string;
  temporary?: boolean;
  expiresAt?: string;
}) {
  if (!isR2StorageEnabled()) throw new Error("R2_STORAGE_REQUIRED");

  const access = args.access || "private";
  const sha256 = crypto.createHash("sha256").update(args.body).digest("hex");
  const storage =
    access === "public"
      ? await putR2PublicObject({
          key: args.key,
          body: args.body,
          contentType: args.contentType,
          cacheControl: args.cacheControl,
          sha256,
        })
      : await putR2PrivateObject({
          key: args.key,
          body: args.body,
          contentType: args.contentType,
          cacheControl: args.cacheControl,
          sha256,
        });
  const meta = buildVoiceStorageMeta({
    storage,
    body: args.body,
    contentType: args.contentType,
    temporary: args.temporary,
    expiresAt: args.expiresAt,
  });
  await assertVoiceAssetStorage(meta);
  return meta;
}

function normalizeMimeType(value: unknown) {
  return String(value || "").split(";")[0].trim().toLowerCase();
}

export async function assertVoiceAssetStorage(storageRaw: unknown) {
  const storage = storageRaw && typeof storageRaw === "object" ? (storageRaw as Record<string, unknown>) : {};
  const bucket = String(storage.bucket || "").trim();
  const key = String(storage.key || "").trim();
  const expectedBytes = Number(storage.bytes || 0);
  const expectedMimeType = normalizeMimeType(storage.mimeType);
  const expectedSha256 = String(storage.sha256 || "").trim().toLowerCase();
  if (String(storage.driver || "") !== "r2" || !bucket || !key) {
    throw new Error("VOICE_ASSET_STORAGE_INVALID");
  }

  const head = await headR2Object({ bucket, key });
  if (
    !head ||
    head.bytes !== expectedBytes ||
    normalizeMimeType(head.contentType) !== expectedMimeType ||
    head.sha256.toLowerCase() !== expectedSha256
  ) {
    throw new Error("VOICE_ASSET_STORAGE_VERIFICATION_FAILED");
  }
  return head;
}

export async function copyVoiceAssetToAccess(args: {
  storage: VoiceAssetStorageMeta;
  targetAccess: VoiceAssetStorageAccess;
  targetKey: string;
  cacheControl?: string;
}) {
  await assertVoiceAssetStorage(args.storage);
  const targetBucket = args.targetAccess === "public" ? getR2PublicBucket() : getR2PrivateBucket();
  const targetKey = String(args.targetKey || "").trim();
  if (!targetKey) throw new Error("VOICE_ASSET_TARGET_KEY_REQUIRED");

  await copyR2Object({
    sourceBucket: args.storage.bucket,
    sourceKey: args.storage.key,
    targetBucket,
    targetKey,
    contentType: args.storage.mimeType,
    cacheControl:
      args.cacheControl ||
      (args.targetAccess === "public" ? "public, max-age=300, stale-while-revalidate=3600" : "private, max-age=0, no-store"),
    sha256: args.storage.sha256,
  });

  const target: VoiceAssetStorageMeta = {
    ...args.storage,
    access: args.targetAccess,
    bucket: targetBucket,
    key: targetKey,
    ...(args.targetAccess === "public" ? { url: buildR2PublicUrl(targetKey) } : { url: undefined }),
  };
  try {
    await assertVoiceAssetStorage(target);
    return target;
  } catch (error) {
    await deleteR2Object({ bucket: targetBucket, key: targetKey }).catch(() => false);
    throw error;
  }
}

export async function resolveVoiceAssetPlaybackUrl(storageRaw: unknown) {
  const storage = storageRaw && typeof storageRaw === "object" ? (storageRaw as Record<string, unknown>) : {};
  if (String(storage.driver || "") !== "r2") return null;

  const bucket = String(storage.bucket || "").trim();
  const key = String(storage.key || "").trim();
  if (!bucket || !key) return null;

  if (resolveVoiceAssetStorageAccess(storage) === "public") {
    const url = String(storage.url || "").trim();
    if (url) return { url, urlKind: "public" as const };
  }

  if (!resolveVoiceAssetStorageAccess(storage)) return null;
  const signed = await getR2SignedGetUrl({ bucket, key });
  return { ...signed, urlKind: "signed" as const };
}

export async function getExistingVoiceAssetPlaybackUrl(storageRaw: unknown) {
  const storage = storageRaw && typeof storageRaw === "object" ? (storageRaw as Record<string, unknown>) : {};
  const bucket = String(storage.bucket || "").trim();
  const key = String(storage.key || "").trim();
  if (String(storage.driver || "") !== "r2" || !bucket || !key) return null;
  if (!(await r2ObjectExists({ bucket, key }))) return null;
  return await resolveVoiceAssetPlaybackUrl(storage);
}

export async function deleteVoiceAssetByStorage(storageRaw: unknown) {
  const storage = storageRaw && typeof storageRaw === "object" ? (storageRaw as Record<string, unknown>) : {};
  const bucket = String(storage.bucket || "").trim();
  const key = String(storage.key || "").trim();
  if (String(storage.driver || "") !== "r2" || !bucket || !key) return false;
  return await deleteR2Object({ bucket, key });
}
