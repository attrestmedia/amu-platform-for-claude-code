"use client";

import { useQuery } from "@tanstack/react-query";
import { getUniverseList } from "libs/api/universe";
import type { IUniverse } from "types/game";
import { useUniverseAdminAccess } from "./useUniverseAdminAccess";

export function useManageableUniverses(enabled: boolean) {
  const query = useQuery<IUniverse[]>({
    queryKey: ["manageable-universes"],
    queryFn: () => getUniverseList({ enabledOnly: false, sortByOrder: true }),
    enabled,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const access = useUniverseAdminAccess(query.data);

  return {
    ...access,
    isLoading: enabled && query.isLoading,
    error: query.error,
  };
}
