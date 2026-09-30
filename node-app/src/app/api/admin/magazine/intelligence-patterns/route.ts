import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import {
  findIntelligencePatternCandidates,
  getIntelligencePattern,
  listIntelligencePatternPage,
  upsertIntelligencePattern,
} from "libs/server-utils/magazine/magazineIntelligencePatternRepo";
import {
  decodePatternReadCursor,
  encodePatternReadCursor,
  newestPatternUpdatedAt,
  parsePatternReadLimit,
  patternReadEnvelope,
  patternReadError,
  patternReadErrorStatus,
} from "libs/server-utils/magazine/magazineIntelligencePatternRead";

export const runtime = "nodejs";

/**
 * @docHint
 * @purpose 관리자 전용 Pattern Registry 검토·저장 API — AIR-800
 * @process admin auth -> candidate/list/detail -> human-owned CAS upsert
 * @domain intelligence-pattern-registry
 * @scope admin-api
 */

function headers(retryable = false) {
  return { "Cache-Control": "no-store, max-age=0", ...(retryable ? { "Retry-After": "30" } : {}) };
}

async function getHandler(_body: unknown, _user: AuthenticatedUserType, request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const limit = parsePatternReadLimit(params.get("limit"));
  if (!limit.ok) return NextResponse.json(patternReadError("INVALID_INPUT", "limit은 1 이상 50 이하의 정수여야 합니다.", "limit"), { status: 400, headers: headers() });

  const patternId = String(params.get("patternId") || "").trim();
  if (patternId) {
    const result = await getIntelligencePattern(patternId);
    if (!result.ok) {
      const code = result.error === "not_found" ? "NOT_FOUND" as const : "SERVICE_UNAVAILABLE" as const;
      return NextResponse.json(patternReadError(code, code === "NOT_FOUND" ? "Pattern을 찾을 수 없습니다." : "Pattern Registry를 사용할 수 없습니다."), { status: patternReadErrorStatus(code), headers: headers(code === "SERVICE_UNAVAILABLE") });
    }
    const revisions = [...new Set(result.data.pattern.articleLinks.filter((link) => link.linkStatus === "current").map((link) => link.articleRevision))];
    return NextResponse.json(patternReadEnvelope(result.data, { articleRevision: revisions.length === 1 ? revisions[0] : null, updatedAt: result.data.updatedAt }), { headers: headers() });
  }

  const name = String(params.get("name") || "").trim();
  if (name) {
    const result = await findIntelligencePatternCandidates(name, limit.limit);
    if (!result.ok) return NextResponse.json(patternReadError("SERVICE_UNAVAILABLE", "Pattern Registry를 사용할 수 없습니다."), { status: 503, headers: headers(true) });
    return NextResponse.json(patternReadEnvelope(result.data, { updatedAt: newestPatternUpdatedAt(result.data.map((item) => item.pattern.pattern.lastReviewed)) }), { headers: headers() });
  }

  let cursor = null as { updatedAt: string; patternId: string } | null;
  const rawCursor = params.get("cursor");
  if (rawCursor) {
    cursor = decodePatternReadCursor(rawCursor);
    if (!cursor) return NextResponse.json(patternReadError("INVALID_CURSOR", "cursor를 해석할 수 없습니다. 첫 페이지부터 다시 요청하세요.", "cursor"), { status: 400, headers: headers() });
  }
  const result = await listIntelligencePatternPage({ limit: limit.limit, cursor, recommendedOnly: params.get("recommendedOnly") === "true" });
  if (!result.ok) return NextResponse.json(patternReadError("SERVICE_UNAVAILABLE", "Pattern Registry를 사용할 수 없습니다."), { status: 503, headers: headers(true) });
  return NextResponse.json(patternReadEnvelope(result.data.items, {
    updatedAt: newestPatternUpdatedAt(result.data.items.map((item) => item.updatedAt)),
    page: { limit: limit.limit, hasMore: result.data.hasMore, nextCursor: result.data.nextCursor ? encodePatternReadCursor(result.data.nextCursor) : null },
  }), { headers: headers() });
}

export const GET = withAuth(getHandler, undefined, "admin/magazine/intelligence-patterns:list", { requireAdmin: true, bodyParser: "none" });

async function writeHandler(body: unknown, user: AuthenticatedUserType) {
  const payload = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
  if (payload.expectedRevision !== undefined && typeof payload.expectedRevision !== "string") {
    return NextResponse.json({ ok: false, error: "invalid_expected_revision", errorCode: "INVALID_INPUT" }, { status: 400, headers: headers() });
  }
  const record = (user || {}) as { ID?: unknown; uid?: unknown };
  const actor = String(record.ID ?? record.uid ?? "").trim() || "unknown";
  const expectedRevision = typeof payload.expectedRevision === "string" ? payload.expectedRevision.trim() || undefined : undefined;
  const result = await upsertIntelligencePattern(payload.pattern ?? body, { actor, expectedRevision });
  if (!result.ok && result.error === "validation_failed") return NextResponse.json({ ok: false, error: result.error, errorCode: "INVALID_INPUT", issues: result.issues }, { status: 400, headers: headers() });
  if (!result.ok && result.error === "duplicate_candidate") return NextResponse.json({ ok: false, error: result.error, errorCode: "CONFLICT", message: "canonical name 또는 alias가 기존 Pattern과 겹칩니다." }, { status: 409, headers: headers() });
  if (!result.ok && result.error === "conflict") return NextResponse.json({ ok: false, error: result.error, errorCode: "CONFLICT", message: "최신 Pattern을 다시 읽은 뒤 expectedRevision과 함께 재시도하세요." }, { status: 409, headers: headers() });
  if (!result.ok) return NextResponse.json({ ok: false, error: "pattern_registry_unavailable", errorCode: "SERVICE_UNAVAILABLE" }, { status: 503, headers: headers(true) });
  return NextResponse.json({ ok: true, created: result.created, data: result.data }, { status: result.created ? 201 : 200, headers: headers() });
}

export const POST = withAuth(writeHandler, undefined, "admin/magazine/intelligence-patterns:write", { requireAdmin: true });
export const PATCH = withAuth(writeHandler, undefined, "admin/magazine/intelligence-patterns:patch", { requireAdmin: true });
