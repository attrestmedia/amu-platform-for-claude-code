import "server-only";

import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

type R2PublicObjectType = {
  driver: "r2";
  access: "public";
  bucket: string;
  key: string;
  url: string;
};

type R2PrivateObjectType = {
  driver: "r2";
  access: "private";
  bucket: string;
  key: string;
};

export type R2ObjectHeadType = {
  bucket: string;
  key: string;
  bytes: number;
  contentType: string;
  sha256: string;
  etag: string;
};

let cachedClient: S3Client | null = null;

function cleanEnv(name: string) {
  return String(process.env[name] || "").trim();
}

function requireEnv(name: string) {
  const value = cleanEnv(name);
  if (!value) throw new Error(`missing_env:${name}`);
  return value;
}

function trimSlashes(value: string) {
  return String(value || "").replace(/^\/+|\/+$/g, "");
}

function encodeR2Key(key: string) {
  return trimSlashes(key).split("/").map(encodeURIComponent).join("/");
}

function getR2Client() {
  if (cachedClient) return cachedClient;

  const accountId = requireEnv("R2_ACCOUNT_ID");
  cachedClient = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
    },
  });
  return cachedClient;
}

export function getStorageDriver() {
  return cleanEnv("STORAGE_DRIVER").toLowerCase() === "r2" ? "r2" : "local";
}

export function isR2StorageEnabled() {
  return getStorageDriver() === "r2";
}

export function getR2PublicBucket() {
  return requireEnv("R2_PUBLIC_BUCKET");
}

export function getR2PrivateBucket() {
  return requireEnv("R2_PRIVATE_BUCKET");
}

export function getR2PublicBaseUrl() {
  return requireEnv("R2_PUBLIC_BASE_URL").replace(/\/+$/g, "");
}

export function buildR2PublicUrl(key: string) {
  return `${getR2PublicBaseUrl()}/${encodeR2Key(key)}`;
}

export function getR2SignedUrlExpiresSeconds() {
  const raw = Number(cleanEnv("R2_SIGNED_URL_EXPIRES_SECONDS") || 3600);
  if (!Number.isFinite(raw)) return 3600;
  return Math.max(60, Math.min(21600, Math.floor(raw)));
}

export async function putR2Object(params: {
  bucket: string;
  key: string;
  body: Buffer;
  contentType: string;
  cacheControl?: string;
  sha256?: string;
}) {
  const bucket = String(params.bucket || "").trim();
  const key = trimSlashes(params.key);
  if (!bucket) throw new Error("missing_r2_bucket");
  if (!key) throw new Error("missing_r2_object_key");

  await getR2Client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: params.body,
      ContentType: params.contentType,
      CacheControl: params.cacheControl,
      ChecksumSHA256: params.sha256 ? Buffer.from(params.sha256, "hex").toString("base64") : undefined,
      Metadata: params.sha256 ? { sha256: params.sha256 } : undefined,
    }),
  );

  return { bucket, key };
}

export async function putR2PublicObject(params: {
  key: string;
  body: Buffer;
  contentType: string;
  cacheControl?: string;
  sha256?: string;
}): Promise<R2PublicObjectType> {
  const bucket = getR2PublicBucket();
  const { key } = await putR2Object({
    ...params,
    bucket,
    cacheControl: params.cacheControl || "public, max-age=31536000, immutable",
  });

  return {
    driver: "r2",
    access: "public",
    bucket,
    key,
    url: buildR2PublicUrl(key),
  };
}

export async function putR2PrivateObject(params: {
  key: string;
  body: Buffer;
  contentType: string;
  cacheControl?: string;
  sha256?: string;
}): Promise<R2PrivateObjectType> {
  const bucket = getR2PrivateBucket();
  const { key } = await putR2Object({
    ...params,
    bucket,
    cacheControl: params.cacheControl || "private, max-age=0, no-store",
  });

  return {
    driver: "r2",
    access: "private",
    bucket,
    key,
  };
}

export async function deleteR2Object(params: { bucket: string; key: string }) {
  const bucket = String(params.bucket || "").trim();
  const key = trimSlashes(params.key);
  if (!bucket || !key) return false;

  await getR2Client().send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );
  return true;
}

export async function r2ObjectExists(params: { bucket: string; key: string }) {
  const bucket = String(params.bucket || "").trim();
  const key = trimSlashes(params.key);
  if (!bucket || !key) return false;

  try {
    await getR2Client().send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );
    return true;
  } catch {
    return false;
  }
}

