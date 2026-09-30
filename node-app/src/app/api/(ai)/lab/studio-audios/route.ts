import { NextResponse, type NextRequest } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import { listAudioAssetsForUser, toAudioAssetTransport } from "libs/database/lab";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function safe(value: unknown) {
  return String(value || "").trim();
}

function uidOf(user: AuthenticatedUserType) {
  return safe(user?.uid || user?.ID || user?.id);
}

async function handleGET(_data: unknown, user: AuthenticatedUserType, request: NextRequest) {
  const uid = uidOf(user);
  if (!uid) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  const search = request.nextUrl.searchParams;
  const assetIds = safe(search.get("assetIds")).split(",").map(safe).filter(Boolean).slice(0, 50);
  const jobIds = safe(search.get("jobIds")).split(",").map(safe).filter(Boolean).slice(0, 50);
  const assets = await listAudioAssetsForUser({ uid, assetIds, jobIds, limit: Number(search.get("limit") || 20) });
  return NextResponse.json({ ok: true, data: await Promise.all(assets.map(toAudioAssetTransport)) });
}

export const GET = withAuth(handleGET, undefined, "lab/studio-audios:get", { bodyParser: "none" });
