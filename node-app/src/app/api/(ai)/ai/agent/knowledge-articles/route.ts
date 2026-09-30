import { NextRequest, NextResponse } from "next/server";
import { validateAgentKey } from "libs/server-utils/auth/agentKeyAuth";
import { AGENT_CONTENT_POLICY, enforceAgentRequestRateLimit } from "libs/server-utils/auth/agentRateLimit";
import { buildKnowledgeRecordsFromArticleMetadata } from "libs/server-utils/magazine/magazineKnowledgeIngest";
import {
  getMagazineKnowledgeArticle,
  listMagazineKnowledgeArticles,
  listMagazineKnowledgeUnits,
  updateMagazineKnowledgeIntelligence,
  upsertMagazineKnowledgeArticle,
  upsertMagazineKnowledgeUnit,
} from "libs/server-utils/magazine/magazineKnowledgeRepo";
import { extractCodedError, type UnknownRecord } from "utils/common";
import { logger } from "utils/log";

export const runtime = "nodejs";

/**
 * @docHint
 * @purpose MCP/agent가 원고 메타를 Knowledge Corpus로 적재·조회·판정 갱신하는 API — MIR-204
 * @process scoped agent auth -> rate limit -> 원고 메타 변환 -> revision guarded upsert -> unit 적재
 * @domain magazine-knowledge-corpus
 * @scope agent-api
 */

const ENDPOINT = "ai/agent/knowledge-articles";

function json(body: UnknownRecord, status = 200, retryable = false) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0", ...(retryable ? { "Retry-After": "30" } : {}) },
  });
}

function identifierFrom(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const rawPostId = params.get("postId");
  const slug = String(params.get("slug") || "").trim();
  const contentId = String(params.get("contentId") || "").trim();
  if (rawPostId) {
    const postId = Number(rawPostId);
    if (!Number.isSafeInteger(postId) || postId < 1) return null;
    return { postId };
  }
  if (contentId) return { contentId };
  if (slug) return { slug };
  return {};
}

function sourceFrom(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as UnknownRecord;
  const postId = Number(raw.postId);
  const slug = String(raw.slug ?? "").trim();
  const canonicalUrl = String(raw.canonicalUrl ?? "").trim();
  if (!Number.isSafeInteger(postId) || postId < 1 || !slug || !canonicalUrl) return null;
  return { postId, slug, canonicalUrl };
}

