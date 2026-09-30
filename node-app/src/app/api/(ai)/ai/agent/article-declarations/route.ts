import { NextRequest, NextResponse } from "next/server";
import {
  getMagazineArticleDeclaration,
  listMagazineArticleDeclarations,
  upsertMagazineArticleDeclaration,
} from "libs/server-utils/magazine/magazineArticleDeclaration";
import { magazineContentRefId } from "libs/server-utils/magazine/magazineEmbedContract";
import { validateAgentKey } from "libs/server-utils/auth/agentKeyAuth";
import { AGENT_CONTENT_POLICY, enforceAgentRequestRateLimit } from "libs/server-utils/auth/agentRateLimit";
import { extractCodedError, type UnknownRecord } from "utils/common";
import { logger } from "utils/log";

export const runtime = "nodejs";

const ENDPOINT = "ai/agent/article-declarations";

/**
 * @docHint
 * @purpose MCP/agent가 node-app Article Experience declaration을 생성·편집하는 API
 * @process scoped agent auth -> rate limit -> contract validation -> revision guarded upsert
 * @domain magazine-content-experience
 * @scope agent-api
 */

function queryIdentifier(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const refId = String(params.get("refId") || "").trim();
  if (!refId) return {};
  if (!/^[a-z0-9][a-z0-9._:-]{0,127}$/.test(refId)) return null;
  return { refId };
}

function queryLimit(request: NextRequest) {
  const raw = new URL(request.url).searchParams.get("limit");
  if (!raw) return 100;
  const limit = Number(raw);
  return Number.isInteger(limit) && limit >= 1 && limit <= 100 ? limit : null;
}

export async function GET(request: NextRequest) {
  try {
    const auth = validateAgentKey(request, {
      scope: "magazine:article-declarations:read",
      allowWildcard: false,
      allowLegacyWildcard: true,
    });
    if (!auth.valid) return NextResponse.json({ ok: false, error: auth.error, errorCode: "UNAUTHORIZED" }, { status: 401 });
    await enforceAgentRequestRateLimit({ uid: auth.uid, endpoint: ENDPOINT, limitPerMinute: AGENT_CONTENT_POLICY.maxReadRequestsPerMinute, keyHash: auth.keyHash, failClosed: true });

    const identifier = queryIdentifier(request);
    if (identifier === null) return NextResponse.json({ ok: false, error: "invalid_identifier", errorCode: "INVALID_INPUT" }, { status: 400 });
    const limit = queryLimit(request);
    if (limit === null) return NextResponse.json({ ok: false, error: "invalid_limit", errorCode: "INVALID_INPUT" }, { status: 400 });
    const result = Object.keys(identifier).length === 0
      ? await listMagazineArticleDeclarations(limit)
      : await getMagazineArticleDeclaration(identifier);
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error, errorCode: result.error === "not_found" ? "NOT_FOUND" : "SERVICE_UNAVAILABLE" }, { status: result.error === "not_found" ? 404 : 503, headers: result.error === "unavailable" ? { "Retry-After": "30" } : undefined });
    logger.info("[agent-article-declarations] read", { endpoint: ENDPOINT, uid: auth.uid, keyHash: auth.keyHash, postId: "data" in result && !Array.isArray(result.data) ? (magazineContentRefId(result.data.declaration.contentRef)) : undefined });
    return NextResponse.json({ ok: true, data: result.data });
  } catch (error) {
    const normalized = extractCodedError(error, { message: "Failed to read article declarations" });
    logger.error("[agent-article-declarations] read failed", { endpoint: ENDPOINT, error: normalized.message, errorCode: normalized.errorCode, status: normalized.status });
    return NextResponse.json({ ok: false, error: normalized.message, errorCode: normalized.errorCode }, { status: normalized.status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = validateAgentKey(request, {
      scope: "magazine:article-declarations:write",
      allowWildcard: false,
      allowLegacyWildcard: true,
    });
    if (!auth.valid) return NextResponse.json({ ok: false, error: auth.error, errorCode: "UNAUTHORIZED" }, { status: 401 });
    await enforceAgentRequestRateLimit({ uid: auth.uid, endpoint: `${ENDPOINT}:write`, limitPerMinute: AGENT_CONTENT_POLICY.maxRequestsPerMinute, keyHash: auth.keyHash, failClosed: true });

    const body = (await request.json().catch(() => null)) as UnknownRecord | null;
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ ok: false, error: "invalid_payload", errorCode: "INVALID_INPUT" }, { status: 400 });
    if (body.expectedRevision !== undefined && typeof body.expectedRevision !== "string") return NextResponse.json({ ok: false, error: "invalid_expected_revision", errorCode: "INVALID_INPUT" }, { status: 400 });
    const declaration = body.declaration ?? body;
    const expectedRevision = typeof body.expectedRevision === "string" ? body.expectedRevision.trim() || undefined : undefined;
    const result = await upsertMagazineArticleDeclaration(declaration, { actor: auth.uid, source: "agent", expectedRevision });
    if (!result.ok && result.error === "validation_failed") return NextResponse.json({ ok: false, error: result.error, issues: result.issues, errorCode: "INVALID_INPUT" }, { status: 400 });
    if (!result.ok && result.error === "conflict") return NextResponse.json({ ok: false, error: result.error, errorCode: "CONFLICT" }, { status: 409 });
    if (!result.ok) return NextResponse.json({ ok: false, error: "declaration_store_unavailable", errorCode: "SERVICE_UNAVAILABLE" }, { status: 503, headers: { "Retry-After": "30" } });
    logger.info("[agent-article-declarations] upserted", { endpoint: `${ENDPOINT}:write`, uid: auth.uid, keyHash: auth.keyHash, contentRefKey: magazineContentRefId(result.data.declaration.contentRef), revision: result.data.revision, created: result.created });
    return NextResponse.json({ ok: true, created: result.created, data: result.data }, { status: result.created ? 201 : 200 });
  } catch (error) {
    const normalized = extractCodedError(error, { message: "Failed to write article declaration" });
    logger.error("[agent-article-declarations] write failed", { endpoint: `${ENDPOINT}:write`, error: normalized.message, errorCode: normalized.errorCode, status: normalized.status });
    return NextResponse.json({ ok: false, error: normalized.message, errorCode: normalized.errorCode }, { status: normalized.status });
  }
}
