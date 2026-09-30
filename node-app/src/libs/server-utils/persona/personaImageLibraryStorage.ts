import "server-only";

import crypto from "crypto";
import sharp from "sharp";
import { transformImageBufferByBridge } from "libs/server-utils/file/imageTransformBridge";
import {
  createPersonaImageLibraryAsset,
  createPersonaImageLibraryAssetId,
} from "libs/database/personaImageLibraryRepo";
import {
  deleteR2Object,
  headR2Object,
  isR2StorageEnabled,
  putR2PublicObject,
} from "libs/server-utils/storage/r2Storage";
import { deleteLegacyPersonaImage, readLegacyPublicMedia } from "./personaImageLibraryLegacyStorage";
import type { PersonaImageLibraryAssetType, PersonaImageLibrarySourceType } from "types/ai";

const MAX_PERSONA_LIBRARY_IMAGE_BYTES = 12 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);

export class PersonaImageLibraryStorageError extends Error {
  constructor(code: string) {
    super(code);
    this.name = "PersonaImageLibraryStorageError";
  }
}

function safeStorageSegment(value: unknown, fallback: string) {
  const raw = String(value || "").trim();
  const visible = raw.normalize("NFKD").replace(/[\u0300-\u036F]/g, "").replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48);
  const hash = crypto.createHash("sha256").update(raw || fallback).digest("hex").slice(0, 12);
  return `${visible || fallback}-${hash}`;
}

function normalizeTags(tags?: unknown) {
  if (!Array.isArray(tags)) return [];
  return Array.from(new Set(tags.map((tag) => String(tag || "").trim()).filter(Boolean))).slice(0, 20);
}

function inferMimeFromUrl(url: string) {
  const pathname = String(url || "").split("?")[0].toLowerCase();
  if (/\.jpe?g$/.test(pathname)) return "image/jpeg";
  if (/\.webp$/.test(pathname)) return "image/webp";
  return "image/png";
}

async function readImageFromUrl(url: string) {
  const clean = String(url || "").trim();
  if (!clean) throw new PersonaImageLibraryStorageError("image_url_required");

  if (clean.startsWith("data:image/")) {
    const [head, payload = ""] = clean.split(",", 2);
    const mimeType = head.includes("image/jpeg") ? "image/jpeg" : head.includes("image/webp") ? "image/webp" : "image/png";
    return { buffer: Buffer.from(payload, "base64"), mimeType };
  }

  if (clean.startsWith("/")) {
    const buffer = await readLegacyPublicMedia(clean);
    if (!buffer) throw new PersonaImageLibraryStorageError("legacy_image_file_missing");
    return { buffer, mimeType: inferMimeFromUrl(clean) };
  }

  const response = await fetch(clean);
  if (!response.ok) throw new PersonaImageLibraryStorageError("image_fetch_failed");
  const mimeType = response.headers.get("content-type") || inferMimeFromUrl(clean);
  const buffer = Buffer.from(await response.arrayBuffer());
  return { buffer, mimeType };
}

async function ensureImageBuffer(buffer: Buffer, mimeType?: string) {
  if (!buffer.length) throw new PersonaImageLibraryStorageError("image_empty");
  if (buffer.length > MAX_PERSONA_LIBRARY_IMAGE_BYTES) throw new PersonaImageLibraryStorageError("image_too_large");
  const normalizedMime = String(mimeType || "").split(";")[0].trim().toLowerCase().replace("image/jpg", "image/jpeg");
  if (normalizedMime && !ALLOWED_MIME.has(normalizedMime)) throw new PersonaImageLibraryStorageError("unsupported_mime");
  const metadata = await sharp(buffer, { failOn: "error" }).metadata();
  if (!metadata.width || !metadata.height || metadata.width > 12000 || metadata.height > 12000) {
    throw new PersonaImageLibraryStorageError("image_dimensions_invalid");
  }
}

async function flattenBufferToOpaque(buffer: Buffer, background = "#ffffff") {
  const meta = await sharp(buffer, { failOn: "error" }).metadata();
  return meta.hasAlpha ? await sharp(buffer, { failOn: "error" }).flatten({ background }).toBuffer() : buffer;
}

async function putVerifiedPersonaObject(args: { key: string; body: Buffer; width: number; height: number }) {
  const mimeType = "image/webp";
  const sha256 = crypto.createHash("sha256").update(args.body).digest("hex");
  const storage = await putR2PublicObject({ key: args.key, body: args.body, contentType: mimeType, sha256 });
  const head = await headR2Object({ bucket: storage.bucket, key: storage.key });
  if (!head || head.bytes !== args.body.length || head.contentType !== mimeType || head.sha256 !== sha256) {
    await deleteR2Object({ bucket: storage.bucket, key: storage.key }).catch(() => false);
    throw new PersonaImageLibraryStorageError("r2_object_verification_failed");
  }
  return { ...storage, mimeType, bytes: args.body.length, sha256, width: args.width, height: args.height };
}

