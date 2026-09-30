import fetchClient from "libs/api/fetchClient";
import type { IWpCategory, IWpGetPostsOptions, IWpPost, IWpPostsResponse } from "types/thirdparty";
import { logger } from "utils/log";
import { toErrorLike, toErrorMessage, toUnknownRecord, type UnknownRecord } from "utils/common/typeUtils";

type WpTagDoc = { id: number; name: string } & UnknownRecord;

/**
 * @docHint
 * @purpose 클라이언트 API 호출 래핑
 * @process 엔드포인트(/thirdparty/wp/cached/posts) 호출 구성  응답/에러 정리 반환
 * @domain wp
 * @scope client
 */

// 캐시된 포스트 데이터 가져오기
export const getCachedPosts = async (options: IWpGetPostsOptions = {}): Promise<IWpPostsResponse> => {
  const { page = 1, perPage = 10, orderby, order, categories, search } = options;

  // 쿼리 파라미터 초기화
  const params: UnknownRecord = {
    page,
    per_page: perPage,
  };

  // search 파라미터 추가 (검색어가 있을 때)
  if (search && search.trim()) {
    params.search = search.trim();
  }

  // orderby와 order가 지정된 경우 추가
  if (orderby) {
    params.orderby = orderby;
    // search와 함께 relevance를 사용할 때는 order 파라미터를 생략
    if (orderby !== "relevance" && order) {
      params.order = order;
    }
  }

  // categories가 지정된 경우 추가
  if (categories !== undefined) {
    if (Array.isArray(categories)) {
      params.categories = categories.join(",");
    } else {
      params.categories = categories;
    }
  }

  // 캐시된 데이터 가져오기
  const response = await fetchClient.get<IWpPostsResponse>("/thirdparty/wp/cached/posts", {
    params,
  });

  return response.data;
};

// 캐시된 카테고리 데이터 가져오기
export const getCachedCategories = async (): Promise<IWpCategory[]> => {
  const response = await fetchClient.get<{ data: IWpCategory[] }>("/thirdparty/wp/cached/categories");
  return response.data.data;
};

// 캐시된 단일 태그 데이터 가져오기
export const getCachedPostTag = async (tagId: number, onlyName?: boolean) => {
  try {
    const params: UnknownRecord = { id: tagId };
    if (onlyName) {
      params.only_name = true;
    }

    const response = await fetchClient.get<WpTagDoc | string>("/thirdparty/wp/cached/tags", {
      params,
      timeout: 10000,
    });
    return response.data;
  } catch (error: unknown) {
    const err = toErrorLike(error);
    const respData = toUnknownRecord(toUnknownRecord(err.response).data) as { message?: string };
    logger.error(
      `캐시된 태그 (ID: ${tagId}) 데이터를 가져오는 중 오류 발생:`,
      respData.message || toErrorMessage(error),
    );
    throw error;
  }
};

// 캐시된 여러 태그 데이터 가져오기
export const getCachedAllPostTags = async (tags: number[], onlyNames?: boolean) => {
  if (!tags || tags.length === 0) return [];
  try {
    const params: UnknownRecord = { include: tags.join(",") };
    if (onlyNames) {
      params.only_names = true;
    }

    const response = await fetchClient.get<WpTagDoc[] | string[]>("/thirdparty/wp/cached/tags", {
      params,
      timeout: 10000,
    });
    return response.data;
  } catch (error: unknown) {
    const err = toErrorLike(error);
    const respData = toUnknownRecord(toUnknownRecord(err.response).data) as { message?: string };
    logger.error("캐시된 태그 데이터를 가져오는 중 오류 발생:", respData.message || toErrorMessage(error));
    throw error;
  }
};

// 백그라운드에서 캐시 업데이트 요청
export const requestCacheUpdate = async (type: "posts" | "categories" | "tags") => {
  try {
    const response = await fetchClient.post<UnknownRecord>("/thirdparty/wp/cached/update", { type });
    return response.data;
  } catch (error: unknown) {
    const err = toErrorLike(error);
    const respData = toUnknownRecord(toUnknownRecord(err.response).data) as { message?: string };
    logger.error(`캐시 업데이트 요청 중 오류 발생 (${type}):`, respData.message || toErrorMessage(error));
    throw error;
  }
};

// 랜덤 포스트 목록 가져오기
export const getCachedRandomPosts = async (
  options: {
    count?: number;
    categoryId?: number;
    forceRefresh?: boolean;
  } = {},
): Promise<IWpPost[]> => {
  const { count = 5, categoryId, forceRefresh = false } = options;

  const params: UnknownRecord = { count };
  if (categoryId) params.category = categoryId;
  if (forceRefresh) params.refresh = true;

  // 통합 라우터의 search 엔드포인트 사용
  const response = await fetchClient.get<IWpPost[]>("/thirdparty/wp/cached/random", { params });
  logger.log("🔍 getCachedRandomPosts 응답:", response.data);
  return response.data;
};

// 최신 포스트 목록 가져오기
export const getCachedLatestPosts = async (
  options: {
    count?: number;
    categoryId?: number;
    forceRefresh?: boolean;
  } = {},
): Promise<IWpPost[]> => {
  const { count = 10, categoryId, forceRefresh = false } = options;

  const params: UnknownRecord = { count };
  if (categoryId) params.category = categoryId;
  if (forceRefresh) params.refresh = true;

  // 통합 라우터의 search 엔드포인트 사용
  const response = await fetchClient.get<IWpPost[]>("/thirdparty/wp/cached/latest", { params });
  logger.log("🔍 getCachedLatestPosts 응답:", response.data);
  return response.data;
};

// 포스트 검색
export const searchCachedPosts = async (options: {
  query: string;
  page?: number;
  perPage?: number;
  categoryId?: number;
  forceRefresh?: boolean;
}): Promise<{ posts: IWpPost[]; totalCount: number; totalPages: number }> => {
  const { query, page = 1, perPage = 10, categoryId, forceRefresh = false } = options;

  const params: UnknownRecord = { q: query, page, per_page: perPage };
  if (categoryId) params.category = categoryId;
  if (forceRefresh) params.refresh = true;

  // 통합 라우터의 search 엔드포인트 사용
  const response = await fetchClient.get<{ posts: IWpPost[]; totalCount: number; totalPages: number }>(
    "/thirdparty/wp/cached/search",
    { params },
  );

  logger.log("searchCachedPosts 응답:", {
    status: response.status,
    data: response.data,
    dataKeys: response.data ? Object.keys(response.data) : [],
  });

  return response.data;
};

// 포스트 상세 정보 가져오기
export const getCachedPostDetail = async (options: {
  postId?: string | number;
  slug?: string;
  forceRefresh?: boolean;
}): Promise<IWpPost | null> => {
  const { postId, slug, forceRefresh = false } = options;

  const params: UnknownRecord = {};
  if (postId) params.id = postId;
  if (slug) params.slug = slug;
  if (forceRefresh) params.refresh = true;

  // 통합 라우터의 search 엔드포인트 사용
  const response = await fetchClient.get<IWpPost | null>("/thirdparty/wp/cached/detail", { params });
  return response.data;
};
