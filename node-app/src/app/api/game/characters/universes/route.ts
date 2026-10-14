import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { CharacterUniversePolicyError } from "libs/server-utils/game/characterUniversePolicy";
import { listCharacterUniverseOptions } from "libs/server-utils/game/characterUniverseAccess";

export const runtime = "nodejs";

/**
 * @docHint
 * @purpose 캐릭터 제작에 접근 가능한 Universe 목록을 viewer 권한으로 조회
 * @process 진입 Universe 입력을 검증하고 서버 정책으로 선택 가능한 Universe와 기본값을 반환
 * @domain game
 * @scope user-api
 */

export const GET = withAuth(
  async (_body, user, request) => {
    const entryUniverseId = new URL(request.url).searchParams.get("entryUniverseId")?.trim() || "";
    if (entryUniverseId.length > 80) {
      return NextResponse.json(
        { ok: false, error: "entry_universe_id_invalid", errorCode: "ENTRY_UNIVERSE_ID_INVALID" },
        { status: 400 },
      );
    }

    try {
      const data = await listCharacterUniverseOptions(user, entryUniverseId || null);
      return NextResponse.json({ ok: true, data });
    } catch (error) {
      if (error instanceof CharacterUniversePolicyError) {
        return NextResponse.json(
          { ok: false, error: error.code.toLowerCase(), errorCode: error.code },
          { status: error.status },
        );
      }
      throw error;
    }
  },
  undefined,
  "game/characters:universes",
  { bodyParser: "none" },
);
