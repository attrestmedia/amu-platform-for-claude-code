import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import {
  activatePlayDiscoveryArc,
  getPlayNarrativeBundle,
  resolvePlayDiscoveryEvent,
} from "libs/server-utils/play/playNarrativeAdapter";
import { toUnknownRecord } from "utils/common";

export const runtime = "nodejs";

/**
 * @docHint
 * @purpose Play 파일럿 discovery 이벤트 API (activation·attempt·state 조회)
 * @process 인증 UID 사용  서버 권위 판정  idempotencyKey 기반 중복 방지  Personal Canon event로만 반영
 * @domain play-narrative
 * @scope play-api
 */

function uidOf(user: AuthenticatedUserType) {
  return String(user?.uid || user?.ID || "").trim();
}

function codeOf(error: unknown) {
  return error instanceof Error ? error.message : "PLAY_NARRATIVE_FAILED";
}

const ERROR_STATUS: Record<string, number> = {
  PLAY_INPUT_INVALID: 400,
  PLAY_PLAYER_GENESIS_REQUIRED: 409,
  PLAY_DISCOVERY_NOT_ACTIVATED: 409,
  NARRATIVE_CONSENT_REQUIRED: 403,
  NARRATIVE_CROSS_SERVICE_CONSENT_REQUIRED: 403,
  NARRATIVE_STATE_VERSION_CONFLICT: 409,
  NARRATIVE_STATE_APPLY_CONFLICT: 409,
  NARRATIVE_EVENT_IN_PROGRESS: 409,
};

export const GET = withAuth(
  async (_body, user) => {
    const bundle = await getPlayNarrativeBundle({ uid: uidOf(user) });
    return NextResponse.json({ ok: true, data: bundle }, { headers: { "Cache-Control": "no-store" } });
  },
  undefined,
  "play/narrative:read",
  { bodyParser: "none" },
);

export const POST = withAuth(
  async (body, user) => {
    const input = toUnknownRecord(body);
    const uid = uidOf(user);
    const idempotencyKey = String(input.idempotencyKey || "").trim();
    if (!idempotencyKey || idempotencyKey.length > 120) {
      return NextResponse.json({ ok: false, errorCode: "PLAY_INPUT_INVALID" }, { status: 400 });
    }
    try {
      if (input.action === "activate") {
        const result = await activatePlayDiscoveryArc({ uid, idempotencyKey });
        return NextResponse.json({ ok: true, action: "activate", data: result }, { headers: { "Cache-Control": "no-store" } });
      }
      if (input.action === "attempt") {
        const playerCharacterId = String(input.playerCharacterId || "").trim();
        const difficulty = Number(input.difficulty);
        const result = await resolvePlayDiscoveryEvent({
          uid,
          playerCharacterId,
          idempotencyKey,
          difficulty: Number.isFinite(difficulty) ? difficulty : undefined,
        });
        return NextResponse.json({ ok: true, action: "attempt", data: result }, { headers: { "Cache-Control": "no-store" } });
      }
      return NextResponse.json({ ok: false, errorCode: "PLAY_ACTION_INVALID" }, { status: 400 });
    } catch (error) {
      const code = codeOf(error);
      return NextResponse.json(
        { ok: false, errorCode: code },
        { status: ERROR_STATUS[code] ?? 500, headers: { "Cache-Control": "no-store" } },
      );
    }
  },
  undefined,
  "play/narrative:write",
  { bodyParser: "json" },
);