export async function listR2Objects(params: { bucket: string; prefix: string }) {
  const bucket = String(params.bucket || "").trim();
  const prefix = trimSlashes(params.prefix);
  if (!bucket || !prefix) throw new Error("invalid_r2_list_scope");

  const objects: Array<{ key: string; bytes: number; lastModified?: Date }> = [];
  let continuationToken: string | undefined;
  do {
    const result = await getR2Client().send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: continuationToken }),
    );
    for (const item of result.Contents ?? []) {
      if (item.Key) objects.push({ key: item.Key, bytes: Number(item.Size || 0), lastModified: item.LastModified });
    }
    continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
  } while (continuationToken);

  return objects;
}

export async function headR2Object(params: { bucket: string; key: string }): Promise<R2ObjectHeadType | null> {
  const bucket = String(params.bucket || "").trim();
  const key = trimSlashes(params.key);
  if (!bucket || !key) return null;

  try {
    const result = await getR2Client().send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );
    return {
      bucket,
      key,
      bytes: Number(result.ContentLength || 0),
      contentType: String(result.ContentType || ""),
      sha256: String(result.Metadata?.sha256 || ""),
      etag: String(result.ETag || "").replace(/^"|"$/g, ""),
    };
  } catch {
    return null;
  }
}

export async function getR2ObjectBuffer(params: { bucket: string; key: string }): Promise<Buffer | null> {
  const bucket = String(params.bucket || "").trim();
  const key = trimSlashes(params.key);
  if (!bucket || !key) return null;

  try {
    const result = await getR2Client().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!result.Body) return null;
    return Buffer.from(await result.Body.transformToByteArray());
  } catch {
    return null;
  }
}

export async function copyR2Object(params: {
  sourceBucket: string;
  sourceKey: string;
  targetBucket: string;
  targetKey: string;
  contentType?: string;
  cacheControl?: string;
  sha256?: string;
}) {
  const sourceBucket = String(params.sourceBucket || "").trim();
  const sourceKey = trimSlashes(params.sourceKey);
  const targetBucket = String(params.targetBucket || "").trim();
  const targetKey = trimSlashes(params.targetKey);
  if (!sourceBucket || !sourceKey || !targetBucket || !targetKey) throw new Error("invalid_r2_copy_source_or_target");

  await getR2Client().send(
    new CopyObjectCommand({
      Bucket: targetBucket,
      Key: targetKey,
      CopySource: `${encodeURIComponent(sourceBucket)}/${encodeR2Key(sourceKey)}`,
      ContentType: params.contentType,
      CacheControl: params.cacheControl,
      Metadata: params.sha256 ? { sha256: params.sha256 } : undefined,
      MetadataDirective: params.contentType || params.cacheControl || params.sha256 ? "REPLACE" : "COPY",
    }),
  );

  return {
    bucket: targetBucket,
    key: targetKey,
  };
}

export async function getR2SignedGetUrl(params: { bucket: string; key: string; expiresIn?: number }) {
  const bucket = String(params.bucket || "").trim();
  const key = trimSlashes(params.key);
  if (!bucket || !key) throw new Error("invalid_r2_signed_url_target");

  const expiresIn = Math.max(1, Math.min(604800, Number(params.expiresIn || getR2SignedUrlExpiresSeconds())));
  const url = await getSignedUrl(
    getR2Client(),
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
    { expiresIn },
  );

  return {
    url,
    expiresIn,
    urlExpiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
  };
}

export function getR2PublicObjectFromUrl(url: string): R2PublicObjectType | null {
  const baseUrl = cleanEnv("R2_PUBLIC_BASE_URL").replace(/\/+$/g, "");
  const bucket = cleanEnv("R2_PUBLIC_BUCKET");
  const clean = String(url || "").trim();
  if (!baseUrl || !bucket || !clean.startsWith(`${baseUrl}/`)) return null;

  const rawKey = clean.slice(baseUrl.length).replace(/^\/+/, "");
  const key = rawKey
    .split("/")
    .map((part) => {
      try {
        return decodeURIComponent(part);
      } catch {
        return part;
      }
    })
    .join("/");
  if (!key) return null;

  return {
    driver: "r2",
    access: "public",
    bucket,
    key,
    url: clean,
  };
}

export async function deleteR2PublicObjectByUrl(url: string) {
  const object = getR2PublicObjectFromUrl(url);
  if (!object) return false;
  return await deleteR2Object({ bucket: object.bucket, key: object.key });
}

export function isR2PrivateStorage(storage: Record<string, unknown>) {
  const bucket = String(storage.bucket || "").trim();
  const access = String(storage.access || "").trim();
  return access === "private" || Boolean(bucket && cleanEnv("R2_PRIVATE_BUCKET") && bucket === cleanEnv("R2_PRIVATE_BUCKET"));
}

export function isR2PublicStorage(storage: Record<string, unknown>) {
  const bucket = String(storage.bucket || "").trim();
  const access = String(storage.access || "").trim();
  return access === "public" || Boolean(bucket && cleanEnv("R2_PUBLIC_BUCKET") && bucket === cleanEnv("R2_PUBLIC_BUCKET"));
}
