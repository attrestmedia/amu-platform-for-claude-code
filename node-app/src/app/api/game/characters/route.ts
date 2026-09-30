import crypto from "crypto";
import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { normalizeString } from "libs/server-utils/api/apiSafetyHelper";
import { getImageAssetByAssetId, getImageAssetByStorageUrl } from "libs/database/lab";
import {
  getCharacterReferenceKitByKitId,
  markCharacterReferenceKitUsedByPlayPersona,
} from "libs/database/character/referenceKitRepo";
import { listPersonaImageLibraryAssets } from "libs/database/personaImageLibraryRepo";
import {
  getUserGameCharacterByIdempotencyKey,
  listUserGameCharacterFailedAnchorIds,
  listUserGameCharacters,
} from "libs/database/game";
import {
  canAccessImageAsset,
  getAuthenticatedUid,
  isAuthenticatedAdmin,
} from "libs/server-utils/lab/imageAssetAccess";
import { canAccessCharacterReferenceKit } from "libs/server-utils/character/referenceKitAccess";
import { getUniverseById } from "libs/database/universe";
import {
  findEntityNameConflict,
  releasePersonaName,
  reservePersonaName,
  resolveUserNameKey,
} from "libs/server-utils/persona/entityNameUniqueness";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import {
  USER_GAME_CHARACTER_SOURCE_TYPES,
  USER_GAME_CHARACTER_STATUSES,
  type UserGameCharacterSourceType,
  type UserGameCharacterStatusType,
} from "types/game/user-game-character";
import { logger } from "utils/log";
import { toUnknownRecord } from "utils/common/typeUtils";
import { listSelectableUserGameCharacters } from "libs/server-utils/game/userGameCharacterRuntime";
import { createUserCharacterWithGenesis } from "libs/server-utils/game/characterCreationSaga";
import { resolveTutorPersonaReadAccess } from "libs/services/tutors/tutorGiftGrants";

export const runtime = "nodejs";

/**
 * @docHint
 * @purpose 로그인 사용자의 게임 캐릭터 draft를 소유 이미지로 멱등 생성하고 내 캐릭터만 조회
 * @process 인증  입력/이미지 소유권 검증  서버 멱등 키 생성  draft 원장 생성 또는 owner 목록 반환
 * @domain game.user-character
 * @scope user-api
 */

const TEMPLATE_VERSION = 2;
const SOURCE_TYPE_SET = new Set<string>(USER_GAME_CHARACTER_SOURCE_TYPES);
const STATUS_SET = new Set<string>(USER_GAME_CHARACTER_STATUSES);

function buildIdempotencyKey(uid: string, sourceImageRef: string) {
  return crypto
    .createHash("sha256")
    .update(`user-game-character|${uid}|${sourceImageRef.toLowerCase()}|v${TEMPLATE_VERSION}`)
    .digest("hex");
}

