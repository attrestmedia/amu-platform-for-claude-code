import { NextRequest, NextResponse } from "next/server";
import { validateAgentKey } from "libs/server-utils/auth/agentKeyAuth";
import { AGENT_CONTENT_POLICY, enforceAgentRequestRateLimit } from "libs/server-utils/auth/agentRateLimit";
import { magazineKnowledgeContentId } from "libs/server-utils/magazine/magazineKnowledgeContract";
import {
  listMagazineKnowledgeUnits,
  upsertMagazineKnowledgeUnit,
} from "libs/server-utils/magazine/magazineKnowledgeRepo";
import { extractCodedError, type UnknownRecord } from "utils/common";
import { logger } from "utils/log";

export const runtime = "nodejs";

/**
 * @docHint
 * @purpose MCP/agent가 Knowledge Unit을 개별 조회·갱신하는 API — MIR-204
 * @process scoped agent auth -> rate limit -> contract validation -> 소속 기사·sourceRevision 확인 -> CAS upsert
 * @domain magazine-knowledge-corpus
 * @scope agent-api
 */

const ENDPOINT = "ai/agent/knowledge-units";

function json(body: UnknownRecord, status = 200, retryable = false) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0", ...(retryable ? { "Retry-After": "30" } : {}) },
  });
}

function contentIdFrom(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const contentId = String(params.get("contentId") || "").trim();
  if (contentId) return contentId;
  const rawPostId = params.get("postId");
  if (!rawPostId) return null;
  const postId = Number(rawPostId);
  if (!Number.isSafeInteger(postId) || postId < 1) return null;
  return magazineKnowledgeContentId(postId);
}

export async function GET(request: NextRequest) {
  try {
    const auth = validateAgentKey(request, { scope: "magazine:knowledge:read", allowWildcard: false, allowLegacyWildcard: true });
    if (!auth.valid) return json({ ok: false, error: auth.error, errorCode: "UNAUTHORIZED" }, 401);
    await enforceAgentRequestRateLimit({ uid: auth.uid, endpoint: ENDPOINT, limitPerMinute: AGENT_CONTENT_POLICY.maxReadRequestsPerMinute, keyHash: auth.keyHash, failClosed: true });

    const contentId = contentIdFrom(request);
    if (!contentId) return json({ ok: false, error: "invalid_identifier", errorCode: "INVALID_INPUT" }, 400);
    const params = new URL(request.url).searchParams;
    const unitType = String(params.get("unitType") || "").trim() || undefined;

    const result = await listMagazineKnowledgeUnits({
      contentId,
      unitType: unitType as Parameters<typeof listMagazineKnowledgeUnits>[0]["unitType"],
      limit: Number(params.get("limit")) || undefined,
    });
    if (!result.ok) return json({ ok: false, error: result.error, errorCode: "SERVICE_UNAVAILABLE" }, 503, true);
    return json({ ok: true, data: result.data });
  } catch (error) {
    const normalized = extractCodedError(error, { message: "Failed to read knowledge units" });
    logger.error("[agent-knowledge-units] read failed", { endpoint: ENDPOINT, error: normalized.message, errorCode: normalized.errorCode });
    return json({ ok: false, error: normalized.message, errorCode: normalized.errorCode }, normalized.status);
  }
}

/** 개별 Knowledge Unit 갱신. 기사 전체 재적재 없이 unit 하나만 고칠 때 쓴다. */
export async function POST(request: NextRequest) {
  try {
    const auth = validateAgentKey(request, { scope: "magazine:knowledge:write", allowWildcard: false, allowLegacyWildcard: true });
    if (!auth.valid) return json({ ok: false, error: auth.error, errorCode: "UNAUTHORIZED" }, 401);
    await enforceAgentRequestRateLimit({ uid: auth.uid, endpoint: `${ENDPOINT}:write`, limitPerMinute: AGENT_CONTENT_POLICY.maxRequestsPerMinute, keyHash: auth.keyHash, failClosed: true });

    const body = (await request.json().catch(() => null)) as UnknownRecord | null;
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ ok: false, error: "invalid_payload", errorCode: "INVALID_INPUT" }, 400);
    if (body.expectedRevision !== undefined && typeof body.expectedRevision !== "string") {
      return json({ ok: false, error: "invalid_expected_revision", errorCode: "INVALID_INPUT" }, 400);
    }
    const expectedRevision = typeof body.expectedRevision === "string" ? body.expectedRevision.trim() || undefined : undefined;

    const result = await upsertMagazineKnowledgeUnit(body.unit ?? body, { actor: auth.uid, source: "agent", expectedRevision });
    if (!result.ok && result.error === "validation_failed") return json({ ok: false, error: result.error, issues: result.issues, errorCode: "INVALID_INPUT" }, 400);
    if (!result.ok && result.error === "article_not_found") return json({ ok: false, error: result.error, errorCode: "NOT_FOUND" }, 404);
    if (!result.ok && result.error === "stale_source_revision") return json({ ok: false, error: result.error, errorCode: "CONFLICT" }, 409);
    if (!result.ok && result.error === "conflict") return json({ ok: false, error: result.error, errorCode: "CONFLICT" }, 409);
    if (!result.ok) return json({ ok: false, error: "knowledge_store_unavailable", errorCode: "SERVICE_UNAVAILABLE" }, 503, true);

    logger.info("[agent-knowledge-units] upserted", {
      endpoint: `${ENDPOINT}:write`,
      uid: auth.uid,
      keyHash: auth.keyHash,
      unitId: result.data.unit.unitId,
      created: result.created,
    });
    return json({ ok: true, created: result.created, data: result.data }, result.created ? 201 : 200);
  } catch (error) {
    const normalized = extractCodedError(error, { message: "Failed to write knowledge unit" });
    logger.error("[agent-knowledge-units] write failed", { endpoint: `${ENDPOINT}:write`, error: normalized.message, errorCode: normalized.errorCode });
    return json({ ok: false, error: normalized.message, errorCode: normalized.errorCode }, normalized.status);
  }
}
