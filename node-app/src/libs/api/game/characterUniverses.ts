import fetchClient from "libs/api/fetchClient";
import type { CharacterSpeciesMode } from "consts/game/characterGenesisPolicy";
import type { CharacterUniverseListData } from "types/game/characterUniverse";

type CharacterUniverseApiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: string;
  errorCode?: string;
};

export const characterUniversesQueryKey = (entryUniverseId: string | null) =>
  ["character-universes", entryUniverseId] as const;

export async function listCharacterUniverseOptions(
  entryUniverseId: string | null,
  signal?: AbortSignal,
) {
  const response = await fetchClient.get<CharacterUniverseApiEnvelope<CharacterUniverseListData>>(
    "/game/characters/universes",
    {
      params: { entryUniverseId },
      responseType: "auto",
      cache: "no-store",
      loading: "none",
      signal,
    },
  );
  const data = response.data?.data;
  if (!response.data?.ok || !data) {
    throw new Error(response.data?.errorCode || response.data?.error || "character_universe_options_failed");
  }
  return data;
}

export async function updateCharacterUniverseSpeciesMode(
  universeId: string,
  characterSpeciesMode: CharacterSpeciesMode,
) {
  const response = await fetchClient.put<CharacterUniverseApiEnvelope<unknown>>(
    "/game/universes/" + encodeURIComponent(universeId) + "/character-species",
    { characterSpeciesMode },
    { responseType: "auto", loading: "none" },
  );
  if (!response.data?.ok) {
    const errorCode = response.data?.errorCode || response.data?.error || "character_species_mode_update_failed";
    const error = new Error(errorCode);
    Object.assign(error, { errorCode });
    throw error;
  }
}
