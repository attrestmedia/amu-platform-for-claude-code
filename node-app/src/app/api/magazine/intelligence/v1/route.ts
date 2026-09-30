import { NextRequest, NextResponse } from "next/server";
import {
  getPublicIntelligencePattern,
  listPublicIntelligencePatternPage,
} from "libs/server-utils/magazine/magazineIntelligencePatternRepo";
import {
  decodePatternReadCursor,
  encodePatternReadCursor,
  INTELLIGENCE_PATTERN_MARKETING_OOPS_CONSUMER_VERSION,
  parsePatternReadLimit,
  patternReadEnvelope,
  patternReadError,
  patternReadErrorStatus,
  type IntelligencePatternReadConsumer,
} from "libs/server-utils/magazine/magazineIntelligencePatternRead";
import { INTELLIGENCE_PATTERN_ID_PREFIX } from "libs/server-utils/magazine/magazineIntelligencePatternContract";
import { logger } from "utils/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * @docHint
 * @purpose public/Marketing Oops가 소비하는 Intelligence Pattern read-only API — AIR-802
 * @process identifier/cursor/context 검증 -> active/current/reviewDueAt 및 Knowledge revision 대조 -> public projection
 * @domain intelligence-pattern-registry
 * @scope public-read-api
 *
 * candidate·emerging·weakening·deprecated·stale/context 불일치 Pattern은 404 또는 목록 0건이다.
 * 쓰기·후보 검색·내부 review·owner·inputRevision·비공개 Evidence는 이 경로에 없다.
 */

const HEADERS = { "Cache-Control": "no-store, max-age=0" } as const;

function fail(code: Parameters<typeof patternReadError>[0], message: string, field?: string, retryable = false) {
  return NextResponse.json(patternReadError(code, message, field), {
    status: patternReadErrorStatus(code),
    headers: { ...HEADERS, ...(retryable ? { "Retry-After": "30" } : {}) },
  });
}

function consumerOf(params: URLSearchParams): IntelligencePatternReadConsumer | null {
  const value = String(params.get("consumer") || "").trim();
  if (!value) return "public";
  if (value === INTELLIGENCE_PATTERN_MARKETING_OOPS_CONSUMER_VERSION) return value;
  return null;
}

function contextOf(params: URLSearchParams): string | undefined | null {
  const value = String(params.get("context") || "").trim();
  if (!value) return undefined;
  if (value.length > 400 || value.includes("<") || value.includes(">") || value.split("").some((item) => item.charCodeAt(0) < 32)) return null;
  return value;
}

function patternIdOf(params: URLSearchParams): string | undefined | null {
  const value = String(params.get("patternId") || "").trim();
  if (!value) return undefined;
  if (value.length > 160 || !value.startsWith(INTELLIGENCE_PATTERN_ID_PREFIX)) return null;
  return value;
}

export async function GET(request: NextRequest) {
  try {
    const params = new URL(request.url).searchParams;
    const consumer = consumerOf(params);
    if (!consumer) return fail("INVALID_INPUT", "지원하지 않는 consumer contract입니다.", "consumer");
    const context = contextOf(params);
    if (context === null) return fail("INVALID_INPUT", "context 형식이 올바르지 않습니다.", "context");
    const patternId = patternIdOf(params);
    if (patternId === null) return fail("INVALID_INPUT", "patternId 형식이 올바르지 않습니다.", "patternId");

    const limit = parsePatternReadLimit(params.get("limit"));
    if (!limit.ok) return fail("INVALID_INPUT", "limit은 1 이상 50 이하의 정수여야 합니다.", "limit");

    if (patternId) {
      const result = await getPublicIntelligencePattern(patternId, context);
      if (!result.ok) {
        if (result.error === "not_found") return fail("NOT_FOUND", "공개된 Intelligence Pattern을 찾을 수 없습니다.");
        return fail("SERVICE_UNAVAILABLE", "Intelligence Pattern 저장소를 사용할 수 없습니다.", undefined, true);
      }
      return NextResponse.json(
        patternReadEnvelope(result.data.pattern, {
          consumer,
          articleRevision: result.data.articleRevision,
          updatedAt: result.data.updatedAt,
        }),
        { headers: HEADERS },
      );
    }

    const rawCursor = params.get("cursor");
    let cursor = null as { updatedAt: string; patternId: string } | null;
    if (rawCursor !== null && rawCursor.trim() !== "") {
      cursor = decodePatternReadCursor(rawCursor);
      if (!cursor) return fail("INVALID_CURSOR", "cursor를 해석할 수 없습니다. 첫 페이지부터 다시 요청하세요.", "cursor");
    }

    const result = await listPublicIntelligencePatternPage({ limit: limit.limit, cursor, context });
    if (!result.ok) return fail("SERVICE_UNAVAILABLE", "Intelligence Pattern 저장소를 사용할 수 없습니다.", undefined, true);
    return NextResponse.json(
      patternReadEnvelope(
        { patterns: result.data.items },
        {
          consumer,
          updatedAt: result.data.updatedAt,
          page: {
            limit: limit.limit,
            hasMore: result.data.hasMore,
            nextCursor: result.data.nextCursor ? encodePatternReadCursor(result.data.nextCursor) : null,
          },
        },
      ),
      { headers: HEADERS },
    );
  } catch (error) {
    logger.error("[intelligence-pattern-read] public read failed", { error: error instanceof Error ? error.message : "unknown" });
    return fail("SERVICE_UNAVAILABLE", "Intelligence Pattern 조회에 실패했습니다.", undefined, true);
  }
}
