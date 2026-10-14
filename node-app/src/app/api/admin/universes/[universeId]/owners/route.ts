import { NextResponse } from "next/server";
import { UNIVERSE_OWNER_UIDS_MAX } from "consts/game/characterGenesisPolicy";
import CacheKeyManager from "libs/cache/cacheKeyManager";
import { redisCache } from "libs/cache/redisCacheService";
import { getUniverseById } from "libs/database/universe";
import { setUniverseOwnerUids } from "libs/database/universe/universe";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import { getAuthenticatedUid } from "libs/server-utils/lab/imageAssetAccess";
import { resolveEmailsByUids, resolveUidsByEmails } from "libs/server-utils/universe/universeOwnerAdmin";
import { logger } from "utils/log";
import { toUnknownRecord } from "utils/common/typeUtils";

export const runtime = "nodejs";

/**
 * @docHint
 * @purpose administrator 전용 game Universe 공동 owner 배정 관리
 * @process 이메일을 서버 UID로 해석하고 ownerUids만 저장한 뒤 Universe 목록 캐시를 무효화
 * @domain universe
 * @scope admin-api
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function loadGameUniverse(universeId: string) {
  const universe = await getUniverseById(universeId);
  if (!universe) {
    return {
      universe: null,
      response: NextResponse.json(
        { ok: false, error: "universe_not_found", errorCode: "UNIVERSE_NOT_FOUND" },
        { status: 404 },
      ),
    };
  }
  if (universe.type !== "game") {
    return {
      universe: null,
      response: NextResponse.json(
        { ok: false, error: "universe_owner_type_invalid", errorCode: "UNIVERSE_OWNER_TYPE_INVALID" },
        { status: 400 },
      ),
    };
  }
  return { universe, response: null };
}

export const GET = withAuth(
  async (_body, _user, _request, context) => {
    const universeId = String(context.params?.universeId || "").trim();
    if (!universeId || universeId.length > 80) {
      return NextResponse.json(
        { ok: false, error: "universe_id_required", errorCode: "UNIVERSE_ID_REQUIRED" },
        { status: 400 },
      );
    }

    try {
      const { universe, response } = await loadGameUniverse(universeId);
      if (response) return response;

      const ownerUids = universe?.ownerUids || [];
      const emailByUid = await resolveEmailsByUids(ownerUids);
      return NextResponse.json({
        ok: true,
        data: ownerUids.map((uid) => ({ uid, email: emailByUid.get(uid) || null })),
      });
    } catch {
      logger.error("Universe owner 목록 조회 실패:", { universeId });
      return NextResponse.json(
        { ok: false, error: "universe_owner_read_failed", errorCode: "UNIVERSE_OWNER_READ_FAILED" },
        { status: 500 },
      );
    }
  },
  undefined,
  "admin/universes:owners:get",
  { requireAdmin: true, bodyParser: "none" },
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
    const rawEmails = data.ownerEmails;
    if (
      Object.keys(data).length !== 1 ||
      !Array.isArray(rawEmails) ||
      rawEmails.length > UNIVERSE_OWNER_UIDS_MAX ||
      rawEmails.some((email) =>
        typeof email !== "string" ||
        email.trim().length > 254 ||
        !EMAIL_PATTERN.test(email.trim()),
      )
    ) {
      return NextResponse.json(
        { ok: false, error: "universe_owner_input_invalid", errorCode: "UNIVERSE_OWNER_INPUT_INVALID" },
        { status: 400 },
      );
    }

    try {
      const { response } = await loadGameUniverse(universeId);
      if (response) return response;

      const { uids, unresolvedCount } = await resolveUidsByEmails(rawEmails as string[]);
      if (unresolvedCount > 0) {
        return NextResponse.json(
          {
            ok: false,
            error: "universe_owner_email_unresolved",
            errorCode: "UNIVERSE_OWNER_EMAIL_UNRESOLVED",
            unresolvedCount,
          },
          { status: 400 },
        );
      }

      await setUniverseOwnerUids(universeId, uids);
      try {
        await redisCache.invalidateByTag(CacheKeyManager.universe.tag(universeId));
        await redisCache.invalidateByTag(CacheKeyManager.universe.tagList());
      } catch (error) {
        logger.warn("Universe owner 캐시 무효화 경고:", { universeId, error });
      }

      let emailByUid = new Map<string, string>();
      try {
        emailByUid = await resolveEmailsByUids(uids);
      } catch {
        logger.warn("Universe owner 이메일 표시 조회 실패:", { universeId, uidCount: uids.length });
      }
      logger.info("Universe owner 배정 업데이트 성공", {
        uidCount: uids.length,
        universeId,
        adminUid: getAuthenticatedUid(user as AuthenticatedUserType),
      });
      return NextResponse.json({
        ok: true,
        data: uids.map((uid) => ({ uid, email: emailByUid.get(uid) || null })),
      });
    } catch {
      logger.error("Universe owner 배정 업데이트 실패:", { universeId });
      return NextResponse.json(
        { ok: false, error: "universe_owner_update_failed", errorCode: "UNIVERSE_OWNER_UPDATE_FAILED" },
        { status: 500 },
      );
    }
  },
  undefined,
  "admin/universes:owners:put",
  { requireAdmin: true },
);
