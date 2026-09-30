import { NextRequest, NextResponse } from "next/server";
import wpCacheService from "libs/services/wpCacheService";
import { logger } from "utils/log";
import CacheKeyManager from "libs/cache/cacheKeyManager";
import { toErrorMessage } from "utils/common";

/**
 * @docHint
 * @purpose API 라우트(thirdparty / wp / cached / [endpoint]) 기능 요청 처리
 * @process GET / POST 요청 파싱  입력 검증  핵심 처리  JSON 응답 반환
 * @domain content.wp.cache
 * @scope public_api
 */

// WP API 캐시 처리 통합 라우트 핸들러
export async function GET(req: NextRequest, { params }: { params: Promise<{ endpoint: string }> }) {
  const endpoint = (await params).endpoint;
  const { searchParams } = new URL(req.url);
  const forceRefresh = searchParams.get("refresh") === "true";
  const startTime = Date.now();

  try {
    // 성능 메트릭
    const duration = Date.now() - startTime;

    // 엔드포인트별 처리
    switch (endpoint) {
      /** posts 처리 부분 */

      case "random":
        const randomCount = validateCount(searchParams.get("count"), 1, 20);
        const randomCategoryId = validateCategoryId(searchParams.get("category"));

        const randomPosts = await wpCacheService.getRandomPosts({
          count: randomCount,
          categoryId: randomCategoryId,
          forceRefresh,
        });

        return NextResponse.json(randomPosts, {
          status: 200,
          headers: {
            "Cache-Control": forceRefresh ? "no-cache, must-revalidate" : "s-maxage=300, stale-while-revalidate=600", // 5분 캐시, 10분 stale
            "X-Response-Time": `${duration}ms`,
            "X-Cache-Source": "wp-cache-service",
            "X-Total-Count": randomPosts.length.toString(),
            Vary: "Accept-Encoding", // 압축 지원
          },
        });

      case "latest":
        const latestCount = parseInt(searchParams.get("count") || "10");
        const latestCategoryId = searchParams.get("category") ? parseInt(searchParams.get("category")!) : undefined;

        const latestPosts = await wpCacheService.getLatestPosts({
          count: latestCount,
          categoryId: latestCategoryId,
          forceRefresh,
        });

        return NextResponse.json(latestPosts, {
          status: 200,
          headers: {
            "Cache-Control": "s-maxage=900, stale-while-revalidate", // 15분 캐시
            "X-Response-Time": `${duration}ms`,
          },
        });

      case "search":
        const searchQuery = searchParams.get("q");

        // 검색어 디버깅 로그
        logger.log("🔍 API 라우트 검색어 분석:", {
          rawQuery: searchQuery,
          decodedQuery: searchQuery ? decodeURIComponent(searchQuery) : null,
          length: searchQuery?.length || 0,
          charCodes: searchQuery ? [...searchQuery].map((char) => char.charCodeAt(0)) : [],
        });

        if (!searchQuery || searchQuery.length < 2) {
          return NextResponse.json({ message: "검색어는 최소 2글자 이상이어야 합니다." }, { status: 400 });
        }

        if (searchQuery.length > 200) {
          return NextResponse.json({ message: "검색어는 200글자를 초과할 수 없습니다." }, { status: 400 });
        }

        const { page: searchPage, perPage: searchPerPage } = validatePagination(
          searchParams.get("page"),
          searchParams.get("per_page"),
        );
        const searchCategoryId = validateCategoryId(searchParams.get("category"));

        try {
          // 텍스트 인덱스 확인 및 생성
          await wpCacheService.ensureTextIndex();

          const searchResult = await wpCacheService.searchPosts({
            query: searchQuery,
            page: searchPage,
            perPage: searchPerPage,
            categoryId: searchCategoryId,
            forceRefresh,
          });

          const searchTTL = CacheKeyManager.ttl.wp.dynamic.searchResults(searchResult.totalCount);

          return NextResponse.json(searchResult, {
            status: 200,
            headers: {
              "Cache-Control": `s-maxage=${searchTTL}, stale-while-revalidate=${searchTTL * 2}`,
              "X-Response-Time": `${duration}ms`,
              "X-Total-Count": searchResult.totalCount.toString(),
              "X-Total-Pages": searchResult.totalPages.toString(),
              "X-Cache-TTL": searchTTL.toString(),
              "X-Search-Query": Buffer.from(searchQuery).toString("base64"),
            },
          });
        } catch (error) {
          logger.error("검색 처리 중 오류:", error);

          // 구체적인 에러 메시지 반환
          return NextResponse.json(
            {
              message: toErrorMessage(error, "검색 중 오류가 발생했습니다."),
              query: searchQuery,
              timestamp: new Date().toISOString(),
            },
            { status: 500 },
          );
        }

      case "detail":
        const postIdStr = searchParams.get("id");
        const slug = searchParams.get("slug")?.trim() || undefined;

        let postId: number | undefined;

        if (postIdStr) {
          postId = parseInt(postIdStr);
          if (isNaN(postId) || postId < 1) {
            return NextResponse.json({ message: "유효한 포스트 ID를 제공해주세요." }, { status: 400 });
          }
        }

        if (!postId && !slug) {
          return NextResponse.json({ message: "포스트 ID 또는 슬러그를 제공해주세요." }, { status: 400 });
        }

        const postDetail = await wpCacheService.getPostDetail({
          postId,
          slug,
          forceRefresh,
        });

        if (!postDetail) {
          return NextResponse.json({ message: "포스트를 찾을 수 없습니다." }, { status: 404 });
        }

        return NextResponse.json(postDetail, {
          status: 200,
          headers: {
            "Cache-Control": "s-maxage=3600, stale-while-revalidate",
            "X-Response-Time": `${duration}ms`,
            "Last-Modified": new Date(postDetail.modified).toUTCString(),
          },
        });

      case "posts":
        const { page, perPage } = validatePagination(searchParams.get("page"), searchParams.get("per_page"));

        const categoriesStr = searchParams.get("categories");
        let categories;

        if (categoriesStr) {
          try {
            if (categoriesStr.includes(",")) {
              categories = categoriesStr.split(",").map((str) => {
                const num = parseInt(str.trim());
                if (isNaN(num) || num < 1) {
                  throw new Error(`유효하지 않은 카테고리 ID: ${str}`);
                }
                return num;
              });
            } else {
              categories = validateCategoryId(categoriesStr);
            }
          } catch (error) {
            return NextResponse.json(
              { message: error instanceof Error ? error.message : "유효하지 않은 카테고리 ID입니다." },
              { status: 400 },
            );
          }
        }

        // 캐시된 포스트 데이터 가져오기
        const postsData = await wpCacheService.getPosts({
          page,
          perPage,
          categories,
          forceRefresh,
        });

        return NextResponse.json(postsData, {
          status: 200,
          headers: {
            "Cache-Control": "s-maxage=60, stale-while-revalidate",
            "X-Response-Time": `${duration}ms`,
            "X-Total-Count": postsData.totalPosts.toString(),
            "X-Total-Pages": postsData.totalPages.toString(),
            "X-Current-Page": page.toString(),
          },
        });

      case "categories":
        const categoriesData = await wpCacheService.getCategories({ forceRefresh });

        return NextResponse.json(
          { data: categoriesData },
          {
            status: 200,
            headers: {
              "Cache-Control": "s-maxage=60, stale-while-revalidate",
              "X-Response-Time": `${duration}ms`,
              "X-Total-Count": categoriesData.length.toString(),
            },
          },
        );

      case "tags":
        const idParam = searchParams.get("id");
        const includeParam = searchParams.get("include");

        if (!idParam && !includeParam) {
          return NextResponse.json({ message: "태그 ID 또는 include 파라미터를 제공해 주세요." }, { status: 400 });
        }

        // include 파라미터가 있다면 여러 태그 정보 요청
        if (includeParam) {
          // 태그 ID 배열 검증
          let tagIds: number[];
          try {
            tagIds = includeParam.split(",").map((str) => {
              const num = parseInt(str.trim());
              if (isNaN(num) || num < 1) {
                throw new Error(`유효하지 않은 태그 ID: ${str}`);
              }
              return num;
            });

            if (tagIds.length > 50) {
              return NextResponse.json({ message: "한 번에 최대 50개의 태그만 조회할 수 있습니다." }, { status: 400 });
            }
          } catch (error) {
            return NextResponse.json(
              { message: error instanceof Error ? error.message : "유효하지 않은 태그 ID 목록입니다." },
              { status: 400 },
            );
          }

          const onlyNames = searchParams.get("only_names") === "true";
          const tagsData = await wpCacheService.getAllPostTags(tagIds, onlyNames, { forceRefresh });

          return NextResponse.json(tagsData, {
            status: 200,
            headers: {
              "Cache-Control": "s-maxage=60, stale-while-revalidate",
              "X-Response-Time": `${duration}ms`,
              "X-Total-Count": Array.isArray(tagsData) ? tagsData.length.toString() : "1",
            },
          });
        } else {
          const tagId = validateCategoryId(idParam); // 동일한 검증 로직 재사용
          if (!tagId) {
            return NextResponse.json({ message: "유효한 태그 ID를 제공해주세요." }, { status: 400 });
          }

          const onlyName = searchParams.get("only_name") === "true";
          const tagData = await wpCacheService.getPostTag(tagId, onlyName, { forceRefresh });

          return NextResponse.json(tagData, {
            status: 200,
            headers: {
              "Cache-Control": "s-maxage=60, stale-while-revalidate",
              "X-Response-Time": `${duration}ms`,
            },
          });
        }

      // 검색어 자동 완성
      case "suggestions":
        const prefix = searchParams.get("q");
        const suggestCategoryId = validateCategoryId(searchParams.get("category"));
        const suggestLimit = parseInt(searchParams.get("limit") || "10");

        if (!prefix || prefix.length < 1) {
          return NextResponse.json({ message: "검색어는 최소 1글자 이상이어야 합니다." }, { status: 400 });
        }

        const suggestions = await wpCacheService.getSearchSuggestions(prefix, suggestCategoryId, suggestLimit);

        return NextResponse.json(suggestions, {
          status: 200,
          headers: {
            "Cache-Control": "s-maxage=300, stale-while-revalidate",
            "X-Response-Time": `${duration}ms`,
          },
        });

      default:
        return NextResponse.json({ message: "지원하지 않는 엔드포인트입니다." }, { status: 404 });
    }
  } catch (error) {
    let statusCode = 500;
    const message = toErrorMessage(error, `${endpoint} 데이터를 가져오는 데 실패했습니다.`);
    const errInstance = error instanceof Error ? error : null;

    if (
      message.includes("검색어") ||
      message.includes("페이지") ||
      message.includes("개수") ||
      message.includes("카테고리")
    ) {
      statusCode = 400; // Bad Request
    } else if (message.includes("찾을 수 없")) {
      statusCode = 404; // Not Found
    }

    logger.error("WP 캐시 API 오류", {
      endpoint,
      duration: Date.now() - startTime,
      error: {
        message,
        stack: errInstance?.stack?.split("\n").slice(0, 5),
        name: errInstance?.name,
      },
      request: {
        method: req.method,
        params: Object.fromEntries(new URL(req.url).searchParams),
      },
    });

    return NextResponse.json(
      {
        message,
        endpoint,
        timestamp: new Date().toISOString(),
      },
      { status: statusCode },
    );
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ endpoint: string }> }) {
  const endpoint = (await params).endpoint;

  try {
    // 업데이트 엔드포인트 처리
    if (endpoint === "update") {
      const body = await req.json();
      const { type } = body;

      if (!type || !["posts", "categories", "tags"].includes(type)) {
        return NextResponse.json(
          { message: "유효한 캐시 타입을 지정해주세요. (posts, categories, tags)" },
          { status: 400 },
        );
      }

      // 백그라운드 캐시 업데이트 시작
      wpCacheService.updateCache(type as "posts" | "categories" | "tags").catch((error) => {
        logger.error(`백그라운드 캐시 업데이트 오류 (${type}):`, error);
      });

      return NextResponse.json({ message: `${type} 캐시 업데이트가 백그라운드에서 시작되었습니다.` }, { status: 202 });
    }

    return NextResponse.json({ message: "지원하지 않는 엔드포인트입니다." }, { status: 404 });
  } catch (error) {
    const message = toErrorMessage(error, `${endpoint} 요청을 처리하는 데 실패했습니다.`);
    logger.error(`WP 캐시 API 오류 (${endpoint}):`, message);

    return NextResponse.json(
      { message },
      { status: 500 },
    );
  }
}

/**
 * 입력 값 검증 헬퍼 함수들
 */
function validatePagination(page: string | null, perPage: string | null) {
  const pageNum = parseInt(page || "1");
  const perPageNum = parseInt(perPage || "10");

  if (isNaN(pageNum) || pageNum < 1) {
    throw new Error("페이지 번호는 1 이상이어야 합니다.");
  }

  if (isNaN(perPageNum) || perPageNum < 1 || perPageNum > 100) {
    throw new Error("페이지당 항목 수는 1-100 사이여야 합니다.");
  }

  return { page: pageNum, perPage: perPageNum };
}

function validateCount(count: string | null, min: number = 1, max: number = 50) {
  const countNum = parseInt(count || min.toString());

  if (isNaN(countNum) || countNum < min || countNum > max) {
    throw new Error(`개수는 ${min}-${max} 사이여야 합니다.`);
  }

  return countNum;
}

function validateCategoryId(categoryId: string | null) {
  if (!categoryId) return undefined;

  const categoryNum = parseInt(categoryId);
  if (isNaN(categoryNum) || categoryNum < 1) {
    throw new Error("유효한 카테고리 ID를 제공해주세요.");
  }

  return categoryNum;
}
