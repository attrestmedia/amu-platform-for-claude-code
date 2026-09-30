import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import {
  getMagazineKnowledgeArticle,
  listMagazineKnowledgeArticlePage,
  listMagazineKnowledgeUnits,
  updateMagazineKnowledgeIntelligence,
} from "libs/server-utils/magazine/magazineKnowledgeRepo";
import {
  decodeKnowledgeCursor,
  encodeKnowledgeCursor,
  knowledgeReadEnvelope,
  knowledgeReadError,
  knowledgeReadErrorStatus,
  newestUpdatedAt,
  parseKnowledgeReadLimit,
} from "libs/server-utils/magazine/magazineKnowledgeRead";
import { getMagazineRenewalByPostId } from "libs/server-utils/magazine/magazineRenewalRepo";

export const runtime = "nodejs";

/**
 * @docHint
 * @purpose 관리자용 Knowledge Corpus 조회와 판정 필드 갱신 API — 조회 계약 MIR-203 · 판정 갱신 MIR-204
 * @process 관리자 인증 -> 기사·Knowledge Unit·리뉴얼 이력 조회(envelope·cursor) -> intelligence 판정 갱신(revision CAS)
 * @domain magazine-knowledge-corpus
 * @scope admin-api
 */

function headers(retryable = false) {
  return { "Cache-Control": "no-store, max-age=0", ...(retryable ? { "Retry-After": "30" } : {}) };
}

