"use client";

import { useQuery } from "@tanstack/react-query";
import { characterUniversesQueryKey, listCharacterUniverseOptions } from "libs/api/game/characterUniverses";

export function useCharacterUniverseOptions(entryUniverseId: string | null) {
  return useQuery({
    queryKey: characterUniversesQueryKey(entryUniverseId),
    queryFn: ({ signal }) => listCharacterUniverseOptions(entryUniverseId, signal),
    staleTime: 30_000,
    retry: false,
  });
}
