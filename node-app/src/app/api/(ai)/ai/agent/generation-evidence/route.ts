import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { AGENT_IMAGE_POLICY, enforceAgentRequestRateLimit } from "libs/server-utils/auth/agentRateLimit";
import { validateAgentKey } from "libs/server-utils/auth/agentKeyAuth";
import {
  getAudioGenerationEvidenceBundle,
  getContentGenerationEvidenceBundle,
  getGenerationEvidenceBundle,
} from "libs/server-utils/lab/generationEvidenceService";
import { extractCodedError } from "utils/common";
import type { UnknownRecord } from "utils/common/typeUtils";
import { logger } from "utils/log";

export const runtime = "nodejs";

const AGENT_GENERATION_EVIDENCE_ENDPOINT = "ai/agent/generation-evidence";
const ASSET_ID_PATTERN = /^asset_[a-zA-Z0-9_-]{4,122}$/;
const CONTENT_ASSET_ID_PATTERN = /^content_asset_[a-zA-Z0-9_-]{4,122}$/;
const AUDIO_ASSET_ID_PATTERN = /^audio_asset_[a-zA-Z0-9_-]{4,122}$/;

type EvidenceAssetKind = "image" | "content" | "audio";

/**
 * 이미지 자산(`asset_…`)·콘텐츠 자산(`content_asset_…`)·audio 자산(`audio_asset_…`)은
 * 컬렉션·과금 operationId가 서로 다르다. 한 번의 요청에서 섞이면 어느 쪽 상관 검증을
 * 적용할지 모호해지므로 동종만 허용한다.
 */
function readAssetIds(body: UnknownRecord | null): { assetIds: string[]; assetKind: EvidenceAssetKind } | null {
  if (!body || !Array.isArray(body.assetIds) || body.assetIds.length < 1 || body.assetIds.length > 10) {
    return null;
  }
  const assetIds = Array.from(
    new Set(
      body.assetIds
        .map((assetId) => String(assetId || "").trim())
        .filter(Boolean),
    ),
  );
  if (assetIds.length < 1 || assetIds.length > 10) return null;

  if (assetIds.every((assetId) => CONTENT_ASSET_ID_PATTERN.test(assetId))) {
    return { assetIds, assetKind: "content" };
  }
  if (assetIds.every((assetId) => AUDIO_ASSET_ID_PATTERN.test(assetId))) {
    return { assetIds, assetKind: "audio" };
  }
  if (assetIds.every((assetId) => ASSET_ID_PATTERN.test(assetId))) {
    return { assetIds, assetKind: "image" };
  }
  return null;
}

function digestAssetIds(assetIds: string[]) {
  return crypto
    .createHash("sha256")
    .update([...assetIds].sort().join("\n"))
    .digest("hex")
    .slice(0, 16);
}

/**
 * @docHint
 * @purpose Agent/MCP에 exact asset ID 기반 이미지·콘텐츠 생성 자산·잡·과금 원장 감사 bundle 제공
 * @process agent 인증(legacy pair 또는 scoped JSON key) -> fail-closed rate-limit -> assetId 종류 판별(image/content) -> 소유 자산 조회 -> job/ledger 상관 검증 -> 민감 필드 제거
 * @domain ai-image
 * @scope agent-api
 */
export async function POST(request: NextRequest) {
  try {
    const auth = validateAgentKey(request, {
      scope: "genstudio:evidence:read",
      allowWildcard: false,
      allowLegacyWildcard: true,
    });
    if (!auth.valid) {
      return NextResponse.json(
        { ok: false, error: auth.error, errorCode: "UNAUTHORIZED" },
        { status: 401 },
      );
    }

    await enforceAgentRequestRateLimit({
      uid: auth.uid,
      endpoint: AGENT_GENERATION_EVIDENCE_ENDPOINT,
      limitPerMinute: AGENT_IMAGE_POLICY.maxListRequestsPerMinute,
      keyHash: auth.keyHash,
      failClosed: true,
    });

    const body = (await request.json().catch(() => null)) as UnknownRecord | null;
    const parsed = readAssetIds(body);
    if (!parsed) {
      return NextResponse.json(
        { ok: false, error: "invalid_asset_ids", errorCode: "INVALID_INPUT" },
        { status: 400 },
      );
    }

    const { assetIds, assetKind } = parsed;
    const data =
      assetKind === "content"
        ? await getContentGenerationEvidenceBundle({ uid: auth.uid, assetIds })
        : assetKind === "audio"
          ? await getAudioGenerationEvidenceBundle({ uid: auth.uid, assetIds })
          : await getGenerationEvidenceBundle({ uid: auth.uid, assetIds });
    logger.info("[agent-generation-evidence] bundle generated", {
      endpoint: AGENT_GENERATION_EVIDENCE_ENDPOINT,
      keyId: auth.keyId,
      keyHash: auth.keyHash,
      assetKind,
      assetIdsDigest: digestAssetIds(assetIds),
      requestedCount: assetIds.length,
      assetCount: data.assets.length,
      jobCount: data.jobs.length,
      ledgerCount: data.ledger.length,
      warningCodes: data.integrity.warnings.map((warning) => warning.code),
    });

    return NextResponse.json({ ok: true, data });
  } catch (error) {
    const { message, errorCode, status } = extractCodedError(error, {
      message: "Failed to fetch generation evidence",
    });
    logger.error("[agent-generation-evidence] failed", {
      endpoint: AGENT_GENERATION_EVIDENCE_ENDPOINT,
      error: message,
      errorCode,
      status,
    });
    return NextResponse.json({ ok: false, error: message, errorCode }, { status });
  }
}