export async function GET(request: NextRequest) {
  try {
    const auth = validateAgentKey(request, { scope: "magazine:knowledge:read", allowWildcard: false, allowLegacyWildcard: true });
    if (!auth.valid) return json({ ok: false, error: auth.error, errorCode: "UNAUTHORIZED" }, 401);
    await enforceAgentRequestRateLimit({ uid: auth.uid, endpoint: ENDPOINT, limitPerMinute: AGENT_CONTENT_POLICY.maxReadRequestsPerMinute, keyHash: auth.keyHash, failClosed: true });

    const identifier = identifierFrom(request);
    if (identifier === null) return json({ ok: false, error: "invalid_identifier", errorCode: "INVALID_INPUT" }, 400);
    const params = new URL(request.url).searchParams;

    if (Object.keys(identifier).length === 0) {
      const result = await listMagazineKnowledgeArticles({
        topic: params.get("topic") || undefined,
        entity: params.get("entity") || undefined,
        limit: Number(params.get("limit")) || undefined,
      });
      if (!result.ok) return json({ ok: false, error: result.error, errorCode: "SERVICE_UNAVAILABLE" }, 503, true);
      return json({ ok: true, data: result.data });
    }

    const result = await getMagazineKnowledgeArticle(identifier);
    if (!result.ok) {
      const notFound = result.error === "not_found";
      return json({ ok: false, error: result.error, errorCode: notFound ? "NOT_FOUND" : "SERVICE_UNAVAILABLE" }, notFound ? 404 : 503, !notFound);
    }
    const units = params.get("includeUnits") === "true"
      ? await listMagazineKnowledgeUnits({ contentId: result.data.article.contentId })
      : null;
    return json({ ok: true, data: result.data, units: units?.ok ? units.data : undefined });
  } catch (error) {
    const normalized = extractCodedError(error, { message: "Failed to read knowledge articles" });
    logger.error("[agent-knowledge-articles] read failed", { endpoint: ENDPOINT, error: normalized.message, errorCode: normalized.errorCode });
    return json({ ok: false, error: normalized.message, errorCode: normalized.errorCode }, normalized.status);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = validateAgentKey(request, { scope: "magazine:knowledge:write", allowWildcard: false, allowLegacyWildcard: true });
    if (!auth.valid) return json({ ok: false, error: auth.error, errorCode: "UNAUTHORIZED" }, 401);
    await enforceAgentRequestRateLimit({ uid: auth.uid, endpoint: `${ENDPOINT}:write`, limitPerMinute: AGENT_CONTENT_POLICY.maxRequestsPerMinute, keyHash: auth.keyHash, failClosed: true });

    const body = (await request.json().catch(() => null)) as UnknownRecord | null;
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ ok: false, error: "invalid_payload", errorCode: "INVALID_INPUT" }, 400);

    const source = sourceFrom(body.source);
    if (!source) return json({ ok: false, error: "invalid_source", errorCode: "INVALID_INPUT" }, 400);
    const sourceRevision = String(body.sourceRevision ?? "").trim();
    if (!sourceRevision) return json({ ok: false, error: "missing_source_revision", errorCode: "INVALID_INPUT" }, 400);

    const built = buildKnowledgeRecordsFromArticleMetadata({ metadata: body.metadata, source, sourceRevision });
    if (!built.ok) return json({ ok: false, error: built.reasonCode, issues: built.issues, errorCode: "INVALID_INPUT" }, 400);

    // 기본은 dry-run이다. 실제 저장은 명시적으로 dryRun=false를 보낼 때만 수행한다.
    const dryRun = body.dryRun !== false;
    if (dryRun) {
      return json({ ok: true, dryRun: true, applied: false, data: { article: built.article, units: built.units } });
    }

    const expectedRevision = typeof body.expectedRevision === "string" ? body.expectedRevision.trim() || undefined : undefined;
    const expectedSourceRevision = typeof body.expectedSourceRevision === "string" ? body.expectedSourceRevision.trim() || undefined : undefined;
    const saved = await upsertMagazineKnowledgeArticle(built.article, { actor: auth.uid, source: "agent", expectedRevision, expectedSourceRevision });
    if (!saved.ok && saved.error === "validation_failed") return json({ ok: false, error: saved.error, issues: saved.issues, errorCode: "INVALID_INPUT" }, 400);
    if (!saved.ok && saved.error === "conflict") return json({ ok: false, error: saved.error, errorCode: "CONFLICT" }, 409);
    if (!saved.ok && saved.error === "stale_source_revision") return json({ ok: false, error: saved.error, errorCode: "CONFLICT" }, 409);
    if (!saved.ok) return json({ ok: false, error: "knowledge_store_unavailable", errorCode: "SERVICE_UNAVAILABLE" }, 503, true);

    // Knowledge Unit은 기사 저장 성공 뒤에만 넣는다. 부분 실패를 성공으로 기록하지 않는다.
    // 재적재가 정상 흐름이므로 기존 unit의 revision을 먼저 읽어 CAS 조건으로 넘긴다.
    const stored = await listMagazineKnowledgeUnits({ contentId: built.article.contentId, limit: 200 });
    const knownRevisions = new Map<string, string>();
    if (stored.ok) for (const item of stored.data) knownRevisions.set(item.unit.unitId, item.revision);

    const unitResults: UnknownRecord[] = [];
    let unitFailures = 0;
    for (const unit of built.units) {
      const result = await upsertMagazineKnowledgeUnit(unit, { actor: auth.uid, source: "agent", expectedRevision: knownRevisions.get(unit.unitId) });
      if (result.ok) unitResults.push({ unitId: unit.unitId, created: result.created, revision: result.data.revision });
      else {
        unitFailures += 1;
        unitResults.push({ unitId: unit.unitId, error: result.error, issues: "issues" in result ? result.issues : undefined });
      }
    }

    logger.info("[agent-knowledge-articles] upserted", {
      endpoint: `${ENDPOINT}:write`,
      uid: auth.uid,
      keyHash: auth.keyHash,
      postId: source.postId,
      revision: saved.data.revision,
      created: saved.created,
      units: built.units.length,
      unitFailures,
    });
    return json(
      { ok: unitFailures === 0, dryRun: false, applied: true, created: saved.created, data: saved.data, units: unitResults, unitFailures },
      unitFailures > 0 ? 207 : saved.created ? 201 : 200,
    );
  } catch (error) {
    const normalized = extractCodedError(error, { message: "Failed to write knowledge article" });
    logger.error("[agent-knowledge-articles] write failed", { endpoint: `${ENDPOINT}:write`, error: normalized.message, errorCode: normalized.errorCode });
    return json({ ok: false, error: normalized.message, errorCode: normalized.errorCode }, normalized.status);
  }
}

