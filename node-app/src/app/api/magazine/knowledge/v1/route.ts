import { NextRequest, NextResponse } from "next/server";
import {
  decodeKnowledgeCursor,
  encodeKnowledgeCursor,
  knowledgeReadEnvelope,
  knowledgeReadError,
  knowledgeReadErrorStatus,
  newestUpdatedAt,
  parseKnowledgeReadLimit,
  toPublicKnowledgeArticleView,
  toPublicKnowledgeUnits,
  type KnowledgeReadErrorCode,
} from "libs/server-utils/magazine/magazineKnowledgeRead";
import {
  getMagazineKnowledgeArticle,
  listMagazineKnowledgeArticlePage,
  listMagazineKnowledgeUnits,
} from "libs/server-utils/magazine/magazineKnowledgeRepo";
import { logger } from "utils/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * @docHint
 * @purpose 서비스 공개 Knowledge 조회 — 승인된 기사·Knowledge Unit만 반환하는 read-only projection — MIR-203
 * @process 식별자·cursor 검증 -> 노출 자격 fail-closed 판정 -> 공개 projection -> envelope
 * @domain magazine-knowledge-corpus
 * @scope public-read-api
 *
 * 판정 필드·검토 메모·후보 Intelligence·Evidence 상세·Pattern/Proof 참조·내부 revision은 이 경로로 나가지 않는다.
 * 쓰기 경로는 없다. 적재·판정 갱신은 MIR-204의 agent/admin 라우트가 소유한다.
 */

const HEADERS = { "Cache-Control": "no-store, max-age=0" } as const;

function fail(code: KnowledgeReadErrorCode, message: string, field?: string) {
  return NextResponse.json(knowledgeReadError(code, message, field), { status: knowledgeReadErrorStatus(code), headers: HEADERS });
}

function identifierFrom(params: URLSearchParams) {
  const rawPostId = params.get("postId");
  const slug = String(params.get("slug") || "").trim();
  const contentId = String(params.get("contentId") || "").trim();
  if (rawPostId !== null) {
    const postId = Number(rawPostId);
    if (!Number.isSafeInteger(postId) || postId < 1) return null;
    return { postId };
  }
  if (contentId) return { contentId };
  if (slug) return { slug };
  return {};
}

export async function GET(request: NextRequest) {
  try {
    const params = new URL(request.url).searchParams;
    const identifier = identifierFrom(params);
    if (identifier === null) return fail("INVALID_INPUT", "postId가 올바르지 않습니다.", "postId");

    const parsedLimit = parseKnowledgeReadLimit(params.get("limit"));
    if (!parsedLimit.ok) return fail("INVALID_INPUT", "limit은 1 이상 50 이하의 정수여야 합니다.", "limit");

    // 단건 조회 — 자격 미달이면 404다. "있지만 비공개"를 구분해 알려주지 않는다.
    if (Object.keys(identifier).length > 0) {
      const found = await getMagazineKnowledgeArticle(identifier);
      if (!found.ok) {
        if (found.error === "not_found") return fail("NOT_FOUND", "공개된 Knowledge 기사를 찾을 수 없습니다.");
        return fail("SERVICE_UNAVAILABLE", "Knowledge 저장소를 사용할 수 없습니다.");
      }
      const view = toPublicKnowledgeArticleView({ article: found.data.article, updatedAt: found.data.updatedAt });
      if (!view) return fail("NOT_FOUND", "공개된 Knowledge 기사를 찾을 수 없습니다.");

      const units = await listMagazineKnowledgeUnits({
        contentId: found.data.article.contentId,
        sourceRevision: found.data.article.sourceRevision,
      });
      if (!units.ok) return fail("SERVICE_UNAVAILABLE", "Knowledge 저장소를 사용할 수 없습니다.");
      const publicUnits = toPublicKnowledgeUnits(found.data.article, units.data.map((item) => item.unit));

      return NextResponse.json(
        knowledgeReadEnvelope(
          { article: view.article, units: publicUnits },
          { updatedAt: newestUpdatedAt([view.updatedAt, ...units.data.map((item) => item.updatedAt)]) },
        ),
        { headers: HEADERS },
      );
    }

    const rawCursor = params.get("cursor");
    let cursor = null as { updatedAt: string; contentId: string } | null;
    if (rawCursor !== null && rawCursor.trim() !== "") {
      cursor = decodeKnowledgeCursor(rawCursor);
      if (!cursor) return fail("INVALID_CURSOR", "cursor를 해석할 수 없습니다. 첫 페이지부터 다시 요청하세요.", "cursor");
    }

    const page = await listMagazineKnowledgeArticlePage({
      topic: params.get("topic") || undefined,
      entity: params.get("entity") || undefined,
      limit: parsedLimit.limit,
      cursor,
      publicOnly: true,
    });
    if (!page.ok) return fail("SERVICE_UNAVAILABLE", "Knowledge 저장소를 사용할 수 없습니다.");

    // 저장소 질의로 이미 좁혔지만 노출 판정을 코드에서 한 번 더 건다 — 필터 누락이 곧 공개 사고가 되지 않게 한다.
    const views = page.data.items
      .map((item) => toPublicKnowledgeArticleView({ article: item.article, updatedAt: item.updatedAt }))
      .filter((item): item is NonNullable<typeof item> => Boolean(item));

    return NextResponse.json(
      knowledgeReadEnvelope(
        { articles: views.map((item) => item.article) },
        {
          updatedAt: newestUpdatedAt(views.map((item) => item.updatedAt)),
          page: {
            limit: parsedLimit.limit,
            hasMore: page.data.hasMore,
            nextCursor: page.data.nextCursor ? encodeKnowledgeCursor(page.data.nextCursor) : null,
          },
        },
      ),
      { headers: HEADERS },
    );
  } catch (error) {
    logger.error("[magazine-knowledge-read] public read failed", { error: error instanceof Error ? error.message : "unknown" });
    return fail("SERVICE_UNAVAILABLE", "Knowledge 조회에 실패했습니다.");
  }
}
