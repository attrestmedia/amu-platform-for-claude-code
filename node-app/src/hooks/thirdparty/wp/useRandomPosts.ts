import { useQuery } from "@tanstack/react-query";
import { getCachedRandomPosts, getCachedLatestPosts } from "libs/api/wp";
import { logger } from "utils/log";
import { getResponseStatus } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose useRandomPosts 훅 클라이언트 로직 캡슐화
 * @process 상태/이펙트/구독 구성  API 호출/스토어 연동  재사용 동작 제공
 * @domain wp-feed
 * @scope client
 */

export const useRandomPosts = (
  options: {
    count?: number;
    categoryId?: number;
    enabled?: boolean;
  } = {},
) => {
  const { count = 5, categoryId, enabled = true } = options;

  return useQuery({
    queryKey: ["randomPosts", count, categoryId],
    queryFn: async () => {
      try {
        return await getCachedRandomPosts({ count, categoryId });
      } catch (error) {
        // 폴백 처리
        logger.warn("랜덤 포스트 캐시 실패, 최신 포스트로 폴백:", error);
        return await getCachedLatestPosts({ count, categoryId });
      }
    },
    enabled,
    staleTime: 5 * 60 * 1000, // 5분
    refetchInterval: 5 * 60 * 1000, // 5분마다 자동 갱신
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    retry: (failureCount: number, error: unknown) => {
      const status = getResponseStatus(error);
      const isClientError = typeof status === "number" && status >= 400 && status < 500;
      return failureCount < 3 && !isClientError;
    },
  });
};
