import { NextRequest, NextResponse } from "next/server";
import { getContentAssetByAssetId } from "libs/database/lab";
import { validateAgentKey } from "libs/server-utils/auth/agentKeyAuth";
import { AGENT_CONTENT_POLICY, enforceAgentRequestRateLimit } from "libs/server-utils/auth/agentRateLimit";
import { logger } from "utils/log";

import { extractCodedError } from "utils/common";
export const runtime = "nodejs";

const AGENT_CONTENT_READ_ENDPOINT = "ai/agent/studio-contents";

/**
 * @docHint
 * @purpose Agent/MCP에 소유·공개 콘텐츠 asset의 본문 전문 제공
 * @process agent 인증(genstudio:content:read) -> rate-limit -> assetId 검증 -> 소유/공개 판정 -> 본문 반환
 * @domain ai-content
 * @scope agent-api
 */

/**
 * 생성 라우트(`agent-content`)는 응답에 180자 preview만 싣는다.
 * 세션 인증 라우트(`lab/studio-contents/[assetId]`)는 전문을 주지만 `withAuth`가 사용자 토큰을 요구해
 * agent key로는 진입할 수 없다. 그 사이에서 에이전트가 자기 자산 본문을 되읽을 경로가 없었다.
 * 이 라우트는 그 갭만 메운다 — 읽기 전용, 소유자 또는 공개 자산으로 한정한다.
 */
function toSafeString(v: unknown) {
  return String(v || "").trim();
}

function parseAssetIds(raw?: string | null) {
  return Array.from(
    new Set(
      toSafeString(raw)
        .split(",")
        .map((item) => toSafeString(item))
        .filter(Boolean),
    ),
  );
}

export async function GET(request: NextRequest) {
  try {
    const auth = validateAgentKey(request, { scope: "genstudio:content:read" });
    if (!auth.valid) {
      return NextResponse.json({ ok: false, error: auth.error, errorCode: "UNAUTHORIZED" }, { status: 401 });
    }

    await enforceAgentRequestRateLimit({
      uid: auth.uid,
      endpoint: AGENT_CONTENT_READ_ENDPOINT,
      limitPerMinute: AGENT_CONTENT_POLICY.maxReadRequestsPerMinute,
      keyHash: auth.keyHash,
    });

    const searchParams = new URL(request.url).searchParams;
    const assetIds = parseAssetIds(searchParams.get("assetIds") || searchParams.get("assetId"));

    if (assetIds.length === 0) {
      return NextResponse.json({ ok: false, error: "assetIds_required", errorCode: "INVALID_INPUT" }, { status: 400 });
    }

    if (assetIds.length > AGENT_CONTENT_POLICY.maxReadAssetsPerRequest) {
      return NextResponse.json(
        { ok: false, error: "assetIds_too_many", errorCode: "INVALID_INPUT" },
        { status: 400 },
      );
    }

    const assets: Record<string, unknown>[] = [];
    const missing: { assetId: string; reason: string }[] = [];

    for (const assetId of assetIds) {
      const asset = await getContentAssetByAssetId(assetId);
      if (!asset || asset.state !== "active") {
        missing.push({ assetId, reason: "not_found" });
        continue;
      }

      const ownerUid = toSafeString(asset.uid);
      const isOwner = Boolean(ownerUid && ownerUid === auth.uid);
      const isPublic = asset.visibility === "public";

      // 소유자가 아니면 공개 자산만 읽는다. 타 사용자의 private 본문은 어떤 경우에도 내려보내지 않는다.
      if (!isOwner && !isPublic) {
        missing.push({ assetId, reason: "forbidden" });
        continue;
      }

      const text = String(asset?.content?.text || "");
      assets.push({
        assetId: toSafeString(asset.assetId),
        text,
        isOwner,
        jobId: toSafeString(asset.jobId),
        templateKey: toSafeString(asset.templateKey),
        visibility: isPublic ? "public" : "private",
        scope: toSafeString(asset.scope),
        universeId: toSafeString(asset.universeId),
        provider: toSafeString(asset.provider),
        modelName: toSafeString(asset.modelName),
        generationMode: toSafeString(asset.generationMode),
        outputIndex: Number(asset.outputIndex || 0),
        state: toSafeString(asset.state),
        createdAt: asset.createdAt || null,
        content: {
          chars: Number(asset?.content?.chars || 0),
          bytes: Number(asset?.content?.bytes || 0),
          sha256: toSafeString(asset?.content?.sha256),
        },
      });
    }

    logger.info("[agent-studio-contents] fetched", {
      endpoint: AGENT_CONTENT_READ_ENDPOINT,
      uid: auth.uid,
      keyHash: auth.keyHash,
      requested: assetIds.length,
      returned: assets.length,
      missing: missing.length,
    });

    return NextResponse.json({ ok: true, data: { assets, missing } });
  } catch (err) {
    const { message, errorCode, status } = extractCodedError(err, {
      message: "Failed to read content assets",
    });
    logger.error("[agent-studio-contents] read failed", {
      endpoint: AGENT_CONTENT_READ_ENDPOINT,
      error: message,
      errorCode,
      status,
    });
    return NextResponse.json({ ok: false, error: message, errorCode }, { status });
  }
}
