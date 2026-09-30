import { NextResponse } from "next/server";
import { USER_ROLES } from "consts/auth";
import { listSpriteActions, upsertSpriteAction } from "libs/database/game";
import { getUniverseById } from "libs/database/universe";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { normalizeString } from "libs/server-utils/api/apiSafetyHelper";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import { canEditUniverse, getUserRole } from "libs/server-utils/auth/userRoleUtils";
import { getAuthenticatedUid } from "libs/server-utils/lab/imageAssetAccess";
import {
  SPRITE_ACTION_SCOPES,
  type SpriteActionLocalizedTextType,
  type SpriteActionScopeType,
} from "types/game/sprite-action";
import { logger } from "utils/log";
import { MOTION_GUIDE_VERSION } from "consts/game/motionGuideSkeletons";
import { SPRITE_FRAME_COUNTS } from "consts/game/gameAssetTemplates";

export const runtime = "nodejs";

const SCOPE_SET = new Set<string>(SPRITE_ACTION_SCOPES);

function normalizeActionKey(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function localizedText(value: unknown, fallback = ""): SpriteActionLocalizedTextType {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const ko = normalizeString(record.ko || fallback).slice(0, 80);
  const en = normalizeString(record.en || ko || fallback).slice(0, 80);
  return { ko, en };
}

export const GET = withAuth(
  async (_body, user, request) => {
    try {
      const uid = getAuthenticatedUid(user as AuthenticatedUserType);
      const { searchParams } = new URL(request.url);
      const universeId = normalizeString(searchParams.get("universeId"));
      if (universeId) {
        const universe = await getUniverseById(universeId);
        if (!universe || !canEditUniverse(user, universe)) {
          return NextResponse.json(
            { ok: false, error: "universe_sprite_actions_forbidden", errorCode: "UNIVERSE_SPRITE_ACTIONS_FORBIDDEN" },
            { status: 403 },
          );
        }
      }
      const data = await listSpriteActions({
        ownerId: uid,
        universeId,
      });
      return NextResponse.json({ ok: true, data }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      logger.error("[SpriteActions][GET] failed:", error);
      return NextResponse.json({ ok: false, error: "sprite_actions_list_failed" }, { status: 500 });
    }
  },
  undefined,
  "game/sprite-actions:list",
  { bodyParser: "none" },
);

export const POST = withAuth(
  async (body, user) => {
    try {
      const uid = getAuthenticatedUid(user as AuthenticatedUserType);
      const scopeRaw = normalizeString(body?.scope) || "user";
      const scope = (SCOPE_SET.has(scopeRaw) ? scopeRaw : "") as SpriteActionScopeType;
      const isAdmin = getUserRole(user).includes(USER_ROLES.ADMINISTRATOR);
      const universeId = normalizeString(body?.universeId);
      const rawActionKey = normalizeString(body?.actionKey);
      const actionKey = normalizeActionKey(rawActionKey);
      const label = localizedText(body?.label);
      const motionAction = normalizeString(body?.motionAction).slice(0, 500);
      const motionSequence = normalizeString(body?.motionSequence).slice(0, 500);

      if (
        !uid ||
        !scope ||
        !/^[a-z0-9][a-z0-9_-]{0,47}$/i.test(rawActionKey) ||
        !label.ko ||
        !motionAction ||
        !motionSequence
      ) {
        return NextResponse.json(
          { ok: false, error: "sprite_action_payload_invalid", errorCode: "SPRITE_ACTION_PAYLOAD_INVALID" },
          { status: 400 },
        );
      }
      if (scope === "system" && !isAdmin) {
        return NextResponse.json(
          { ok: false, error: "system_sprite_action_forbidden", errorCode: "SYSTEM_SPRITE_ACTION_FORBIDDEN" },
          { status: 403 },
        );
      }
      if (scope === "universe" && (!isAdmin || !universeId)) {
        return NextResponse.json(
          { ok: false, error: "universe_sprite_action_forbidden", errorCode: "UNIVERSE_SPRITE_ACTION_FORBIDDEN" },
          { status: 403 },
        );
      }

      const ownerId = scope === "system" ? "system" : scope === "universe" ? universeId : uid;
      const description = localizedText(body?.description, motionAction);
      const requestedMotionGuideVersion = Math.max(0, Math.min(1000, Math.round(Number(body?.motionGuideVersion || 0))));
      const requestedFrameCount = Math.round(Number(body?.frameCount || 4));
      if (isAdmin && !(SPRITE_FRAME_COUNTS as readonly number[]).includes(requestedFrameCount)) {
        return NextResponse.json(
          { ok: false, error: "sprite_frame_count_invalid", errorCode: "SPRITE_FRAME_COUNT_INVALID" },
          { status: 400 },
        );
      }
      if (scope === "system" && ![0, MOTION_GUIDE_VERSION].includes(requestedMotionGuideVersion)) {
        return NextResponse.json(
          { ok: false, error: "motion_guide_version_invalid", errorCode: "MOTION_GUIDE_VERSION_INVALID" },
          { status: 400 },
        );
      }
      const data = await upsertSpriteAction({
        actionKey,
        label,
        description,
        motionAction,
        motionSequence,
        fps: Math.max(1, Math.min(24, Math.round(Number(body?.fps || 8)))),
        loop: body?.loop === true,
        frameCount: isAdmin ? requestedFrameCount : 4,
        symmetryEligible: body?.loop === true && body?.symmetryEligible === true,
        motionGuideVersion: scope === "system" && isAdmin ? requestedMotionGuideVersion : 0,
        scope,
        ownerId,
        universeId: scope === "universe" ? universeId : "",
      });
      return NextResponse.json({ ok: true, data }, { status: 201 });
    } catch (error) {
      logger.error("[SpriteActions][POST] failed:", error);
      return NextResponse.json({ ok: false, error: "sprite_action_save_failed" }, { status: 500 });
    }
  },
  undefined,
  "game/sprite-actions:save",
);