/** normalize·추출·사람 검토·Registry 연결이 판정 필드만 갱신하는 경로 — writer 제출분을 덮어쓰지 않는다. */
export async function PATCH(request: NextRequest) {
  try {
    const auth = validateAgentKey(request, { scope: "magazine:knowledge:write", allowWildcard: false, allowLegacyWildcard: true });
    if (!auth.valid) return json({ ok: false, error: auth.error, errorCode: "UNAUTHORIZED" }, 401);
    await enforceAgentRequestRateLimit({ uid: auth.uid, endpoint: `${ENDPOINT}:patch`, limitPerMinute: AGENT_CONTENT_POLICY.maxRequestsPerMinute, keyHash: auth.keyHash, failClosed: true });

    const body = (await request.json().catch(() => null)) as UnknownRecord | null;
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ ok: false, error: "invalid_payload", errorCode: "INVALID_INPUT" }, 400);
    const postId = Number(body.postId);
    if (!Number.isSafeInteger(postId) || postId < 1) return json({ ok: false, error: "invalid_post_id", errorCode: "INVALID_INPUT" }, 400);
    const expectedRevision = String(body.expectedRevision ?? "").trim();
    if (!expectedRevision) return json({ ok: false, error: "missing_expected_revision", errorCode: "INVALID_INPUT" }, 400);

    const result = await updateMagazineKnowledgeIntelligence({ postId }, {
      patch: body.intelligence,
      actor: auth.uid,
      source: "agent",
      expectedRevision,
    });
    if (!result.ok && result.error === "validation_failed") return json({ ok: false, error: result.error, issues: result.issues, errorCode: "INVALID_INPUT" }, 400);
    if (!result.ok && result.error === "article_not_found") return json({ ok: false, error: result.error, errorCode: "NOT_FOUND" }, 404);
    if (!result.ok && result.error === "conflict") return json({ ok: false, error: result.error, errorCode: "CONFLICT" }, 409);
    if (!result.ok) return json({ ok: false, error: "knowledge_store_unavailable", errorCode: "SERVICE_UNAVAILABLE" }, 503, true);
    return json({ ok: true, data: result.data });
  } catch (error) {
    const normalized = extractCodedError(error, { message: "Failed to update knowledge intelligence" });
    logger.error("[agent-knowledge-articles] patch failed", { endpoint: `${ENDPOINT}:patch`, error: normalized.message, errorCode: normalized.errorCode });
    return json({ ok: false, error: normalized.message, errorCode: normalized.errorCode }, normalized.status);
  }
}