export const POST = withAuth(
  async (body, user) => {
    try {
      const uid = getAuthenticatedUid(user as AuthenticatedUserType);
      const universeId = normalizeString(body?.universeId);
      const name = normalizeString(body?.name);
      let sourceImageAssetId = normalizeString(body?.sourceImageAssetId);
      const sourceTypeRaw = normalizeString(body?.sourceType);
      const sourcePersonaId = normalizeString(body?.sourcePersonaId);
      const sourceReferenceKitId = normalizeString(body?.sourceReferenceKitId);
      const sourceImageUrl = normalizeString(body?.sourceImageUrl);
      const requestedSpeciesId = normalizeString(body?.speciesId).toLowerCase();
      const primaryAttributeId = normalizeString(body?.primaryAttributeId).toLowerCase();
      const archetypeId = normalizeString(body?.archetypeId).toLowerCase();

      if (!uid) {
        return NextResponse.json({ ok: false, error: "unauthorized", errorCode: "UNAUTHORIZED" }, { status: 401 });
      }
      if (
        !universeId ||
        universeId.length > 80 ||
        !name ||
        name.length > 40 ||
        (!sourceImageAssetId && sourceTypeRaw !== "tutors-profile")
      ) {
        return NextResponse.json(
          { ok: false, error: "character_input_invalid", errorCode: "CHARACTER_INPUT_INVALID" },
          { status: 400 },
        );
      }
      if (!SOURCE_TYPE_SET.has(sourceTypeRaw)) {
        return NextResponse.json(
          { ok: false, error: "character_source_type_invalid", errorCode: "CHARACTER_SOURCE_TYPE_INVALID" },
          { status: 400 },
        );
      }

      let sourceReferenceKit: Awaited<ReturnType<typeof getCharacterReferenceKitByKitId>> = null;
      if (sourceTypeRaw === "reference-kit") {
        if (!isAuthenticatedAdmin(user as AuthenticatedUserType)) {
          return NextResponse.json(
            { ok: false, error: "reference_kit_source_forbidden", errorCode: "REFERENCE_KIT_SOURCE_FORBIDDEN" },
            { status: 403 },
          );
        }
        if (!sourceReferenceKitId) {
          return NextResponse.json(
            { ok: false, error: "reference_kit_source_invalid", errorCode: "REFERENCE_KIT_SOURCE_INVALID" },
            { status: 400 },
          );
        }
        sourceReferenceKit = await getCharacterReferenceKitByKitId(sourceReferenceKitId);
        if (!sourceReferenceKit || String(sourceReferenceKit.status || "") === "archived") {
          return NextResponse.json(
            { ok: false, error: "reference_kit_source_unavailable", errorCode: "REFERENCE_KIT_SOURCE_UNAVAILABLE" },
            { status: 404 },
          );
        }

        // ASH-17 5단계 — `킷.universeId === 캐릭터.universeId` 동일성 검사를
        // '킷 접근 가능(select) + 대상 유니버스 플레이 가능'으로 대체한다. 허용된 킷이면 다른 유니버스에서도 성립한다.
        // administrator 게이트(위)는 유지한다 — 권한 완화는 사용자 승인 대상이다(ROUND §1 판정 1).
        const kitSelectable = await canAccessCharacterReferenceKit(user as AuthenticatedUserType, sourceReferenceKit, {
          universeId,
          purpose: "select",
        });
        // 대상 유니버스에서 플레이 가능해야 한다 — 유니버스 실재 + `enabled !== false` (ROUND §1 판정 3, fail-closed).
        const targetUniverse = await getUniverseById(universeId);
        if (!kitSelectable || !targetUniverse || targetUniverse.enabled === false) {
          return NextResponse.json(
            { ok: false, error: "reference_kit_source_unavailable", errorCode: "REFERENCE_KIT_SOURCE_UNAVAILABLE" },
            { status: 404 },
          );
        }

        const kitImages = toUnknownRecord(sourceReferenceKit.images);
        const anchorImage = [kitImages.profile, kitImages.frontFullBody]
          .map((image) => toUnknownRecord(image))
          .find((image) => String(image.assetId || "").trim() === sourceImageAssetId);
        if (!anchorImage) {
          return NextResponse.json(
            { ok: false, error: "reference_kit_anchor_invalid", errorCode: "REFERENCE_KIT_ANCHOR_INVALID" },
            { status: 400 },
          );
        }
      } else if (sourceReferenceKitId) {
        return NextResponse.json(
          { ok: false, error: "reference_kit_source_mismatch", errorCode: "REFERENCE_KIT_SOURCE_MISMATCH" },
          { status: 400 },
        );
      }

      let sourcePersonaType: "human" | "monster" | "" = "";
      if (sourceTypeRaw === "tutors-profile" && sourcePersonaId) {
        const resolvedTutor = await resolveTutorPersonaReadAccess(user as AuthenticatedUserType, sourcePersonaId);
        if (!resolvedTutor.persona || !resolvedTutor.access) {
          return NextResponse.json(
            { ok: false, error: "tutors_profile_source_forbidden", errorCode: "TUTORS_PROFILE_SOURCE_FORBIDDEN" },
            { status: 403 },
          );
        }
        sourcePersonaType = resolvedTutor.persona.personaType === "monster" ? "monster" : "human";
      }

      if (sourceTypeRaw === "tutors-profile" && !sourceImageAssetId) {
        if (!sourcePersonaId || !sourceImageUrl) {
          return NextResponse.json(
            { ok: false, error: "tutors_profile_source_invalid", errorCode: "TUTORS_PROFILE_SOURCE_INVALID" },
            { status: 400 },
          );
        }
        const libraryAssets = await listPersonaImageLibraryAssets({
          uid,
          personaId: sourcePersonaId,
          status: "active",
          limit: 40,
        });
        const libraryAsset = libraryAssets.find(
          (item) => String(item.storage?.optimizedUrl || "").trim() === sourceImageUrl,
        );
        const originalUrl = String(libraryAsset?.storage?.originalUrl || "").trim();
        const originalAsset = originalUrl ? await getImageAssetByStorageUrl(originalUrl) : null;
        sourceImageAssetId = String(originalAsset?.assetId || "").trim();
        if (!sourceImageAssetId) {
          return NextResponse.json(
            {
              ok: false,
              error: "tutors_profile_source_unresolvable",
              errorCode: "TUTORS_PROFILE_SOURCE_UNRESOLVABLE",
            },
            { status: 422 },
          );
        }
      }

      const asset = await getImageAssetByAssetId(sourceImageAssetId);
      if (!asset || String(asset.state || "") !== "active" || asset.hardDeletedAt) {
        return NextResponse.json(
          { ok: false, error: "source_image_unavailable", errorCode: "SOURCE_IMAGE_UNAVAILABLE" },
          { status: 404 },
        );
      }
      if (!(await canAccessImageAsset(user as AuthenticatedUserType, asset))) {
        return NextResponse.json(
          { ok: false, error: "source_image_forbidden", errorCode: "SOURCE_IMAGE_FORBIDDEN" },
          { status: 403 },
        );
      }

      const speciesId = sourcePersonaType || (requestedSpeciesId === "monster" ? "monster" : "human");
      if (requestedSpeciesId && requestedSpeciesId !== "human" && requestedSpeciesId !== "monster") {
        return NextResponse.json(
          { ok: false, error: "character_species_invalid", errorCode: "CHARACTER_SPECIES_INVALID" },
          { status: 400 },
        );
      }
      if (sourcePersonaType && requestedSpeciesId && sourcePersonaType !== requestedSpeciesId) {
        return NextResponse.json(
          { ok: false, error: "source_species_conflict", errorCode: "SOURCE_SPECIES_CONFLICT" },
          { status: 409 },
        );
      }

      const sourceImageRef =
        normalizeString(toUnknownRecord(asset.storage).sha256) || normalizeString(asset.assetId);
      if (!sourceImageRef) {
        return NextResponse.json(
          { ok: false, error: "source_image_ref_missing", errorCode: "SOURCE_IMAGE_REF_MISSING" },
          { status: 422 },
        );
      }

      const userKey = resolveUserNameKey(user);
      const idempotencyKey = buildIdempotencyKey(uid, sourceImageRef);

      // 멱등 재시도/재활성화 여부를 먼저 확인한다. 같은 idempotencyKey의 캐릭터가 이미 있으면
      // 이름은 최초 생성 시 이미 예약되어 있으므로 새로 예약하지 않고 기존 결과를 반환한다.
      const existingByIdempotency = await getUserGameCharacterByIdempotencyKey({ uid, idempotencyKey });

      let reservedCharacterId = "";
      if (!existingByIdempotency) {
        // 이름 중복 검증(사전): 사용자 네임스페이스(튜터/캐릭터 공통)에서 이미 사용 중인 이름인지 확인한다.
        const nameConflict = await findEntityNameConflict({ userKey, name });
        if (nameConflict.taken) {
          return NextResponse.json(
            {
              ok: false,
              error: "character_name_taken",
              errorCode: "CHARACTER_NAME_TAKEN",
              conflictScope: nameConflict.scope,
            },
            { status: 409 },
          );
        }

        // 캐릭터 원장 생성 전에 이름을 예약한다 (authoritative).
        // unique(userKey, normalizedName) 인덱스가 동시 요청 race까지 방지한다.
        reservedCharacterId = `ugc_${crypto.randomUUID().replace(/-/g, "")}`;
        const reserve = await reservePersonaName({
          userKey,
          name,
          personaId: reservedCharacterId,
          personaType: "play",
        });
        if (!reserve.ok) {
          return NextResponse.json(
            {
              ok: false,
              error: "character_name_taken",
              errorCode: "CHARACTER_NAME_TAKEN",
              conflictScope: reserve.conflict.personaType || "play",
            },
            { status: 409 },
          );
        }
      }

      let result: Awaited<ReturnType<typeof createUserCharacterWithGenesis>>;
      try {
        result = await createUserCharacterWithGenesis({
          uid,
          universeId,
          name,
          sourceType: sourceTypeRaw as UserGameCharacterSourceType,
          sourceImageRef,
          sourceImageAssetId,
          sourcePersonaId,
          sourceReferenceKitId: sourceReferenceKit?.kitId || "",
          speciesId,
          primaryAttributeId: primaryAttributeId || undefined,
          archetypeId: archetypeId || undefined,
          templateVersion: TEMPLATE_VERSION,
          idempotencyKey,
          ...(reservedCharacterId ? { characterId: reservedCharacterId } : {}),
        });
      } catch (error) {
        // saga가 논리 캐릭터를 만든 뒤 실패한 경우에는 이름을 유지해야 재시도가 같은 소유권을 갖는다.
        const existingAfterFailure = reservedCharacterId
          ? await getUserGameCharacterByIdempotencyKey({ uid, idempotencyKey }).catch(() => null)
          : null;
        if (reservedCharacterId && !existingAfterFailure) {
          await releasePersonaName({ userKey, personaId: reservedCharacterId }).catch(() => null);
        }
        throw error;
      }

      if (sourceReferenceKit) {
        const personaPid = String(result.character.personaId || result.character.characterId).trim();
        await markCharacterReferenceKitUsedByPlayPersona({
          kitId: sourceReferenceKit.kitId,
          universeId,
          personaPid,
          updatedBy: uid,
        });
      }

      // race로 다른 요청이 같은 idempotencyKey를 선점해 우리가 예약한 characterId가
      // 실제 생성에 사용되지 않은 경우, 해당 이름 예약을 해제한다.
      if (reservedCharacterId && !result.created) {
        await releasePersonaName({ userKey, personaId: reservedCharacterId }).catch(() => null);
      }

      return NextResponse.json({ ok: true, data: result }, { status: result.created ? 201 : 200 });
    } catch (error) {
      logger.error("[UserGameCharacter][POST] failed:", error);
      return NextResponse.json(
        { ok: false, error: "character_create_failed", errorCode: "CHARACTER_CREATE_FAILED" },
        { status: 500 },
      );
    }
  },
  undefined,
  "game/characters:create",
);

