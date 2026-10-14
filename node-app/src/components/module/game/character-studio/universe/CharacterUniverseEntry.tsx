"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CharacterRegisterView } from "components/module/game/forge/steps/character/CharacterRegisterView";
import { CharacterSpeciesModeControl } from "./CharacterSpeciesModeControl";
import { CharacterUniverseSelector } from "./CharacterUniverseSelector";
import { useCharacterUniverseOptions } from "./useCharacterUniverseOptions";

export function CharacterUniverseEntry({ entryUniverseId }: { entryUniverseId: string | null }) {
  const query = useCharacterUniverseOptions(entryUniverseId);
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();
  const requestedUniverseId = searchParams.get("universeId")?.trim() || null;
  const universes = query.data?.universes || [];
  const selectedUniverse =
    universes.find((universe) => universe.universeId === requestedUniverseId) ||
    universes.find((universe) => universe.universeId === query.data?.defaultUniverseId) ||
    (universes.length === 1 ? universes[0] : undefined);
  const selectedUniverseId = selectedUniverse?.universeId || null;

  useEffect(function preserveSelectedUniverseInUrl() {
    if (!query.data || !selectedUniverseId || requestedUniverseId === selectedUniverseId) return;
    const nextSearchParams = new URLSearchParams(queryString);
    nextSearchParams.set("universeId", selectedUniverseId);
    router.replace(pathname + "?" + nextSearchParams.toString(), { scroll: false });
  }, [pathname, query.data, queryString, requestedUniverseId, router, selectedUniverseId]);

  function selectUniverse(universeId: string) {
    if (!universes.some((universe) => universe.universeId === universeId)) return;
    const nextSearchParams = new URLSearchParams(queryString);
    nextSearchParams.set("universeId", universeId);
    router.replace(pathname + "?" + nextSearchParams.toString(), { scroll: false });
  }

  function retryUniverseOptions() {
    void query.refetch();
  }

  return (
    <div className="space-y-4">
      <CharacterUniverseSelector
        data={query.data}
        isLoading={query.isLoading}
        isError={query.isError && !query.data}
        selectedUniverseId={selectedUniverseId}
        onSelect={selectUniverse}
        onRetry={retryUniverseOptions}
      />
      {selectedUniverse?.canEditSpecies === true ? (
        <CharacterSpeciesModeControl key={selectedUniverse.universeId} universe={selectedUniverse} />
      ) : null}
      {selectedUniverse ? (
        <CharacterRegisterView key={selectedUniverse.universeId} universeId={selectedUniverse.universeId} />
      ) : null}
    </div>
  );
}
