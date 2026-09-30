import { NextRequest, NextResponse } from "next/server";
import { listAudioAssetsForUser, toAudioAssetTransport } from "libs/database/lab";
import { validateAgentKey } from "libs/server-utils/auth/agentKeyAuth";
import { AGENT_AUDIO_POLICY, enforceAgentRequestRateLimit } from "libs/server-utils/auth/agentRateLimit";
import { extractCodedError } from "utils/common";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function parseIds(raw: string | null) {
  return Array.from(
    new Set(String(raw || "").split(",").map((value) => String(value || "").trim()).filter(Boolean)),
  ).slice(0, 20);
}

/**
 * @docHint
 * @purpose Agent/MCP audio 자산 조회(소유자 한정, 서버 발급 임시 URL만, 타인 자산 존재 비노출)
 * @process agent key(genstudio:audio:read) -> fail-closed rate limit -> listAudioAssetsForUser(uid 필터) -> toAudioAssetTransport + missing[]
 * @domain gen-studio
 * @scope agent-api
 */
export async function GET(request: NextRequest) {
  try {
    const auth = validateAgentKey(request, { scope: "genstudio:audio:read" });
    if (!auth.valid) return NextResponse.json({ ok: false, error: auth.error, errorCode: "UNAUTHORIZED" }, { status: 401 });
    await enforceAgentRequestRateLimit({
      uid: auth.uid,
      endpoint: "ai/agent/gen-studio-audio-assets:read",
      limitPerMinute: AGENT_AUDIO_POLICY.maxReadRequestsPerMinute,
      keyHash: auth.keyHash,
      failClosed: true,
    });
    const searchParams = new URL(request.url).searchParams;
    const assetIds = parseIds(searchParams.get("assetIds") || searchParams.get("assetId"));
    const jobIds = parseIds(searchParams.get("jobIds") || searchParams.get("jobId"));
    if (!assetIds.length && !jobIds.length) {
      return NextResponse.json({ ok: false, error: "assetIds_or_jobIds_required", errorCode: "INVALID_INPUT" }, { status: 400 });
    }
    const assets = await listAudioAssetsForUser({
      uid: auth.uid,
      assetIds,
      jobIds,
      limit: Number(searchParams.get("limit") || 20),
    });
    const found = new Set(assets.map((asset) => String(asset.assetId || "").trim()));
    // 조회되지 않은 assetId는 missing[]로만 돌려 타인 자산의 존재 여부를 노출하지 않는다.
    const missing = assetIds.filter((assetId) => !found.has(assetId));
    return NextResponse.json({
      ok: true,
      data: { assets: await Promise.all(assets.map(toAudioAssetTransport)), missing },
    });
  } catch (error) {
    const { message, errorCode, status } = extractCodedError(error, { message: "Failed to read audio assets" });
    return NextResponse.json({ ok: false, error: message, errorCode }, { status });
  }
}
