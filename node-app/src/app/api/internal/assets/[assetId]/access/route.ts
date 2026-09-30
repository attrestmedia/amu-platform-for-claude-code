import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getImageAssetByAssetId } from "libs/database/lab";
import { mergeAuthAndDbUser, resolveNextContext } from "libs/server-utils/api/_helpers";
import { getAuthUser } from "libs/server-utils/auth/authUtils";
import { getUserFromDB } from "libs/server-utils/auth/userRoleUtils";
import { canAccessImageAsset } from "libs/server-utils/lab/imageAssetAccess";
import { getR2PrivateBucket, isR2PrivateStorage } from "libs/server-utils/storage/r2Storage";
import { logger } from "utils/log";
import type { NextRouteContext } from "libs/server-utils/api/_helpers";

export const runtime = "nodejs";

function toSafeString(value: unknown) {
  return String(value || "").trim();
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function flattenMongooseDoc(value: unknown) {
  const obj = toRecord(value);
  if (typeof obj.toObject === "function") {
    try {
      return (obj.toObject as () => unknown)();
    } catch {
      return value;
    }
  }
  return value;
}

function readBearerToken(request: NextRequest) {
  const authorization = toSafeString(request.headers.get("authorization"));
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function verifyGatewayToken(request: NextRequest) {
  const expected = toSafeString(process.env.WORKER_ASSET_GATEWAY_TOKEN);
  if (!expected) return { ok: false as const, status: 503, error: "GATEWAY_TOKEN_NOT_CONFIGURED" };

  const actual = readBearerToken(request);
  if (!actual || !safeEqual(actual, expected)) {
    return { ok: false as const, status: 401, error: "UNAUTHORIZED_GATEWAY" };
  }

  return { ok: true as const };
}

function sanitizeFilename(value: string) {
  const base = value.split("/").pop() || "image";
  return base.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "image";
}

function denied(error: string, status = 404) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function GET(request: NextRequest, context: NextRouteContext) {
  const token = verifyGatewayToken(request);
  if (!token.ok) return denied(token.error, token.status);

  const ctx = await resolveNextContext(context);
  const assetId = decodeURIComponent(toSafeString(ctx.params?.assetId));
  if (!assetId) return denied("ASSET_ID_REQUIRED", 400);

  const auth = await getAuthUser(request);
  if (!auth.verified) return denied("UNAUTHORIZED", 401);

  const userFromDB = await getUserFromDB(auth.user.ID);
  const mergedUser = mergeAuthAndDbUser(auth.user, flattenMongooseDoc(userFromDB) || null);

  const asset = await getImageAssetByAssetId(assetId);
  if (!asset) return denied("ASSET_NOT_FOUND", 404);
  if (toSafeString(asset.state) !== "active") return denied("ASSET_NOT_FOUND", 404);
  if (toSafeString(asset.visibility) !== "private") return denied("ASSET_NOT_FOUND", 404);

  const storage = toRecord(asset.storage);
  const bucket = toSafeString(storage.bucket);
  const key = toSafeString(storage.key);
  const privateBucket = getR2PrivateBucket();
  const validPrivateR2 =
    toSafeString(storage.driver) === "r2" &&
    isR2PrivateStorage(storage) &&
    bucket === privateBucket &&
    Boolean(key);

  if (!validPrivateR2) return denied("ASSET_NOT_FOUND", 404);

  const allowed = await canAccessImageAsset(mergedUser, asset);
  if (!allowed) return denied("FORBIDDEN", 403);

  const requestId = toSafeString(request.headers.get("x-request-id")) || crypto.randomUUID();
  logger.info("[internal-asset-access] allowed", {
    requestId,
    assetId,
    uid: toSafeString(mergedUser?.uid || mergedUser?.ID),
    bucket,
  });

  return NextResponse.json({
    ok: true,
    data: {
      assetId,
      bucket,
      key,
      mimeType: toSafeString(storage.mimeType) || "application/octet-stream",
      bytes: Number(storage.bytes || 0) || undefined,
      cacheControl: "private, max-age=300",
      downloadFilename: sanitizeFilename(key),
    },
  });
}
