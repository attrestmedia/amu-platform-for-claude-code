import { NextRequest, NextResponse } from "next/server";
import {
  STOCK_IMAGE_SEARCH_PROVIDERS,
  searchStockImages,
  type StockImageSearchProvider,
} from "libs/server-utils/api/imageSearchService";
import { withGuestOrAuth } from "libs/server-utils/api/apiMiddleware";

/**
 * @docHint
 * @purpose 공개 이미지 검색 도구용 서버 프록시
 * @process 사용자/게스트 인증과 rate-limit → 입력 검증 → 서버 자격증명으로 provider 검색 → 정규화 응답
 * @domain stock-image
 * @scope public-api
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function parseProviders(raw: string | null): StockImageSearchProvider[] | null {
  const requested = String(raw || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const providers = requested.length ? Array.from(new Set(requested)) : [...STOCK_IMAGE_SEARCH_PROVIDERS];
  if (providers.some((provider) => !STOCK_IMAGE_SEARCH_PROVIDERS.includes(provider as StockImageSearchProvider))) {
    return null;
  }
  return providers as StockImageSearchProvider[];
}

export const GET = withGuestOrAuth(
  async (_data, _user, request: NextRequest) => {
    const params = request.nextUrl.searchParams;
    const query = String(params.get("q") || "").trim();
    const providers = parseProviders(params.get("providers"));
    const rawCount = Number(params.get("count") || 2);
    const count = Number.isFinite(rawCount) ? Math.max(1, Math.min(10, Math.floor(rawCount))) : 2;
    const random = params.get("random") !== "false";

    if (!query || query.length > 160 || !providers?.length) {
      return NextResponse.json(
        { success: false, error: "검색어 또는 provider가 올바르지 않습니다.", errorCode: "INVALID_INPUT" },
        { status: 400 },
      );
    }

    const result = await searchStockImages({ query, providers, count, random });
    return NextResponse.json({
      success: true,
      data: result.items,
      errors: result.errors,
    });
  },
  undefined,
  "apps/image-search",
  { bodyParser: "none", allowGuest: true },
);