function queryIdentifier(request: NextRequest) {
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

/**
 * 관리자 조회 — 기사·Knowledge Unit·리뉴얼 이력을 하나의 envelope로 돌려준다 (MIR-203).
 * 공개 경로와 달리 미승인 후보와 판정 필드를 포함하며, 그래서 `requireAdmin`이 유일한 게이트다.
 */
async function getHandler(_body: unknown, _user: AuthenticatedUserType, request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const identifier = queryIdentifier(request);
  if (identifier === null) {
    return NextResponse.json(knowledgeReadError("INVALID_INPUT", "postId가 올바르지 않습니다.", "postId"), { status: 400, headers: headers() });
  }
  const parsedLimit = parseKnowledgeReadLimit(params.get("limit"));
  if (!parsedLimit.ok) {
    return NextResponse.json(knowledgeReadError("INVALID_INPUT", "limit은 1 이상 50 이하의 정수여야 합니다.", "limit"), { status: 400, headers: headers() });
  }

  if (Object.keys(identifier).length === 0) {
    let cursor = null as { updatedAt: string; contentId: string } | null;
    const rawCursor = params.get("cursor");
    if (rawCursor !== null && rawCursor.trim() !== "") {
      cursor = decodeKnowledgeCursor(rawCursor);
      if (!cursor) {
        return NextResponse.json(knowledgeReadError("INVALID_CURSOR", "cursor를 해석할 수 없습니다. 첫 페이지부터 다시 요청하세요.", "cursor"), { status: 400, headers: headers() });
      }
    }
    const page = await listMagazineKnowledgeArticlePage({
      topic: params.get("topic") || undefined,
      entity: params.get("entity") || undefined,
      limit: parsedLimit.limit,
      cursor,
    });
    if (!page.ok) {
      const code = "SERVICE_UNAVAILABLE" as const;
      return NextResponse.json(knowledgeReadError(code, "Knowledge 저장소를 사용할 수 없습니다."), { status: knowledgeReadErrorStatus(code), headers: headers(true) });
    }
    return NextResponse.json(
      knowledgeReadEnvelope(page.data.items, {
        updatedAt: newestUpdatedAt(page.data.items.map((item) => item.updatedAt)),
        page: {
          limit: parsedLimit.limit,
          hasMore: page.data.hasMore,
          nextCursor: page.data.nextCursor ? encodeKnowledgeCursor(page.data.nextCursor) : null,
        },
      }),
      { headers: headers() },
    );
  }

  const result = await getMagazineKnowledgeArticle(identifier);
  if (!result.ok) {
    const notFound = result.error === "not_found";
    const code = notFound ? ("NOT_FOUND" as const) : ("SERVICE_UNAVAILABLE" as const);
    const message = notFound ? "Knowledge 기사를 찾을 수 없습니다." : "Knowledge 저장소를 사용할 수 없습니다.";
    return NextResponse.json(knowledgeReadError(code, message), { status: knowledgeReadErrorStatus(code), headers: headers(!notFound) });
  }

  const units = await listMagazineKnowledgeUnits({ contentId: result.data.article.contentId });
  const unitItems = units.ok ? units.data : [];
  // 리뉴얼로 원문이 바뀌면 옛 revision의 unit이 남는다. 관리자에게는 감추지 않고 stale로 표시해 넘긴다.
  const staleUnitIds = unitItems
    .filter((item) => item.unit.sourceRevision.trim() !== result.data.article.sourceRevision.trim())
    .map((item) => item.unit.unitId);

  const includeRenewal = params.get("includeRenewal") === "true";
  const renewal = includeRenewal ? await getMagazineRenewalByPostId(result.data.article.source.postId) : null;

  return NextResponse.json(
    knowledgeReadEnvelope(
      {
        ...result.data,
        units: unitItems,
        staleUnitIds,
        ...(includeRenewal ? { renewal: renewal && renewal.ok ? renewal.data : null } : {}),
      },
      { updatedAt: newestUpdatedAt([result.data.updatedAt, ...unitItems.map((item) => item.updatedAt)]) },
    ),
    { headers: headers() },
  );
}

export const GET = withAuth(getHandler, undefined, "admin/magazine-knowledge-articles:list", { requireAdmin: true, bodyParser: "none" });

/**
 * 관리자 검토 결과 반영 — `reviewStatus`·`eligibility`·Pattern/Proof 연결 등 판정 필드만 갱신한다.
 * 기사 본문 계약과 writer 제출 근거는 이 경로로 바뀌지 않는다.
 */
async function patchHandler(body: unknown, user: AuthenticatedUserType) {
  const payload = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
  const postId = Number(payload.postId);
  if (!Number.isSafeInteger(postId) || postId < 1) {
    return NextResponse.json({ ok: false, error: "invalid_post_id" }, { status: 400, headers: headers() });
  }
  const expectedRevision = String(payload.expectedRevision ?? "").trim();
  if (!expectedRevision) {
    return NextResponse.json({ ok: false, error: "missing_expected_revision" }, { status: 400, headers: headers() });
  }
  const record = (user || {}) as { ID?: unknown; uid?: unknown };
  const actor = String(record.ID ?? record.uid ?? "").trim() || "unknown";

  const result = await updateMagazineKnowledgeIntelligence({ postId }, {
    patch: payload.intelligence,
    actor,
    source: "admin",
    expectedRevision,
  });
  if (!result.ok && result.error === "validation_failed") {
    return NextResponse.json({ ok: false, error: result.error, issues: result.issues }, { status: 400, headers: headers() });
  }
  if (!result.ok && result.error === "article_not_found") {
    return NextResponse.json({ ok: false, error: result.error }, { status: 404, headers: headers() });
  }
  if (!result.ok && result.error === "conflict") {
    return NextResponse.json({ ok: false, error: "conflict", message: "최신 기사를 다시 읽은 뒤 expectedRevision과 함께 재시도하세요." }, { status: 409, headers: headers() });
  }
  if (!result.ok) return NextResponse.json({ ok: false, error: "knowledge_store_unavailable" }, { status: 503, headers: headers(true) });
  return NextResponse.json({ ok: true, data: result.data }, { headers: headers() });
}

export const PATCH = withAuth(patchHandler, undefined, "admin/magazine-knowledge-articles:patch", { requireAdmin: true });
