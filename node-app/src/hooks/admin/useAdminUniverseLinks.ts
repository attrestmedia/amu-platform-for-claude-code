import { useQuery } from "@tanstack/react-query";
import fetchClient from "libs/api/fetchClient";

/**
 * @docHint
 * @purpose 서버에서 검증된 유니버스 관리자 내비게이션 목록 조회
 * @process 로그인 상태 확인  권한 목록 API 조회  안전한 링크 데이터 제공
 * @domain auth
 * @scope global
 */

export type AdminUniverseLink = {
  id: string;
  name: string;
  type: "game" | "commerce";
};

type AdminUniverseLinksResponse = {
  success?: boolean;
  data?: AdminUniverseLink[];
};

export function useAdminUniverseLinks(actorKey?: string | null) {
  const normalizedActorKey = String(actorKey || "").trim();
  const enabled = Boolean(normalizedActorKey);
  const query = useQuery<AdminUniverseLink[]>({
    queryKey: ["admin-universe-links", normalizedActorKey || "anonymous"],
    queryFn: async () => {
      const response = await fetchClient.get<AdminUniverseLinksResponse>("/admin/universes", { cache: "no-store" });
      return Array.isArray(response.data?.data) ? response.data.data : [];
    },
    enabled,
    staleTime: 60_000,
    retry: false,
  });

  return {
    adminUniverses: enabled ? query.data || [] : [],
    isAdminUniverseLoading: enabled && query.isLoading,
  };
}
