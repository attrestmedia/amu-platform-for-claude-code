import fetchClient from "libs/api/fetchClient";
import type { IWpGetPostsOptions, IWpPostsResponse, IWpCategoriesResponse } from "types/thirdparty";
import { logger } from "utils/log";
import { toErrorLike, toErrorMessage, toUnknownRecord, type UnknownRecord } from "utils/common/typeUtils";

type WpTag = { id: number; name: string } & UnknownRecord;

/**
 * @docHint
 * @purpose 클라이언트 API 호출 래핑
 * @process 엔드포인트(/thirdparty/wp/posts) 호출 구성  응답/에러 정리 반환
 * @domain wp
 * @scope client
 */

// 포스트를 가져오는 함수
export const getPosts = async (options: IWpGetPostsOptions & { search?: string } = {}): Promise<IWpPostsResponse> => {
  const {
    page = 1,
    perPage = 10,
    orderby = "date",
    order = "desc",
    categories,
    search,
    forceRefresh = false,
    includeMedia = false,
  } = options;

  // 쿼리 파라미터 초기화
  const params: UnknownRecord = {
    page,
    per_page: perPage,
  };

  // search 파라미터 추가 (검색어가 있을 때)
  if (search && search.trim()) {
    params.search = search.trim();
    // 검색어가 있을 때만 relevance 정렬 허용
    if (orderby === "relevance") {
      params.orderby = "relevance";
      // relevance일 때는 order 파라미터를 명시적으로 제외
    } else {
      params.orderby = orderby;
      if (order) {
        params.order = order;
      }
    }
  } else {
    // 검색어가 없으면 relevance 사용 불가, 기본값으로 변경
    if (orderby === "relevance") {
      params.orderby = "date";
      params.order = "desc";
    } else {
      params.orderby = orderby;
      if (order) {
        params.order = order;
      }
    }
  }

  // 카테고리 파라미터 처리 (기존과 동일)
  if (categories !== undefined) {
    if (Array.isArray(categories)) {
      params.categories = categories.join(",");
    } else {
      params.categories = categories;
    }
  }

  if (forceRefresh) {
    params.refresh = "1";
    params._cb = Date.now();
  }

  if (includeMedia) {
    params.media = "1";
  }

  const response = await fetchClient.get<IWpPostsResponse>("/thirdparty/wp/posts", {
    params,
    timeout: 15000,
  });

  return response.data;
};

// 모든 카테고리 정보를 가져오는 함수
export const getCategories = async (): Promise<IWpCategoriesResponse> => {
  const response = await fetchClient.get<IWpCategoriesResponse>("/thirdparty/wp/categories");
  return response.data;
};

// 단일 태그 데이터를 가져오는 함수
export const getPostTag = async (tagId: number, onlyName?: boolean) => {
  try {
    const response = await fetchClient.get<WpTag>(`/thirdparty/wp/tags`, {
      params: { id: tagId },
      timeout: 10000,
    });
    if (onlyName) {
      return response.data.name;
    }
    return response.data;
  } catch (error: unknown) {
    const err = toErrorLike(error);
    const respData = toUnknownRecord(toUnknownRecord(err.response).data) as { message?: string };
    logger.error(`태그 (ID: ${tagId}) 데이터를 가져오는 중 오류 발생:`, respData.message || toErrorMessage(error));
    throw error;
  }
};

// 포스트 객체에서 tags 배열에 포함된 태그 데이터를 모두 가져오는 함수
export const getAllPostTags = async (tags: number[], onlyNames?: boolean) => {
  if (!tags || tags.length === 0) return [];
  try {
    const response = await fetchClient.get<WpTag[]>("/thirdparty/wp/tags", {
      params: { include: tags.join(",") },
      timeout: 10000,
    });

    if (onlyNames) {
      // 응답 데이터에서 name 값만 추출하여 배열로 반환
      return response.data.map((tag) => tag.name);
    }
    return response.data;
  } catch (error: unknown) {
    const err = toErrorLike(error);
    const respData = toUnknownRecord(toUnknownRecord(err.response).data) as { message?: string };
    logger.error("태그 데이터를 가져오는 중 오류 발생:", respData.message || toErrorMessage(error));
    throw error;
  }
};
