import { NextResponse } from "next/server";
import { getNpcIntimacyForUser } from "libs/database/game";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { normalizeString } from "libs/server-utils/api/apiSafetyHelper";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import { getAuthenticatedUid } from "libs/server-utils/lab/imageAssetAccess";
import { logger } from "utils/log";

export const runtime = "nodejs";

/**
 * @docHint
 * @purpose 로그인 사용자의 특정 NPC 발견·친밀도와 일일 증가 상태 조회
 * @process 인증  npcId 형식 검증  인증 uid 범위 Mongo 조회  안전 DTO 반환
 * @domain game.npc-intimacy
 * @scope user-api
 */

const NPC_ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,119}$/i;

export const GET = withAuth(
  async (_body, user, request) => {
    try {
      const uid = getAuthenticatedUid(user as AuthenticatedUserType);
      const { searchParams } = new URL(request.url);
      const npcId = normalizeString(searchParams.get("npcId"));

      if (!uid) {
        return NextResponse.json(
          { ok: false, error: "unauthorized", errorCode: "UNAUTHORIZED" },
          { status: 401 },
        );
      }
      if (!NPC_ID_PATTERN.test(npcId)) {
        return NextResponse.json(
          { ok: false, error: "npc_id_invalid", errorCode: "NPC_ID_INVALID" },
          { status: 400 },
        );
      }

      const intimacy = await getNpcIntimacyForUser({ uid, npcId });
      return NextResponse.json({ ok: true, data: intimacy });
    } catch (error) {
      logger.error("[NpcIntimacy][GET] failed:", error);
      return NextResponse.json(
        { ok: false, error: "npc_intimacy_read_failed", errorCode: "NPC_INTIMACY_READ_FAILED" },
        { status: 500 },
      );
    }
  },
  undefined,
  "game/npc/intimacy:read",
  { bodyParser: "none" },
);
