import type { CharacterSpeciesId, CharacterSpeciesMode } from "consts/game/characterGenesisPolicy";

export type CharacterUniverseRole = "administrator" | "owner" | "player";

export interface CharacterSpeciesPolicy {
  mode: CharacterSpeciesMode;
  allowedSpecies: CharacterSpeciesId[];
  legacyFallback: boolean;
}

export interface CharacterUniverseOption {
  universeId: string;
  name: string;
  thumbnail: string;
  role: CharacterUniverseRole;
  speciesMode: CharacterSpeciesMode;
  allowedSpecies: CharacterSpeciesId[];
  legacyFallback: boolean;
  canEditSpecies: boolean;
}

export interface CharacterUniverseListData {
  viewerRole: CharacterUniverseRole;
  universes: CharacterUniverseOption[];
  defaultUniverseId: string | null;
  entryUniverseId: string | null;
  entryRejected: null | "UNIVERSE_NOT_FOUND" | "UNIVERSE_NOT_GAME" | "UNIVERSE_DISABLED";
}

export interface CharacterUniverseOwnerEntry {
  uid: string;
  email: string | null;
}
