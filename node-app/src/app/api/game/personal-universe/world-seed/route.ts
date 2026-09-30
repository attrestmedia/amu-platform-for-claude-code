import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import { getAuthenticatedUid } from "libs/server-utils/lab/imageAssetAccess";
import { getPublishedUniverseNarrativeRuleset } from "libs/database/universe";
import {
  attachUserGameCharacterPersonalUniverse,
  getPersonalUniverseByUid,
  getUserGameCharacterById,
  publishWorldSeedCanon,
} from "libs/database/game";
import { buildWorldSeedProposal } from "libs/server-utils/narrative/worldSeedService";
import type { UnknownRecord } from "utils/common/typeUtils";

export const runtime = "nodejs";

/**
 * @docHint
 * @purpose 첫 캐릭터의 World Seed proposal 조회와 owner 승인 처리
 * @process 인증  캐릭터 소유·mechanics ruleset 검증  proposal 반환  승인 시 private personal Canon 저장
 * @domain game.personal-universe
 * @scope user-api
 */

function value(body: UnknownRecord, key: string) {
  return typeof body[key] === "string" ? body[key].trim() : "";
}

function rules(body: UnknownRecord) {
  return Array.isArray(body.rules) ? body.rules.filter((item): item is string => typeof item === "string") : undefined;
}

function proposalInput(body: UnknownRecord, character: NonNullable<Awaited<ReturnType<typeof getUserGameCharacterById>>>, rulesetVersion: number) {
  return buildWorldSeedProposal({
    characterId: character.characterId,
    characterName: character.name,
    rulesetUniverseId: character.universeId,
    rulesetVersion,
    worldName: value(body, "worldName") || undefined,
    premise: value(body, "premise") || undefined,
    rules: rules(body),
    startingPlace: value(body, "startingPlace") || undefined,
    firstEvent: value(body, "firstEvent") || undefined,
  });
}

export const POST = withAuth(
  async (body: UnknownRecord, user) => {
    try {
      const uid = getAuthenticatedUid(user as AuthenticatedUserType);
      const characterId = value(body, "characterId");
      const action = value(body, "action") || "proposal";
      if (!uid || !characterId || !["proposal", "approve"].includes(action)) {
        return NextResponse.json({ ok: false, error: "WORLD_SEED_INPUT_INVALID" }, { status: 400 });
      }

      const character = await getUserGameCharacterById({ uid, characterId });
      if (!character) return NextResponse.json({ ok: false, error: "CHARACTER_NOT_FOUND_OR_FORBIDDEN" }, { status: 404 });
      if (character.genesisStatus !== "applied") {
        return NextResponse.json({ ok: false, error: "WORLD_SEED_GENESIS_REQUIRED" }, { status: 409 });
      }
      if (character.personalUniverseId && action === "proposal") {
        return NextResponse.json({ ok: false, error: "WORLD_SEED_ALREADY_ATTACHED" }, { status: 409 });
      }

      const ruleset = await getPublishedUniverseNarrativeRuleset(character.universeId);
      if (!ruleset) return NextResponse.json({ ok: false, error: "GENESIS_RULESET_UNAVAILABLE" }, { status: 424 });
      const proposal = proposalInput(body, character, ruleset.rulesetVersion);
      if (action === "proposal") {
        return NextResponse.json({ ok: true, data: { proposal, canApprove: true, persisted: false } });
      }
      if (action !== "approve") return NextResponse.json({ ok: false, error: "WORLD_SEED_INPUT_INVALID" }, { status: 400 });

      const existingUniverse = await getPersonalUniverseByUid(uid);
      if (existingUniverse && existingUniverse.personalUniverseId !== character.personalUniverseId) {
        return NextResponse.json({ ok: false, error: "PERSONAL_UNIVERSE_ALREADY_EXISTS" }, { status: 409 });
      }
      const requestedProposalId = value(body, "proposalId");
      if (requestedProposalId && requestedProposalId !== proposal.proposalId) {
        return NextResponse.json({ ok: false, error: "WORLD_SEED_PROPOSAL_STALE" }, { status: 409 });
      }

      const approved = await publishWorldSeedCanon({
        ownerUid: uid,
        rulesetUniverseId: character.universeId,
        characterId: character.characterId,
        characterName: character.name,
        payload: proposal,
      });
      const updatedCharacter = await attachUserGameCharacterPersonalUniverse({
        uid,
        characterId: character.characterId,
        personalUniverseId: approved.universe.personalUniverseId,
      });
      return NextResponse.json({
        ok: true,
        data: {
          proposal,
          persisted: true,
          universe: approved.universe,
          revision: approved.revision,
          character: updatedCharacter,
        },
      }, { status: approved.created ? 201 : 200 });
    } catch (error) {
      const code = String((error as { code?: unknown })?.code || (error as { message?: unknown })?.message || "WORLD_SEED_FAILED");
      const status = code.includes("FORBIDDEN") ? 403 : code.includes("INVALID") ? 400 : 500;
      return NextResponse.json({ ok: false, error: code }, { status });
    }
  },
  undefined,
  "game/personal-universe/world-seed:write",
  { bodyParser: "json" },
);
