import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { getNaverDraftConnector } from "libs/server-utils/commerce/naverDraftConnector";
import { redisCache } from "libs/cache/redisCacheService";
import type { INaverCategory } from "types/thirdparty/naver";
import { logger } from "utils/log";
import { toErrorMessage } from "utils/common";

/**
 * @docHint
 * @purpose API 라우트(universe / [universeId] / commerce / naver-categories) 기능 요청 처리
 * @process 인증/권한 검증  네이버 전체 카테고리 조회(redis 캐시)  이름 검색 필터링  JSON 응답 반환
 * @domain commerce.naver
 * @scope universe
 *
 * 카테고리 번호를 판매자가 외우지 않아도 되도록 이름 검색으로 leaf 카테고리를 찾아주는
 * "카테고리 검색 선택기"용 라우트다. 전체 카테고리 트리는 변경이 드물므로 redis에 캐시한다.
 */

function toSafeString(value: unknown) {
  return value == null ? "" : String(value).trim();
}

const CACHE_KEY_PREFIX = "naver:categories:";
const CACHE_TTL_SECONDS = 24 * 60 * 60;
const SEARCH_LIMIT = 20;

function pickCategoryArray(payload: unknown): INaverCategory[] {
  if (Array.isArray(payload)) return payload as INaverCategory[];
  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  for (const key of ["categories", "contents", "content", "items", "data"]) {
    if (Array.isArray(record[key])) return record[key] as INaverCategory[];
  }
  return [];
}

async function loadCategories(universeId: string) {
  const cacheKey = `${CACHE_KEY_PREFIX}${universeId}`;
  const cached = await redisCache.get<INaverCategory[]>(cacheKey);
  if (Array.isArray(cached) && cached.length > 0) return cached;

  const { client } = await getNaverDraftConnector(universeId);
  const response = await client.getAllCategories();
  const categories = pickCategoryArray(response).filter((category) => toSafeString(category?.id));
  if (categories.length === 0) {
    throw new Error("naver_category_list_empty");
  }

  await redisCache.set(cacheKey, categories, CACHE_TTL_SECONDS);
  return categories;
}

export const GET = withAuth(
  async (data, user, request, context) => {
    try {
      const { universeId } = context.params as { universeId: string };
      const query = toSafeString(new URL(request.url).searchParams.get("q")).toLowerCase();
      if (!query) {
        return NextResponse.json({ success: true, data: { categories: [] } });
      }

      const categories = await loadCategories(universeId);
      const leafCategories = categories.filter((category) => category.last === true);
      const pool = leafCategories.length > 0 ? leafCategories : categories;

      const matched = pool
        .filter((category) => {
          const name = toSafeString(category.name).toLowerCase();
          const wholeName = toSafeString(category.wholeCategoryName).toLowerCase();
          return name.includes(query) || wholeName.includes(query);
        })
        .sort((a, b) => {
          // 경로가 짧은(폭 넓은) 카테고리를 먼저 노출
          const lengthDiff = toSafeString(a.wholeCategoryName).length - toSafeString(b.wholeCategoryName).length;
          if (lengthDiff !== 0) return lengthDiff;
          return toSafeString(a.name).localeCompare(toSafeString(b.name));
        })
        .slice(0, SEARCH_LIMIT)
        .map((category) => ({
          id: toSafeString(category.id),
          name: toSafeString(category.name),
          wholeCategoryName: toSafeString(category.wholeCategoryName),
        }));

      logger.info("네이버 카테고리 검색", {
        userId: user.ID,
        universeId,
        query,
        totalCategories: categories.length,
        matched: matched.length,
      });

      return NextResponse.json({
        success: true,
        data: {
          categories: matched,
        },
      });
    } catch (error) {
      logger.error("네이버 카테고리 검색 실패:", error);
      return NextResponse.json(
        { success: false, message: toErrorMessage(error, "카테고리 검색 중 오류가 발생했습니다.") },
        { status: 500 },
      );
    }
  },
  undefined,
  "universe_commerce_naver_categories",
  {
    checkUniversePermission: {
      universeIdParam: "universeId",
      requireEdit: true,
    },
  },
);
