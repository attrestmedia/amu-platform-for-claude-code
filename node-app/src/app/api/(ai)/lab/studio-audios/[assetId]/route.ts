import { NextResponse, type NextRequest } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import type { AuthenticatedUserType, NextRouteContext } from "libs/server-utils/api/_helpers";
import { getAudioAssetByAssetId, toAudioAssetTransport } from "libs/database/lab";
import { deleteStudioAudioAssetForUser } from "libs/server-utils/lab/studioAudioJobQueue";
import { toUnknownRecord } from "utils/common";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function safe(value: unknown) {
  return String(value || "").trim();
}

function uidOf(user: AuthenticatedUserType) {
  return safe(user?.uid || user?.ID || user?.id);
}

async function handleGET(_data: unknown, user: AuthenticatedUserType, _request: NextRequest, context: NextRouteContext) {
  const uid = uidOf(user);
  const assetId = safe(context?.params?.assetId);
  const asset = await getAudioAssetByAssetId(assetId);
  if (!uid) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  if (!asset || asset.uid !== uid) return NextResponse.json({ ok: false, error: "asset_not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, data: await toAudioAssetTransport(asset) });
}

function validateDelete(data: unknown) {
  const body = toUnknownRecord(data);
  const policy = safe(body.policy || "soft").toLowerCase();
  if (!["soft", "hard", "detach"].includes(policy)) return { valid: false, error: "invalid_delete_policy" };
  return { valid: true };
}

async function handleDELETE(data: unknown, user: AuthenticatedUserType, _request: NextRequest, context: NextRouteContext) {
  const uid = uidOf(user);
  const assetId = safe(context?.params?.assetId);
  const body = toUnknownRecord(data);
  if (!uid) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  const policy = safe(body.policy || "soft").toLowerCase() as "soft" | "hard" | "detach";
  const result = await deleteStudioAudioAssetForUser({ uid, assetId, policy, reason: safe(body.reason) || "user_delete" });
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error, errorCode: result.errorCode }, { status: 404 });
  return NextResponse.json({ ok: true, data: { assetId, state: result.asset?.state || "deleted" } });
}

export const GET = withAuth(handleGET, undefined, "lab/studio-audios:read", { bodyParser: "none" });
export const DELETE = withAuth(handleDELETE, validateDelete, "lab/studio-audios:delete");
