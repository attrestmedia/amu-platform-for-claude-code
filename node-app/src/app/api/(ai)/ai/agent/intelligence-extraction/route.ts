import { NextRequest, NextResponse } from "next/server";
import { validateAgentKey } from "libs/server-utils/auth/agentKeyAuth";
import { AGENT_CONTENT_POLICY, enforceAgentRequestRateLimit } from "libs/server-utils/auth/agentRateLimit";
import { extractIntelligencePatternCandidates } from "libs/server-utils/magazine/magazineIntelligenceExtraction";
import { getMagazineKnowledgeArticle } from "libs/server-utils/magazine/magazineKnowledgeRepo";
import { extractCodedError, type UnknownRecord } from "utils/common";
import { logger } from "utils/log";

export const runtime = "nodejs";

/**
 * @docHint
 * @purpose writer-isolated 완료 기사에서 Pattern 후보를 dry-run 추출하는 agent API — AIR-801
 * @process scoped agent auth -> 기사 projection/revision 조회 -> gate 검증 -> 후보·근거 projection 반환
 * @domain intelligence-pattern-registry
 * @scope agent-api
 */

const ENDPOINT = "ai/agent/intelligence-extraction";

function json(body: UnknownRecord, status = 200, retryable = false) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0", ...(retryable ? { "Retry-After": "30" } : {}) },
  });
}

function identifierFrom(body: UnknownRecord) {
  const contentId = String(body.contentId ?? "").trim();
  if (contentId) return { contentId };
  const postId = Number(body.postId);
  if (Number.isSafeInteger(postId) && postId > 0) return { postId };
  return null;
}

function resultStatus(error: string) {
  if (error === "stale_revision") return 409;
  if (error === "article_not_ready" || error === "scope_review_required") return 422;
  return 400;
}

export async function POST(request: NextRequest) {
  try {
    const auth = validateAgentKey(request, { scope: "magazine:knowledge:read", allowWildcard: false, allowLegacyWildcard: true });
    if (!auth.valid) return json({ ok: false, error: auth.error, errorCode: "UNAUTHORIZED" }, 401);
    await enforceAgentRequestRateLimit({
      uid: auth.uid,
      endpoint: ENDPOINT,
      limitPerMinute: AGENT_CONTENT_POLICY.maxReadRequestsPerMinute,
      keyHash: auth.keyHash,
      failClosed: true,
    });

    const body = (await request.json().catch(() => null)) as UnknownRecord | null;
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ ok: false, error: "invalid_payload", errorCode: "INVALID_INPUT" }, 400);
    const identifier = identifierFrom(body);
    if (!identifier) return json({ ok: false, error: "missing_identifier", errorCode: "INVALID_INPUT" }, 400);
    const articleRevision = String(body.articleRevision ?? "").trim();
    if (!articleRevision) return json({ ok: false, error: "missing_article_revision", errorCode: "INVALID_INPUT" }, 400);

    const article = await getMagazineKnowledgeArticle(identifier);
    if (!article.ok) {
      const notFound = article.error === "not_found";
      return json({ ok: false, error: article.error, errorCode: notFound ? "NOT_FOUND" : "SERVICE_UNAVAILABLE" }, notFound ? 404 : 503, !notFound);
    }

    const result = extractIntelligencePatternCandidates({
      article: article.data.article,
      articleRevision,
      currentArticleRevision: article.data.revision,
      handoff: body.handoff,
    });
    if (!result.ok) return json({ ok: false, error: result.error, issues: result.issues, errorCode: result.error === "stale_revision" ? "CONFLICT" : "INVALID_INPUT" }, resultStatus(result.error));

    logger.info("[agent-intelligence-extraction] dry-run completed", {
      endpoint: ENDPOINT,
      uid: auth.uid,
      keyHash: auth.keyHash,
      contentId: article.data.article.contentId,
      articleRevision,
      candidateCount: result.data.candidates.length,
    });
    return json({ ok: true, dryRun: true, applied: false, data: result.data });
  } catch (error) {
    const normalized = extractCodedError(error, { message: "Failed to extract intelligence patterns" });
    logger.error("[agent-intelligence-extraction] failed", { endpoint: ENDPOINT, error: normalized.message, errorCode: normalized.errorCode });
    return json({ ok: false, error: normalized.message, errorCode: normalized.errorCode }, normalized.status);
  }
}
