import { useQuery } from "@tanstack/react-query";
import { getCachedPostDetail } from "libs/api/wp";

/**
 * @docHint
 * @purpose usePostDetail 훅 클라이언트 로직 캡슐화
 * @process 상태/이펙트/구독 구성  API 호출/스토어 연동  재사용 동작 제공
 * @domain wp-detail
 * @scope client
 */

// 특정 포스트의 상세 정보를 캐시에서 가져옴
export const usePostDetail = (options: { postId?: number; slug?: string; enabled?: boolean }) => {
  const { postId, slug, enabled = true } = options;

  return useQuery({
    queryKey: ["postDetail", postId, slug],
    queryFn: () => getCachedPostDetail({ postId, slug }),
    enabled: enabled && !!(postId || slug),
    staleTime: 60 * 60 * 1000, // 1시간
    refetchOnWindowFocus: false,
  });
};
