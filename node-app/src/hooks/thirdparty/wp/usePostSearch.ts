import { useQuery } from "@tanstack/react-query";
import fetchClient from "libs/api/fetchClient";
import { useDebounceValue } from "hooks/common";
import { logger } from "utils/log";
import { extractApiErrorMessage, getResponseStatus } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose usePostSearch 훅 클라이언트 로직 캡슐화
 * @process 상태/이펙트/구독 구성  API 호출/스토어 연동  재사용 동작 제공
 * @domain wp-search
 * @scope client
 */

// 검색어 + 페이지네이션 조건으로 실제 WP API에서 포스트를 검색
export const usePostSearch = (options: {
  query: string;
  page?: number;
  perPage?: number;
  categoryId?: number;
  enabled?: boolean;
  debounceMs?: number;
}) => {
  const { query, page = 1, perPage = 10, categoryId, enabled = true, debounceMs = 300 } = options;

  // 검색어 디바운싱
  const debouncedQuery = useDebounceValue(query.trim(), debounceMs);

  return useQuery({
    queryKey: ["searchPostsDirect", debouncedQuery, page, perPage, categoryId],
    queryFn: async () => {
      try {
        // 실제 WP API로 직접 검색 요청
        const params: Record<string, unknown> = {
          search: debouncedQuery,
          page,
          per_page: perPage,
          orderby: "relevance", // 검색 시 관련도순 정렬
        };

        // 카테고리 필터가 있는 경우 추가
        if (categoryId) {
          params.categories = categoryId;
        }

        logger.log("🔍 실제 WP API 검색 요청:", {
          query: debouncedQuery,
          params,
        });

        const response = await fetchClient.get("/thirdparty/wp/posts", {
          params,
        });

        logger.log("✅ WP API 검색 완료:", {
          query: debouncedQuery,
          totalPosts: response.data.totalPosts,
          resultsCount: response.data.data?.length || 0,
        });

        return {
          posts: response.data.data || [],
          totalCount: response.data.totalPosts || 0,
          totalPages: response.data.totalPages || 0,
        };
      } catch (error: unknown) {
        logger.error("WP API 검색 오류:", error);

        // 에러 상세 로깅
        logger.log("WP API 검색 실패 상세:", {
          query: debouncedQuery,
          error: extractApiErrorMessage(error),
          status: getResponseStatus(error),
        });

        throw error;
      }
    },
    enabled: enabled && debouncedQuery.length >= 2, // 최소 2글자
    staleTime: 0, // 캐시 사용하지 않음 - 항상 최신 데이터
    gcTime: 5 * 60 * 1000, // 5분 후 가비지 컬렉션 (메모리 관리용)
    retry: (failureCount, error: unknown) => {
      // 400 에러(잘못된 요청)는 재시도하지 않음
      if (getResponseStatus(error) === 400) return false;
      return failureCount < 2; // 최대 2번 재시도
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // 지수 백오프
  });
};
