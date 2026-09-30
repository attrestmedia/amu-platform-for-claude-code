import { NextRequest, NextResponse } from "next/server";
import { AGENT_IMAGE_POLICY, enforceAgentRequestRateLimit } from "libs/server-utils/auth/agentRateLimit";
import { validateAgentKey } from "libs/server-utils/auth/agentKeyAuth";
import { listTutorPersonaEvidence } from "libs/server-utils/tutors/tutorPersonaEvidenceService";
import { extractCodedError } from "utils/common";
import type { UnknownRecord } from "utils/common/typeUtils";
import { logger } from "utils/log";

export const runtime = "nodejs";

const AGENT_TUTOR_PERSONAS_ENDPOINT = "ai/agent/tutor-personas";

/**
 * @docHint
 * @purpose Agent/MCP에 튜터 페르소나 메타와 프로필 이미지 자산 연결을 읽기 전용으로 제공
 * @process agent 인증 -> fail-closed rate-limit -> scope 판별(public/mine) -> 페르소나 조회 -> uid 비노출 응답
 * @domain tutors
 * @scope agent-api
 */
export async function POST(request: NextRequest) {
  try {
    const auth = validateAgentKey(request, {
      scope: "tutors:personas:read",
      allowWildcard: false,
      allowLegacyWildcard: true,
    });
    if (!auth.valid) {
      return NextResponse.json({ ok: false, error: auth.error, errorCode: "UNAUTHORIZED" }, { status: 401 });
    }

    await enforceAgentRequestRateLimit({
      uid: auth.uid,
      endpoint: AGENT_TUTOR_PERSONAS_ENDPOINT,
      limitPerMinute: AGENT_IMAGE_POLICY.maxListRequestsPerMinute,
      keyHash: auth.keyHash,
      failClosed: true,
    });

    const body = (await request.json().catch(() => null)) as UnknownRecord | null;
    const scope = String(body?.scope || "public").trim() === "mine" ? "mine" : "public";

    const rawSinceDays = Number(body?.sinceDays || 0);
    if (rawSinceDays && (!Number.isFinite(rawSinceDays) || rawSinceDays < 1 || rawSinceDays > 90)) {
      return NextResponse.json({ ok: false, error: "invalid_since_days", errorCode: "INVALID_INPUT" }, { status: 400 });
    }

    const rawLimit = Number(body?.limit || 0);
    if (rawLimit && (!Number.isFinite(rawLimit) || rawLimit < 1 || rawLimit > 50)) {
      return NextResponse.json({ ok: false, error: "invalid_limit", errorCode: "INVALID_INPUT" }, { status: 400 });
    }

    const data = await listTutorPersonaEvidence({
      uid: auth.uid,
      scope,
      pid: String(body?.pid || "").trim() || undefined,
      sinceDays: rawSinceDays || undefined,
      limit: rawLimit || undefined,
      includeAssetIds: body?.includeAssetIds !== false,
    });

    // URL 원문과 uid는 로그에 남기지 않는다. 개수와 판정 결과만 남긴다.
    logger.info("[agent-tutor-personas] listed", {
      endpoint: AGENT_TUTOR_PERSONAS_ENDPOINT,
      keyId: auth.keyId,
      keyHash: auth.keyHash,
      scope,
      personaCount: data.personas.length,
      resolvedAssetCount: data.personas.reduce((sum, item) => sum + item.resolvedAssets.length, 0),
      unresolvedCount: data.personas.reduce((sum, item) => sum + item.unresolvedImageUrls.length, 0),
    });

    return NextResponse.json({ ok: true, data });
  } catch (error) {
    const { message, errorCode, status } = extractCodedError(error, {
      message: "Failed to list tutor personas",
    });
    logger.error("[agent-tutor-personas] failed", {
      endpoint: AGENT_TUTOR_PERSONAS_ENDPOINT,
      error: message,
      errorCode,
      status,
    });
    return NextResponse.json({ ok: false, error: message, errorCode }, { status });
  }
}
