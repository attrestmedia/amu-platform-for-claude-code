import fetchClient from "libs/api/fetchClient";
import type { CharacterUniverseOwnerEntry } from "types/game/characterUniverse";

type UniverseOwnersResponse = {
  ok: boolean;
  data?: CharacterUniverseOwnerEntry[];
};

const universeOwnersPath = (universeId: string) =>
  `/admin/universes/${encodeURIComponent(universeId)}/owners`;

function readOwners(response: UniverseOwnersResponse): CharacterUniverseOwnerEntry[] {
  if (!response.ok || !Array.isArray(response.data)) {
    throw new Error("Universe owners response was invalid.");
  }
  return response.data;
}

export async function fetchUniverseOwners(universeId: string): Promise<CharacterUniverseOwnerEntry[]> {
  const response = await fetchClient.get<UniverseOwnersResponse>(universeOwnersPath(universeId), {
    responseType: "json",
    loading: "none",
  });
  return readOwners(response.data);
}

export async function saveUniverseOwners(
  universeId: string,
  ownerEmails: string[],
): Promise<CharacterUniverseOwnerEntry[]> {
  const response = await fetchClient.put<UniverseOwnersResponse>(
    universeOwnersPath(universeId),
    { ownerEmails },
    { responseType: "json", loading: "none" },
  );
  return readOwners(response.data);
}