export const GET = withAuth(
  async (_body, user, request) => {
    try {
      const uid = getAuthenticatedUid(user as AuthenticatedUserType);
      const { searchParams } = new URL(request.url);
      const status = normalizeString(searchParams.get("status"));
      const universeId = normalizeString(searchParams.get("universeId"));
      const limit = Number(searchParams.get("limit") || 20);
      if (normalizeString(searchParams.get("view")) === "failed-anchors") {
        const failedAnchorIds = await listUserGameCharacterFailedAnchorIds({ uid, universeId });
        return NextResponse.json({ ok: true, data: failedAnchorIds });
      }
      if (normalizeString(searchParams.get("view")) === "selectable") {
        if (!universeId) {
          return NextResponse.json(
            { ok: false, error: "universe_id_required", errorCode: "UNIVERSE_ID_REQUIRED" },
            { status: 400 },
          );
        }
        const selectable = await listSelectableUserGameCharacters({
          uid,
          universeId,
          limit,
        });
        return NextResponse.json({ ok: true, data: selectable });
      }
      const characters = await listUserGameCharacters({
        uid,
        universeId,
        status: STATUS_SET.has(status) ? (status as UserGameCharacterStatusType) : undefined,
        limit,
      });
      return NextResponse.json({ ok: true, data: characters });
    } catch (error) {
      logger.error("[UserGameCharacter][GET] failed:", error);
      return NextResponse.json(
        { ok: false, error: "character_list_failed", errorCode: "CHARACTER_LIST_FAILED" },
        { status: 500 },
      );
    }
  },
  undefined,
  "game/characters:list",
  { bodyParser: "none" },
);
