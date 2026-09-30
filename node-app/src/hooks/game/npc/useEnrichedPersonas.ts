import { useMemo } from "react";
import type { IExtendedNpcData, IUniverse } from "types/game";
import { enrichPersonas } from "utils/game";

/**
 * @docHint
 * @purpose useEnrichedPersonas 훅 클라이언트 로직 캡슐화
 * @process 상태/이펙트/구독 구성  API 호출/스토어 연동  재사용 동작 제공
 * @domain game-npc
 * @scope universe
 */

type Args = {
  universe?: IUniverse;
  userPersonas?: IExtendedNpcData[];
  npcPersonas?: IExtendedNpcData[];
  catalogUniverseIdForUser: string;
  catalogUniverseIdForNpc: string;
  isCommerceUniverse: boolean;
};

export function useEnrichedPersonas({
  universe,
  userPersonas,
  npcPersonas,
  catalogUniverseIdForUser,
  catalogUniverseIdForNpc,
  isCommerceUniverse,
}: Args) {
  const enrichedUser = useMemo(
    () =>
      enrichPersonas(userPersonas, universe, {
        universeId: catalogUniverseIdForUser,
        type: "user",
        isCommerceUniverse,
      }),
    [userPersonas, universe, catalogUniverseIdForUser, isCommerceUniverse]
  );

  const enrichedNpc = useMemo(
    () =>
      enrichPersonas(npcPersonas, universe, {
        universeId: catalogUniverseIdForNpc,
        type: "npc",
        isCommerceUniverse,
      }),
    [npcPersonas, universe, catalogUniverseIdForNpc, isCommerceUniverse]
  );

  return { enrichedUser, enrichedNpc };
}
