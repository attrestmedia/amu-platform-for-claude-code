import { NextResponse } from "next/server";
import { reportAndDisableUserGameCharacterAtomic } from "libs/database/game";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { normalizeString } from "libs/server-utils/api/apiSafetyHelper";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import {
  getAuthenticatedUid,
  isAuthenticatedAdmin,
} from "libs/server-utils/lab/imageAssetAccess";
import {
  USER_GAME_CHARACTER_REPORT_REASONS,
  type UserGameCharacterReportReasonType,
} from "types/game/user-game-character";
import { logger } from "utils/log";

export const runtime = "nodejs";

type RouteParams = { characterId: string };

const REPORT_REASON_SET = new Set<string>(USER_GAME_CHARACTER_REPORT_REASONS);

/**
 * @docHint
 * @purpose owner-private 사용자 캐릭터의 안전 신고를 감사 필드와 함께 즉시 비활성화
 * @process 인증  owner/admin 권한  reason 검증  disabled+rejected 원자 전이
 * @domain game.user-character.moderation
 * @scope user-api
 */
export const POST = withAuth(
  async (body, user, _request, { params }: { params: Promise<RouteParams> }) => {
    try {
      const authenticatedUser = user as AuthenticatedUserType;
      const uid = getAuthenticatedUid(authenticatedUser);
      const { characterId } = await params;
      const reason = normalizeString(body?.reason);
      const note = normalizeString(body?.note);

      if (!REPORT_REASON_SET.has(reason)) {
        return NextResponse.json(
          { ok: false, error: "character_report_reason_invalid", errorCode: "CHARACTER_REPORT_REASON_INVALID" },
          { status: 400 },
        );
      }
      if (note.length > 240) {
        return NextResponse.json(
          { ok: false, error: "character_report_note_too_long", errorCode: "CHARACTER_REPORT_NOTE_TOO_LONG" },
          { status: 400 },
        );
      }

      const result = await reportAndDisableUserGameCharacterAtomic({
        actorUid: uid,
        characterId,
        reason: reason as UserGameCharacterReportReasonType,
        note,
        canModerateAnyOwner: isAuthenticatedAdmin(authenticatedUser),
      });
      if (!result) {
        return NextResponse.json(
          { ok: false, error: "character_not_found", errorCode: "CHARACTER_NOT_FOUND" },
          { status: 404 },
        );
      }
      return NextResponse.json({ ok: true, data: result });
    } catch (error) {
      logger.error("[UserGameCharacterReport][POST] failed:", error);
      return NextResponse.json(
        { ok: false, error: "character_report_failed", errorCode: "CHARACTER_REPORT_FAILED" },
        { status: 500 },
      );
    }
  },
  undefined,
  "game/characters/report:create",
);