async function writeOptimizedPersonaImage(args: {
  assetId: string;
  uid: string;
  source: PersonaImageLibrarySourceType;
  buffer: Buffer;
  originalUrl?: string;
  flattenOpaque?: boolean;
}) {
  await ensureImageBuffer(args.buffer);
  if (!isR2StorageEnabled()) throw new PersonaImageLibraryStorageError("r2_storage_required");

  const sourceBuffer = args.flattenOpaque ? await flattenBufferToOpaque(args.buffer) : args.buffer;
  const optimized = await transformImageBufferByBridge({ input: sourceBuffer, format: "webp", quality: 82, maxWidth: 1600, maxHeight: 1600 });
  const thumbnail = await transformImageBufferByBridge({ input: sourceBuffer, format: "webp", quality: 72, maxWidth: 360, maxHeight: 360 });
  const prefix = [
    "persona-image-library",
    "users",
    safeStorageSegment(args.uid, "user"),
    args.source === "generated" ? "generated" : "references",
    args.assetId,
  ].join("/");

  const uploaded: Array<{ bucket: string; key: string }> = [];
  try {
    const optimizedStorage = await putVerifiedPersonaObject({
      key: `${prefix}/optimized.webp`,
      body: optimized.buffer,
      width: Number(optimized.width || 0),
      height: Number(optimized.height || 0),
    });
    uploaded.push(optimizedStorage);
    const thumbnailStorage = await putVerifiedPersonaObject({
      key: `${prefix}/thumbnail.webp`,
      body: thumbnail.buffer,
      width: Number(thumbnail.width || 0),
      height: Number(thumbnail.height || 0),
    });
    uploaded.push(thumbnailStorage);

    return {
      driver: "r2" as const,
      access: "public" as const,
      bucket: optimizedStorage.bucket,
      key: optimizedStorage.key,
      url: optimizedStorage.url,
      sha256: optimizedStorage.sha256,
      bytes: optimizedStorage.bytes,
      originalUrl: args.originalUrl?.startsWith("data:") ? undefined : args.originalUrl,
      optimizedUrl: optimizedStorage.url,
      thumbnailUrl: thumbnailStorage.url,
      mimeType: optimizedStorage.mimeType,
      width: optimizedStorage.width,
      height: optimizedStorage.height,
      sizeBytes: optimizedStorage.bytes,
      thumbnailStorage,
      migrationState: "r2" as const,
    };
  } catch (error) {
    await Promise.all(uploaded.map((item) => deleteR2Object(item).catch(() => false)));
    throw error;
  }
}

export async function createPersonaImageLibraryAssetFromBuffer(args: {
  uid: string;
  universeId?: string;
  personaId?: string;
  source: PersonaImageLibrarySourceType;
  buffer: Buffer;
  mimeType?: string;
  originalUrl?: string;
  generation?: PersonaImageLibraryAssetType["generation"];
  reference?: PersonaImageLibraryAssetType["reference"];
  tags?: string[];
}) {
  await ensureImageBuffer(args.buffer, args.mimeType);
  const assetId = createPersonaImageLibraryAssetId();
  const storage = await writeOptimizedPersonaImage({
    assetId,
    uid: args.uid,
    source: args.source,
    buffer: args.buffer,
    originalUrl: args.originalUrl,
    flattenOpaque: args.reference?.kind === "profile_reference_sketch",
  });

  try {
    return await createPersonaImageLibraryAsset({
      assetId,
      uid: args.uid,
      universeId: args.universeId,
      personaId: args.personaId,
      source: args.source,
      storage,
      generation: args.generation,
      reference: args.reference,
      tags: normalizeTags(args.tags),
    });
  } catch (error) {
    await Promise.all([
      deleteR2Object({ bucket: storage.bucket, key: storage.key }).catch(() => false),
      deleteR2Object({ bucket: storage.thumbnailStorage.bucket, key: storage.thumbnailStorage.key }).catch(() => false),
    ]);
    throw error;
  }
}

export async function createPersonaImageLibraryAssetFromUrl(args: {
  uid: string;
  universeId?: string;
  personaId?: string;
  source: PersonaImageLibrarySourceType;
  imageUrl: string;
  generation?: PersonaImageLibraryAssetType["generation"];
  reference?: PersonaImageLibraryAssetType["reference"];
  tags?: string[];
}) {
  const { buffer, mimeType } = await readImageFromUrl(args.imageUrl);
  return createPersonaImageLibraryAssetFromBuffer({ ...args, buffer, mimeType, originalUrl: args.imageUrl });
}

/** archive는 바이트를 유지하고, 명시적 delete에서만 R2/레거시 파일을 제거한다. */
export async function deletePersonaImageLibraryStoredObjects(storage: PersonaImageLibraryAssetType["storage"]) {
  if (storage.driver === "r2" && storage.bucket && storage.key) {
    const targets = [{ bucket: storage.bucket, key: storage.key }];
    if (storage.thumbnailStorage?.bucket && storage.thumbnailStorage.key) {
      targets.push({ bucket: storage.thumbnailStorage.bucket, key: storage.thumbnailStorage.key });
    }
    await Promise.all(targets.map((target) => deleteR2Object(target)));
    return;
  }

  await Promise.all([
    storage.optimizedUrl ? deleteLegacyPersonaImage(storage.optimizedUrl) : false,
    storage.thumbnailUrl ? deleteLegacyPersonaImage(storage.thumbnailUrl) : false,
  ]);
}
