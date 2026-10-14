import { NextResponse } from "next/server";
import { STORY_FEATURE_KEYS } from "consts/system/featureRollout";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import {
  chooseInteractiveStory,
  getInteractiveStoryRuntime,
  startInteractiveStory,
} from "libs/server-utils/story/interactiveStoryRuntime";
import { toUnknownRecord } from "utils/common";

export const runtime = "nodejs";

/**
 * @docHint
 * @purpose Admin-only Interactive Story 조회·시작·선택 API
 * @process feature gate  입력 allowlist  서버 소유 Narrative transition  no-store 응답
 * @domain interactive-story
 * @scope story-api
 */

function uidOf(user: AuthenticatedUserType) {
  return String(user?.uid || user?.ID || "").trim();
}

function storyIdOf(context: { params: unknown }) {
  return Promise.resolve(context.params).then((params) => {
    const record = toUnknownRecord(params);
    return String(record.storyId || "").trim();
  });
}

function errorCodeOf(error: unknown) {
  return error instanceof Error ? error.message : "STORY_RUNTIME_FAILED";
}

const ERROR_STATUS: Record<string, number> = {
  STORY_INPUT_INVALID: 400,
  STORY_NOT_FOUND: 404,
  STORY_NOT_STARTED: 409,
  STORY_RUN_NOT_ACTIVE: 409,
  STORY_CHOICE_CONFLICT: 409,
  STORY_STATE_CONFLICT: 409,
  STORY_BUSY: 409,
  STORY_RUNTIME_UNAVAILABLE: 503,
  NARRATIVE_CONSENT_REQUIRED: 403,
  NARRATIVE_CROSS_SERVICE_CONSENT_REQUIRED: 403,
};

function errorResponse(error: unknown) {
  const errorCode = errorCodeOf(error);
  return NextResponse.json(
    { ok: false, errorCode: ERROR_STATUS[errorCode] ? errorCode : "STORY_RUNTIME_FAILED" },
    { status: ERROR_STATUS[errorCode] ?? 500, headers: { "Cache-Control": "no-store" } },
  );
}

function hasOnlyKeys(input: Record<string, unknown>, allowed: readonly string[]) {
  return Object.keys(input).every((key) => allowed.includes(key));
}

const GET_HANDLER = withAuth(
  async (_body, user, _request, context) => {
    const storyId = await storyIdOf(context);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(storyId) || storyId.length > 32) {
      return errorResponse(new Error("STORY_INPUT_INVALID"));
    }
    try {
      const data = await getInteractiveStoryRuntime({ uid: uidOf(user), storyId });
      return NextResponse.json({ ok: true, data }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      return errorResponse(error);
    }
  },
  undefined,
  "story/runtime:read",
  { bodyParser: "none", featureAccess: STORY_FEATURE_KEYS.runtime },
);

const POST_HANDLER = withAuth(
  async (body, user, _request, context) => {
    const storyId = await storyIdOf(context);
    const input = toUnknownRecord(body);
    const uid = uidOf(user);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(storyId) || storyId.length > 32) {
      return errorResponse(new Error("STORY_INPUT_INVALID"));
    }

    try {
      if (input.action === "start" && hasOnlyKeys(input, ["action", "idempotencyKey"])) {
        if (typeof input.idempotencyKey !== "string") throw new Error("STORY_INPUT_INVALID");
        const data = await startInteractiveStory({ uid, storyId, idempotencyKey: input.idempotencyKey });
        return NextResponse.json({ ok: true, data }, { headers: { "Cache-Control": "no-store" } });
      }

      if (input.action === "choose" && hasOnlyKeys(input, ["action", "storyRunId", "beatId", "choiceId", "idempotencyKey"])) {
        if (
          typeof input.storyRunId !== "string" ||
          typeof input.beatId !== "string" ||
          typeof input.choiceId !== "string" ||
          typeof input.idempotencyKey !== "string"
        ) {
          throw new Error("STORY_INPUT_INVALID");
        }
        const data = await chooseInteractiveStory({
          uid,
          storyId,
          storyRunId: input.storyRunId,
          beatId: input.beatId,
          choiceId: input.choiceId,
          idempotencyKey: input.idempotencyKey,
        });
        return NextResponse.json({ ok: true, data }, { headers: { "Cache-Control": "no-store" } });
      }

      return errorResponse(new Error("STORY_INPUT_INVALID"));
    } catch (error) {
      return errorResponse(error);
    }
  },
  undefined,
  "story/runtime:write",
  { bodyParser: "json", featureAccess: STORY_FEATURE_KEYS.runtime },
);

export const GET = GET_HANDLER;
export const POST = POST_HANDLER;
