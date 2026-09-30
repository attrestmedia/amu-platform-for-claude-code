import { NextRequest, NextResponse } from "next/server";
import { listVideoAssetsForUser, toVideoAssetTransport } from "libs/database/lab";
import { validateAgentKey } from "libs/server-utils/auth/agentKeyAuth";
import { AGENT_VIDEO_POLICY, enforceAgentRequestRateLimit } from "libs/server-utils/auth/agentRateLimit";
import { extractCodedError } from "utils/common";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function parseIds(raw: string | null) {
  return Array.from(new Set(String(raw || "").split(",").map((value) => String(value || "").trim()).filter(Boolean))).slice(0, 20);
}

export async function GET(request: NextRequest) {
  try {
    const auth = validateAgentKey(request, { scope: "genstudio:video:read" });
    if (!auth.valid) return NextResponse.json({ ok: false, error: auth.error, errorCode: "UNAUTHORIZED" }, { status: 401 });
    await enforceAgentRequestRateLimit({ uid: auth.uid, endpoint: "ai/agent/gen-studio-video-assets", limitPerMinute: AGENT_VIDEO_POLICY.maxReadRequestsPerMinute, keyHash: auth.keyHash, failClosed: true });
    const searchParams = new URL(request.url).searchParams;
    const assetIds = parseIds(searchParams.get("assetIds") || searchParams.get("assetId"));
    const jobIds = parseIds(searchParams.get("jobIds") || searchParams.get("jobId"));
    if (!assetIds.length && !jobIds.length) return NextResponse.json({ ok: false, error: "assetIds_or_jobIds_required", errorCode: "INVALID_INPUT" }, { status: 400 });
    const assets = await listVideoAssetsForUser({ uid: auth.uid, assetIds, jobIds, limit: Number(searchParams.get("limit") || 20) });
    return NextResponse.json({ ok: true, data: { assets: await Promise.all(assets.map(toVideoAssetTransport)) } });
  } catch (error) {
    const { message, errorCode, status } = extractCodedError(error, { message: "Failed to read video assets" });
    return NextResponse.json({ ok: false, error: message, errorCode }, { status });
  }
}
