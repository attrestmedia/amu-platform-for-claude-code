import "server-only";

import { DEFAULT_PLAY_UNIVERSE } from "consts/app/universe";
import { getUniverseById, getUniverseDetail, getUniverses } from "libs/database/universe";
import { getAuthenticatedUid, isAuthenticatedAdmin } from "libs/server-utils/lab/imageAssetAccess";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import {
  assertPlayableGameUniverse,
  CharacterUniversePolicyError,
  resolveCharacterSpeciesPolicy,
  resolveCharacterUniverseRole,
  selectDefaultCharacterUniverse,
} from "libs/server-utils/game/characterUniversePolicy";
import type { CharacterUniverseListData, CharacterUniverseOption } from "types/game/characterUniverse";
import type { IUniverse } from "types/game";
import { logger } from "utils/log";

/**
 * @docHint
 * @purpose 캐릭터 생성용 Universe 접근 자격과 선택 목록을 서버 데이터로 확인
 * @process Universe 활성·종류·owner·종족 설정을 읽어 역할별 접근 결과와 옵션을 반환
 * @domain game
 * @scope server
 */

export async function resolveCharacterUniverseAccess(user: AuthenticatedUserType, universeId: string) {
  const normalizedUniverseId = String(universeId || "").trim();
  if (!normalizedUniverseId) throw new CharacterUniversePolicyError("UNIVERSE_ID_REQUIRED", 400);

  const universe = await getUniverseById(normalizedUniverseId);
  assertPlayableGameUniverse(universe);

  const [uid, isAdministrator, detail] = await Promise.all([
    Promise.resolve(getAuthenticatedUid(user)),
    Promise.resolve(isAuthenticatedAdmin(user)),
    getUniverseDetail(universe.id),
  ]);
  const role = resolveCharacterUniverseRole({
    isAdministrator,
    uid,
    ownerUids: universe.ownerUids,
  });
  const speciesPolicy = resolveCharacterSpeciesPolicy(detail?.settings?.game?.characterSpeciesMode);

  return { universe, role, speciesPolicy };
}

function toEntryRejected(error: unknown): CharacterUniverseListData["entryRejected"] | undefined {
  if (!(error instanceof CharacterUniversePolicyError)) return undefined;
  if (
    error.code === "UNIVERSE_NOT_FOUND" ||
    error.code === "UNIVERSE_NOT_GAME" ||
    error.code === "UNIVERSE_DISABLED"
  ) {
    return error.code;
  }
  return undefined;
}

export async function listCharacterUniverseOptions(
  user: AuthenticatedUserType,
  entryUniverseId: string | null,
): Promise<CharacterUniverseListData> {
  const uid = getAuthenticatedUid(user);
  const isAdministrator = isAuthenticatedAdmin(user);
  const normalizedEntryId = typeof entryUniverseId === "string" ? entryUniverseId.trim() : "";
  const enabledGameUniverses = (await getUniverses({ enabledOnly: true })).filter((universe) => universe.type === "game");
  const ownedUniverses = uid
    ? enabledGameUniverses.filter((universe) => universe.ownerUids?.some((ownerUid) => ownerUid.trim() === uid))
    : [];

  let accessibleEntry: IUniverse | null = null;
  let entryRejected: CharacterUniverseListData["entryRejected"] = null;

  if (normalizedEntryId) {
    try {
      accessibleEntry = (await resolveCharacterUniverseAccess(user, normalizedEntryId)).universe;
    } catch (error) {
      const rejected = toEntryRejected(error);
      if (rejected) {
        entryRejected = rejected;
      } else if (error instanceof CharacterUniversePolicyError && error.code === "UNIVERSE_SPECIES_POLICY_INVALID") {
        logger.warn("캐릭터 Universe 진입 후보의 종족 정책이 유효하지 않아 제외합니다.", { universeId: normalizedEntryId });
      } else {
        throw error;
      }
    }
  }

  const viewerRole = isAdministrator ? "administrator" : ownedUniverses.length > 0 ? "owner" : "player";
  let candidateUniverses: IUniverse[];

  if (isAdministrator) {
    candidateUniverses = enabledGameUniverses;
  } else if (viewerRole === "owner") {
    candidateUniverses = [...ownedUniverses, ...(accessibleEntry ? [accessibleEntry] : [])];
  } else {
    const playerEntry = normalizedEntryId
      ? accessibleEntry
      : enabledGameUniverses.find((universe) => universe.id === DEFAULT_PLAY_UNIVERSE) || null;
    candidateUniverses = playerEntry ? [playerEntry] : [];
  }

  const distinctCandidates = [...new Map(candidateUniverses.map((universe) => [universe.id, universe])).values()];
  const resolvedOptions = await Promise.all(
    distinctCandidates.map(async (universe): Promise<CharacterUniverseOption | null> => {
      try {
        const { role, speciesPolicy } = await resolveCharacterUniverseAccess(user, universe.id);
        return {
          universeId: universe.id,
          name: universe.name,
          thumbnail: universe.thumbnail,
          role,
          speciesMode: speciesPolicy.mode,
          allowedSpecies: speciesPolicy.allowedSpecies,
          legacyFallback: speciesPolicy.legacyFallback,
          canEditSpecies: role === "administrator" || role === "owner",
        };
      } catch (error) {
        if (error instanceof CharacterUniversePolicyError && error.code === "UNIVERSE_SPECIES_POLICY_INVALID") {
          logger.warn("캐릭터 Universe 목록에서 유효하지 않은 종족 정책을 제외합니다.", { universeId: universe.id });
          return null;
        }
        throw error;
      }
    }),
  );
  const universes = resolvedOptions.filter((option): option is CharacterUniverseOption => option !== null);
  const acceptedEntryUniverseId = accessibleEntry && universes.some((option) => option.universeId === accessibleEntry?.id)
    ? accessibleEntry.id
    : null;
  const ownedUniverseIds = ownedUniverses.map((universe) => universe.id);

  return {
    viewerRole,
    universes,
    defaultUniverseId: selectDefaultCharacterUniverse({
      viewerRole,
      ownedUniverseIds,
      candidateIds: universes.map((universe) => universe.universeId),
      entryUniverseId: acceptedEntryUniverseId,
      fallbackUniverseId: DEFAULT_PLAY_UNIVERSE,
    }),
    entryUniverseId: acceptedEntryUniverseId,
    entryRejected,
  };
}
