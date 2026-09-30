import crypto from "crypto";
import { NextResponse } from "next/server";
import { MONGODB_PERSONA_URL } from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import { listNpcIntimaciesForUser } from "libs/database/game";
import { getUniverseById } from "libs/database/universe";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import { getAuthenticatedUid } from "libs/server-utils/lab/imageAssetAccess";
import { PersonaSchema, type IPersonaDocument } from "models/universe";
import { buildNpcCodexResponse } from "utils/game/npcCodex";
import { logger } from "utils/log";

export const runtime = "nodejs";

/**
 * @docHint
 * @purpose 현재 Play 유니버스의 공개 NPC catalog를 owner 발견·친밀도와 병합해 그림자 도감 반환
 * @process 인증  universe 검증  public active persona 조회  owner 원장 bulk 병합  미발견 identity 제거
 * @domain game.npc-codex
 * @scope user-api
 */

const UNIVERSE_ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,79}$/i;
const CODEX_LIMIT = 200;

export const GET = withAuth(
  async (_body, user, request) => {
    try {
      const uid = getAuthenticatedUid(user as AuthenticatedUserType);
      const { searchParams } = new URL(request.url);
      const universeId = String(searchParams.get("universeId") || "").trim();
      if (!uid) {
        return NextResponse.json(
          { ok: false, error: "unauthorized", errorCode: "UNAUTHORIZED" },
          { status: 401 },
        );
      }
      if (!UNIVERSE_ID_PATTERN.test(universeId)) {
        return NextResponse.json(
          { ok: false, error: "universe_id_invalid", errorCode: "UNIVERSE_ID_INVALID" },
          { status: 400 },
        );
      }

      const universe = await getUniverseById(universeId);
      if (!universe || universe.enabled === false) {
        return NextResponse.json(
          { ok: false, error: "universe_not_found", errorCode: "UNIVERSE_NOT_FOUND" },
          { status: 404 },
        );
      }

      const modelName = `NpcCodexPersona_${crypto.createHash("sha256").update(universeId).digest("hex").slice(0, 16)}`;
      const personaModel = await getModel<IPersonaDocument>(
        MONGODB_PERSONA_URL,
        modelName,
        PersonaSchema,
        universeId,
      );
      const personas = await personaModel
        .find({ status: "active", visibility: "public" })
        .sort({ name: 1, pid: 1 })
        .limit(CODEX_LIMIT)
        .select({
          pid: 1,
          personaType: 1,
          name: 1,
          job: 1,
          species: 1,
          summary: 1,
          profiles: 1,
        })
        .lean();
      const npcIds = personas.map((persona) => String(persona.pid || "").trim()).filter(Boolean);
      const intimacies = await listNpcIntimaciesForUser({ uid, npcIds });
      const codex = buildNpcCodexResponse({
        universeId,
        personas,
        intimacies,
      });

      return NextResponse.json({ ok: true, data: codex });
    } catch (error) {
      logger.error("[NpcCodex][GET] failed:", error);
      return NextResponse.json(
        { ok: false, error: "npc_codex_read_failed", errorCode: "NPC_CODEX_READ_FAILED" },
        { status: 500 },
      );
    }
  },
  undefined,
  "game/npc/codex",
  { bodyParser: "none" },
);
