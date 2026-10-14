import { NextResponse } from "next/server";
import { CHARACTER_SPECIES_MODES, type CharacterSpeciesMode } from "consts/game/characterGenesisPolicy";
import { getUniverseById, getUniverseDetail } from "libs/database/universe";
import { setUniverseCharacterSpeciesMode } from "libs/database/universe/universeDetail";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import { getAuthenticatedUid, isAuthenticatedAdmin } from "libs/server-utils/lab/imageAssetAccess";
import {
  assertPlayableGameUniverse,
  CharacterUniversePolicyError,
  resolveCharacterSpeciesPolicy,
  resolveCharacterUniverseRole,
} from "libs/server-utils/game/characterUniversePolicy";
import { resolveCharacterUniverseAccess } from "libs/server-utils/game/characterUniverseAccess";
import { redisCache } from "libs/cache/redisCacheService";
import CacheKeyManager from "libs/cache/cacheKeyManager";
import { invalidateUniverseDetailPromptCache } from "libs/server-utils/system-prompt/commercePromptData";
import { logger } from "utils/log";
import { toUnknownRecord } from "utils/common/typeUtils";
import type { CharacterSpeciesPolicy, CharacterUniverseRole } from "types/game/characterUniverse";

export const runtime = "nodejs";

/**
 * @docHint
 * @purpose administrator 또는 해당 game Universe owner의 캐릭터 종족 설정을 조회·저장
 * @process 서버 owner/admin 권한과 Universe 상태를 검증하고 종족 설정만 갱신
 * @domain game
 * @scope user-api
 */

function policyErrorResponse(error: unknown) {
  if (!(error instanceof CharacterUniversePolicyError)) return null;
  return NextResponse.json(
    { ok: false, error: error.code.toLowerCase(), errorCode: error.code },
    { status: error.status },
  );
}

async function resolveSpeciesEditorAccess(user: AuthenticatedUserType, universeId: string) {
  try {
    const access = await resolveCharacterUniverseAccess(user, universeId);
    return { universe: access.universe, role: access.role };
  } catch (error) {
    if (!(error instanceof CharacterUniversePolicyError) || error.code !== "UNIVERSE_SPECIES_POLICY_INVALID") {
      throw error;
    }

    // 정책 값이 손상된 경우에도 권한 있는 사용자가 값을 교정할 수 있어야 한다.
    const universe = await getUniverseById(universeId);
    assertPlayableGameUniverse(universe);
    const role = resolveCharacterUniverseRole({
      isAdministrator: isAuthenticatedAdmin(user),
      uid: getAuthenticatedUid(user),
      ownerUids: universe.ownerUids,
    });
    return { universe, role };
  }
}

function hasSpeciesEditRole(role: CharacterUniverseRole) {
  return role === "administrator" || role === "owner";
}

export const GET = withAuth(
  async (_body, user, _request, context) => {
    const universeId = String(context.params?.universeId || "").trim();
    if (!universeId || universeId.length > 80) {
      return NextResponse.json(
        { ok: false, error: "universe_id_required", errorCode: "UNIVERSE_ID_REQUIRED" },
        { status: 400 },
      );
    }

    try {
      const { role } = await resolveSpeciesEditorAccess(user, universeId);
      if (!hasSpeciesEditRole(role)) {
        return NextResponse.json(
          { ok: false, error: "universe_species_edit_forbidden", errorCode: "UNIVERSE_SPECIES_EDIT_FORBIDDEN" },
          { status: 403 },
        );
      }

      const detail = await getUniverseDetail(universeId);
      const characterSpeciesMode = detail?.settings?.game?.characterSpeciesMode ?? null;
      let effective: CharacterSpeciesPolicy | null = null;
      let invalid = false;
      try {
        effective = resolveCharacterSpeciesPolicy(characterSpeciesMode);
      } catch (error) {
        if (!(error instanceof CharacterUniversePolicyError) || error.code !== "UNIVERSE_SPECIES_POLICY_INVALID") {
          throw error;
        }
        invalid = true;
      }

      return NextResponse.json({
        ok: true,
        data: { characterSpeciesMode, effective, invalid },
      });
    } catch (error) {
      const response = policyErrorResponse(error);
      if (response) return response;
      throw error;
    }
  },
  undefined,
  "game/universes:character-species:get",
  { bodyParser: "none" },
);

export const PUT = withAuth(
  async (body, user, _request, context) => {
    const universeId = String(context.params?.universeId || "").trim();
    if (!universeId || universeId.length > 80) {
      return NextResponse.json(
        { ok: false, error: "universe_id_required", errorCode: "UNIVERSE_ID_REQUIRED" },
        { status: 400 },
      );
    }

    const data = toUnknownRecord(body);
    const keys = Object.keys(data);
    if (keys.length !== 1 || keys[0] !== "characterSpeciesMode") {
      return NextResponse.json(
        {
          ok: false,
          error: "universe_species_edit_fields_invalid",
          errorCode: "UNIVERSE_SPECIES_EDIT_FIELDS_INVALID",
        },
        { status: 400 },
      );
    }

    const rawMode = data.characterSpeciesMode;
    if (typeof rawMode !== "string" || !CHARACTER_SPECIES_MODES.includes(rawMode as CharacterSpeciesMode)) {
      return NextResponse.json(
        { ok: false, error: "universe_species_mode_invalid", errorCode: "UNIVERSE_SPECIES_MODE_INVALID" },
        { status: 400 },
      );
    }

    try {
      const { role } = await resolveSpeciesEditorAccess(user, universeId);
      if (!hasSpeciesEditRole(role)) {
        return NextResponse.json(
          { ok: false, error: "universe_species_edit_forbidden", errorCode: "UNIVERSE_SPECIES_EDIT_FORBIDDEN" },
          { status: 403 },
        );
      }

      const beforeDetail = await getUniverseDetail(universeId);
      const before = beforeDetail?.settings?.game?.characterSpeciesMode ?? null;
      const savedDetail = await setUniverseCharacterSpeciesMode(universeId, rawMode as CharacterSpeciesMode);
      const after = savedDetail.settings?.game?.characterSpeciesMode ?? rawMode;

      try {
        await redisCache.invalidateByTag(CacheKeyManager.universe.tag(universeId));
        await redisCache.invalidateByTag(CacheKeyManager.universe.tagDetails(universeId));
        invalidateUniverseDetailPromptCache(universeId);
      } catch (error) {
        logger.warn("캐릭터 종족 설정 캐시 무효화 경고:", { universeId, error });
      }

      logger.info("캐릭터 종족 설정 업데이트 성공", {
        uid: getAuthenticatedUid(user),
        universeId,
        before,
        after,
      });

      return NextResponse.json({
        ok: true,
        data: {
          characterSpeciesMode: after,
          effective: resolveCharacterSpeciesPolicy(after),
          invalid: false,
        },
      });
    } catch (error) {
      const response = policyErrorResponse(error);
      if (response) return response;
      throw error;
    }
  },
  undefined,
  "game/universes:character-species:put",
);
