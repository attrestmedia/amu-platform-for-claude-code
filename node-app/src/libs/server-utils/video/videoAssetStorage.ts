import "server-only";

import crypto from "node:crypto";
import { putR2PrivateObject, putR2PublicObject, headR2Object, isR2StorageEnabled } from "libs/server-utils/storage/r2Storage";

export const MAX_VIDEO_ASSET_BYTES = 256 * 1024 * 1024;

type StoredVideoObject = {
  driver: "r2";
  access: "private" | "public";
  bucket: string;
  key: string;
  url?: string;
  mimeType: "video/mp4" | "video/webm";
  ext: "mp4" | "webm";
  bytes: number;
  sha256: string;
  migrationState: "r2";
};

function safe(value: unknown) {
  return String(value || "").trim();
}

function segment(value: string, fallback: string) {
  const normalized = safe(value).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  return normalized || fallback;
}

function assertDownloadUrl(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== "https:") throw new Error("VIDEO_DOWNLOAD_HTTPS_REQUIRED");
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname === "127.0.0.1" || hostname === "::1") {
    throw new Error("VIDEO_DOWNLOAD_PRIVATE_HOST_BLOCKED");
  }
  return url;
}

function detectVideoType(buffer: Buffer, header: string) {
  const contentType = safe(header).split(";", 1)[0].toLowerCase();
  const isMp4 = buffer.length >= 12 && buffer.subarray(4, 8).toString("ascii") === "ftyp";
  const isWebm = buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  if (isMp4 && (contentType === "" || contentType === "video/mp4" || contentType === "application/octet-stream")) {
    return { mimeType: "video/mp4" as const, ext: "mp4" as const };
  }
  if (isWebm && (contentType === "" || contentType === "video/webm" || contentType === "application/octet-stream")) {
    return { mimeType: "video/webm" as const, ext: "webm" as const };
  }
  throw new Error("VIDEO_MIME_OR_CONTAINER_INVALID");
}

export async function storeVideoFromProvider(args: {
  sourceUrl: string;
  downloadHeaders?: Record<string, string>;
  scope: "user" | "universe";
  uid: string;
  jobId: string;
  assetId: string;
  visibility: "private" | "public";
}) {
  if (!isR2StorageEnabled()) throw new Error("VIDEO_R2_STORAGE_REQUIRED");
  const source = assertDownloadUrl(args.sourceUrl);
  const response = await fetch(source, {
    headers: { Accept: "video/mp4,video/webm,application/octet-stream", ...(args.downloadHeaders || {}) },
    redirect: "follow",
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`VIDEO_DOWNLOAD_FAILED_${response.status}`);

  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > MAX_VIDEO_ASSET_BYTES) throw new Error("VIDEO_FILE_TOO_LARGE");
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length || buffer.length > MAX_VIDEO_ASSET_BYTES) throw new Error("VIDEO_FILE_TOO_LARGE");
  const detected = detectVideoType(buffer, response.headers.get("content-type") || "");
  const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
  const key = `gen-studio/videos/${segment(args.scope, "user")}/${segment(args.uid, "unknown")}/${segment(args.jobId, "job")}/${segment(args.assetId, "asset")}.${detected.ext}`;
  const stored = args.visibility === "public"
    ? await putR2PublicObject({ key, body: buffer, contentType: detected.mimeType, sha256 })
    : await putR2PrivateObject({ key, body: buffer, contentType: detected.mimeType, sha256 });
  const head = await headR2Object({ bucket: stored.bucket, key: stored.key });
  if (!head || head.bytes !== buffer.length || head.contentType !== detected.mimeType || head.sha256 !== sha256) {
    throw new Error("VIDEO_R2_OBJECT_VERIFICATION_FAILED");
  }

  return {
    ...stored,
    mimeType: detected.mimeType,
    ext: detected.ext,
    bytes: buffer.length,
    sha256,
    migrationState: "r2" as const,
  } satisfies StoredVideoObject;
}
