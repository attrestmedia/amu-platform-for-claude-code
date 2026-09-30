"use client";

import { useEffect, useMemo, useState } from "react";
import { getUniverseList } from "libs/api/universe";
import type { IUniverse } from "types/game";
import { logger } from "utils/log";
import { toErrorMessage } from "utils/common/typeUtils";

export function usePublicUniverseList() {
  const [universes, setUniverses] = useState<IUniverse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setIsLoading(true);
        setError(null);

        const nextUniverses = await getUniverseList({
          enabledOnly: true,
          sortByOrder: true,
          displayFor: "home",
        });

        if (!mounted) return;
        setUniverses(nextUniverses);
      } catch (err: unknown) {
        logger.error("[usePublicUniverseList] public universe load failed", err);
        if (!mounted) return;
        setUniverses([]);
        setError(toErrorMessage(err, "유니버스 목록을 불러오지 못했습니다."));
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const gameUniverses = useMemo(() => universes.filter((universe) => universe.type === "game"), [universes]);
  const commerceUniverses = useMemo(() => universes.filter((universe) => universe.type === "commerce"), [universes]);

  return {
    universes,
    gameUniverses,
    commerceUniverses,
    isLoading,
    error,
  };
}
