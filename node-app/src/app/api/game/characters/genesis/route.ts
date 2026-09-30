import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import type { AuthenticatedUserType, RequestValidator } from "libs/server-utils/api/_helpers";
import { getAuthenticatedUid } from "libs/server-utils/lab/imageAssetAccess";
import { CharacterGenesisError, createUserCharacterGenesis } from "libs/server-utils/game/characterGenesisService";
import { getGenesisBundle } from "libs/database/game";
import type { UnknownRecord } from "utils/common/typeUtils";

export const runtime = "nodejs";

const FORBIDDEN_CLIENT_FIELDS = new Set([
  "rarityBucket",
  "rarityTier",
  "potentialBand",
  "statBudget",
  "stats",
  "traitIds",
  "hp",
  "mp",
  "iq",
  "eq",
  "luck",
]);

const validateGenesisRequest: RequestValidator<UnknownRecord> = (data) => {
  const hasText = (key: string, max: number) => {
    const value = data?.[key];
    return typeof value === "string" && value.trim().length > 0 && value.trim().length <= max;
  };
  if (!hasText("universeId", 80) || !hasText("speciesId", 80) || !hasText("idempotencyKey", 180)) {
    return { valid: false, error: "GENESIS_INPUT_INVALID" };
  }
  for (const key of FORBIDDEN_CLIENT_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(data, key)) return { valid: false, error: "GENESIS_CLIENT_STAT_FORBIDDEN" };
  }
  return { valid: true };
};

export const POST = withAuth<UnknownRecord>(
  async (body, user) => {
    try {
      const uid = getAuthenticatedUid(user as AuthenticatedUserType);
      const result = await createUserCharacterGenesis({
        uid,
        universeId: String(body.universeId),
        speciesId: String(body.speciesId),
        archetypeId: typeof body.archetypeId === "string" ? body.archetypeId : undefined,
        primaryAttributeId: typeof body.primaryAttributeId === "string" ? body.primaryAttributeId : undefined,
        characterId: typeof body.characterId === "string" ? body.characterId : undefined,
        idempotencyKey: String(body.idempotencyKey),
      });
      return NextResponse.json({ ok: true, data: result }, { status: 201 });
    } catch (error) {
      if (error instanceof CharacterGenesisError) {
        return NextResponse.json({ ok: false, error: error.code }, { status: error.status });
      }
      if (error instanceof Error && ["genesis_species_invalid", "genesis_attribute_invalid"].includes(error.message)) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
      }
      return NextResponse.json({ ok: false, error: "GENESIS_CREATE_FAILED" }, { status: 500 });
    }
  },
  validateGenesisRequest,
  "game/characters/genesis:create",
);

export const GET = withAuth(
  async (_body, user, request) => {
    const uid = getAuthenticatedUid(user as AuthenticatedUserType);
    const characterId = new URL(request.url).searchParams.get("characterId")?.trim() || "";
    if (!characterId) return NextResponse.json({ ok: false, error: "CHARACTER_ID_REQUIRED" }, { status: 400 });
    const result = await getGenesisBundle({ uid, characterId });
    if (!result.profile) return NextResponse.json({ ok: false, error: "GENESIS_NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ ok: true, data: result });
  },
  undefined,
  "game/characters/genesis:read",
  { bodyParser: "none" },
);
