import { useQuery } from "@tanstack/react-query";
import fetchClient from "libs/api/fetchClient";
import { useDebounceValue } from "hooks/common";
import { GAME_CONSTANTS as GC } from "consts/game";

/**
 * @docHint
 * @purpose useSearchSuggestions 훅 클라이언트 로직 캡슐화
 * @process 상태/이펙트/구독 구성  API 호출/스토어 연동  재사용 동작 제공
 * @domain wp-search
 * @scope client
 */

export const useSearchSuggestions = (
  prefix: string,
  options: {
    categoryId?: number;
    enabled?: boolean;
    debounceMs?: number;
  } = {}
) => {
  const { categoryId, enabled = true, debounceMs = GC.INTERVALS.SEARCH_DEBOUNCE } = options;

  // 검색어 디바운싱
  const debouncedPrefix = useDebounceValue(prefix.trim(), debounceMs);

  return useQuery({
    queryKey: ["searchSuggestions", debouncedPrefix, categoryId],
    queryFn: async () => {
      const params: Record<string, unknown> = { q: debouncedPrefix };
      if (categoryId) params.category = categoryId;

      const response = await fetchClient.get<string[]>("/thirdparty/wp/cached/suggestions", {
        params,
      });

      return response.data;
    },
    enabled: enabled && debouncedPrefix.length >= 1,
    staleTime: 5 * 60 * 1000, // 5분
  });
};
