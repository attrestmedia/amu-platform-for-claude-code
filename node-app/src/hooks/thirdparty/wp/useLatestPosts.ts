import { useQuery } from "@tanstack/react-query";
import { getCachedLatestPosts } from "libs/api/wp";

/**
 * @docHint
 * @purpose useLatestPosts 훅 클라이언트 로직 캡슐화
 * @process 상태/이펙트/구독 구성  API 호출/스토어 연동  재사용 동작 제공
 * @domain wp-feed
 * @scope client
 */

// 캐시에 저장된 최신 포스트(정렬순은 API 내부 구현에 따름)를 가져옴
export const useLatestPosts = (
  options: {
    count?: number;
    categoryId?: number;
    enabled?: boolean;
  } = {}
) => {
  const { count = 5, categoryId, enabled = true } = options;

  return useQuery({
    queryKey: ["latestPosts", count, categoryId],
    queryFn: () => getCachedLatestPosts({ count, categoryId }),
    enabled,
    staleTime: 15 * 60 * 1000, // 15분
    refetchOnWindowFocus: false,
  });
};
