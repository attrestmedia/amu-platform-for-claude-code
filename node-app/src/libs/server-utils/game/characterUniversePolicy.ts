import type { IUniverse } from "types/game";
import {
  CHARACTER_SPECIES_MODE_LEGACY_DEFAULT,
  type CharacterSpeciesId,
  type CharacterSpeciesMode,
} from "consts/game/characterGenesisPolicy";
import type {
  CharacterSpeciesPolicy,
  CharacterUniverseRole,
} from "types/game/characterUniverse";

/**
 * @docHint
 * @purpose 캐릭터 Universe 상태·종족 정책의 순수 판정
 * @process 저장값·Universe 상태·viewer 권한을 검증하고 선택 및 거부 결과를 계산
 * @domain game
 * @scope server-policy
 */

export type CharacterUniverseErrorCode =
  | "UNIVERSE_ID_REQUIRED"
  | "UNIVERSE_NOT_FOUND"
  | "UNIVERSE_NOT_GAME"
  | "UNIVERSE_DISABLED"
  | "UNIVERSE_SPECIES_POLICY_INVALID"
  | "CHARACTER_SPECIES_NOT_ALLOWED";

export class CharacterUniversePolicyError extends Error {
  public readonly code: CharacterUniverseErrorCode;
  public readonly status: number;

  constructor(code: CharacterUniverseErrorCode, status: number) {
    super(code);
    this.name = "CharacterUniversePolicyError";
    this.code = code;
    this.status = status;
  }
}

export function resolveCharacterSpeciesPolicy(rawMode: unknown): CharacterSpeciesPolicy {
  if (rawMode == null) {
    return {
      mode: CHARACTER_SPECIES_MODE_LEGACY_DEFAULT,
      allowedSpecies: ["human", "monster"],
      legacyFallback: true,
    };
  }

  if (rawMode === "human") {
    return { mode: "human", allowedSpecies: ["human"], legacyFallback: false };
  }

  if (rawMode === "monster") {
    return { mode: "monster", allowedSpecies: ["monster"], legacyFallback: false };
  }

  if (rawMode === "both") {
    return { mode: "both", allowedSpecies: ["human", "monster"], legacyFallback: false };
  }

  throw new CharacterUniversePolicyError("UNIVERSE_SPECIES_POLICY_INVALID", 409);
}

export function assertCharacterSpeciesAllowed(
  policy: CharacterSpeciesPolicy,
  speciesId: string,
): asserts speciesId is CharacterSpeciesId {
  if (!policy.allowedSpecies.includes(speciesId as CharacterSpeciesId)) {
    throw new CharacterUniversePolicyError("CHARACTER_SPECIES_NOT_ALLOWED", 403);
  }
}

export function resolveDefaultCharacterSpecies(policy: CharacterSpeciesPolicy): CharacterSpeciesId {
  if (policy.allowedSpecies.includes("human")) return "human";
  const fallback = policy.allowedSpecies[0];
  if (!fallback) throw new CharacterUniversePolicyError("UNIVERSE_SPECIES_POLICY_INVALID", 409);
  return fallback;
}

export function resolveCharacterUniverseRole(input: {
  isAdministrator: boolean;
  uid: string;
  ownerUids?: string[];
}): CharacterUniverseRole {
  if (input.isAdministrator) return "administrator";

  const uid = input.uid.trim();
  if (uid && input.ownerUids?.some((ownerUid) => ownerUid.trim() === uid)) return "owner";
  return "player";
}

export function assertPlayableGameUniverse(
  universe: Pick<IUniverse, "id" | "type" | "enabled"> | null,
): asserts universe is Pick<IUniverse, "id" | "type" | "enabled"> {
  if (!universe) throw new CharacterUniversePolicyError("UNIVERSE_NOT_FOUND", 404);
  if (universe.type !== "game") throw new CharacterUniversePolicyError("UNIVERSE_NOT_GAME", 403);
  if (universe.enabled === false) throw new CharacterUniversePolicyError("UNIVERSE_DISABLED", 403);
}

export function selectDefaultCharacterUniverse(input: {
  viewerRole: CharacterUniverseRole;
  ownedUniverseIds: string[];
  candidateIds: string[];
  entryUniverseId: string | null;
  fallbackUniverseId: string;
}): string | null {
  const candidates = new Set(input.candidateIds);
  if (input.entryUniverseId && candidates.has(input.entryUniverseId)) return input.entryUniverseId;

  if (input.viewerRole === "owner") {
    if (input.ownedUniverseIds.length === 1) {
      const ownedUniverseId = input.ownedUniverseIds[0];
      return ownedUniverseId && candidates.has(ownedUniverseId) ? ownedUniverseId : null;
    }
    if (input.ownedUniverseIds.length >= 2) return null;
  }

  return candidates.has(input.fallbackUniverseId) ? input.fallbackUniverseId : null;
}

export type { CharacterSpeciesId, CharacterSpeciesMode };
