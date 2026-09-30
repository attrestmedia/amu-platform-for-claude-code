import { NextResponse } from "next/server";
import {
  MOTION_GUIDE_ACTION_KEYS,
  MOTION_GUIDE_FRAME_COUNT,
  MOTION_GUIDE_FRAME_COUNTS,
  MOTION_GUIDE_MVP_DIRECTIONS,
  MOTION_GUIDE_VERSION,
  type MotionGuideActionKeyType,
  type MotionGuideFrameCountType,
} from "consts/game/motionGuideSkeletons";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { normalizeString } from "libs/server-utils/api/apiSafetyHelper";
import {
  isMotionGuideActionKey,
  isMotionGuideDirection,
  listMotionGuides,
  persistMotionGuide,
} from "libs/server-utils/game/motionGuideRenderer";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import type { SpriteDirectionType } from "types/game";
import { logger } from "utils/log";

export const runtime = "nodejs";
export const maxDuration = 60;

function compactArray<T extends string>(value: unknown, guard: (item: unknown) => item is T) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const normalized = value.map((item) => normalizeString(item));
  if (!normalized.every(guard)) return null;
  return Array.from(new Set(normalized));
}

function getUpdatedBy(user: AuthenticatedUserType) {
  return normalizeString(user?.userEmailLower || user?.userEmail || user?.email || user?.ID || "administrator");
}

export const GET = withAuth(
  async (_body, _user, request) => {
    try {
      const { searchParams } = new URL(request.url);
      const actionKeys = searchParams.getAll("actionKey").filter(isMotionGuideActionKey);
      const directions = searchParams.getAll("direction").filter(isMotionGuideDirection);
      const version = Math.max(0, Math.round(Number(searchParams.get("version") || 0)));
      const frameCountParam = searchParams.get("frameCount");
      const frameCount = Math.round(Number(frameCountParam || MOTION_GUIDE_FRAME_COUNT));
      if (frameCountParam && !(MOTION_GUIDE_FRAME_COUNTS as readonly number[]).includes(frameCount)) {
        return NextResponse.json(
          { ok: false, error: "motion_guide_profile_not_enabled", errorCode: "MOTION_GUIDE_PROFILE_NOT_ENABLED" },
          { status: 400 },
        );
      }
      const data = await listMotionGuides({
        actionKeys,
        directions,
        version: version || undefined,
        frameCount,
      });
      return NextResponse.json({ ok: true, data }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      logger.error("[MotionGuides][GET] failed:", error);
      return NextResponse.json({ ok: false, error: "motion_guides_list_failed" }, { status: 500 });
    }
  },
  undefined,
  "game/motion-guides:list",
  { requireAdmin: true, bodyParser: "none" },
);

export const POST = withAuth(
  async (body, user) => {
    try {
      const requestedActions = compactArray<MotionGuideActionKeyType>(body?.actionKeys, isMotionGuideActionKey);
      const requestedDirections = compactArray<SpriteDirectionType>(body?.directions, isMotionGuideDirection);
      if (!requestedActions || !requestedDirections) {
        return NextResponse.json(
          { ok: false, error: "motion_guide_matrix_invalid", errorCode: "MOTION_GUIDE_MATRIX_INVALID" },
          { status: 400 },
        );
      }
      const actionKeys = requestedActions.length ? requestedActions : [...MOTION_GUIDE_ACTION_KEYS];
      const directions = requestedDirections.length ? requestedDirections : [...MOTION_GUIDE_MVP_DIRECTIONS];
      const version = Math.round(Number(body?.version || MOTION_GUIDE_VERSION));
      const frameCount = Math.round(Number(body?.frameCount || MOTION_GUIDE_FRAME_COUNT));
      if (version !== MOTION_GUIDE_VERSION || !(MOTION_GUIDE_FRAME_COUNTS as readonly number[]).includes(frameCount)) {
        return NextResponse.json(
          { ok: false, error: "motion_guide_profile_not_enabled", errorCode: "MOTION_GUIDE_PROFILE_NOT_ENABLED" },
          { status: 400 },
        );
      }
      const enabledFrameCount = frameCount as MotionGuideFrameCountType;

      const data = [];
      for (const actionKey of actionKeys) {
        for (const direction of directions) {
          const result = await persistMotionGuide({
            actionKey,
            direction,
            version,
            frameCount: enabledFrameCount,
            updatedBy: getUpdatedBy(user as AuthenticatedUserType),
          });
          data.push({ ...result.ref, created: result.created });
        }
      }
      return NextResponse.json({
        ok: true,
        data,
        summary: {
          total: data.length,
          created: data.filter((item) => item.created).length,
          reused: data.filter((item) => !item.created).length,
        },
      });
    } catch (error) {
      logger.error("[MotionGuides][POST] failed:", error);
      const message = error instanceof Error ? error.message : "motion_guides_generate_failed";
      const conflict = message.includes("version_conflict");
      return NextResponse.json(
        { ok: false, error: message, errorCode: conflict ? "MOTION_GUIDE_VERSION_CONFLICT" : "MOTION_GUIDES_GENERATE_FAILED" },
        { status: conflict ? 409 : 500 },
      );
    }
  },
  undefined,
  "game/motion-guides:generate",
  { requireAdmin: true },
);
