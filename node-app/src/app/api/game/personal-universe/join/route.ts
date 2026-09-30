import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import { getAuthenticatedUid } from "libs/server-utils/lab/imageAssetAccess";
import {
  attachUserGameCharacterPersonalUniverse,
  getPersonalUniverseByUid,
  getUserGameCharacterById,
  listPublishedPersonalUniverseCanon,
  listUserGameCharacters,
  publishPersonalCharacterJoin,
} from "libs/database/game";
import { buildPersonalCharacterJoinProposal } from "libs/server-utils/narrative/personalCharacterJoinService";
import type { CanonReferenceEntityType, IPersonalUniverseCanonRevisionDoc } from "types/game";
import type { UnknownRecord } from "utils/common/typeUtils";

export const runtime = "nodejs";

/**
 * @docHint
 * @purpose 두 번째 이후 캐릭터의 Personal Universe 자동 합류와 연결 대상 proposal/승인
 * @process owner 인증  단일 Personal Universe 확인  연결 대상 선택  Conflict Validator  owner Canon 승인
 * @domain game.personal-universe
 * @scope user-api
 */

const TARGET_TYPES = new Set<CanonReferenceEntityType>(["character", "event", "region", "faction", "mystery", "object"]);

function value(body: UnknownRecord, key: string) {
  return typeof body[key] === "string" ? body[key].trim() : "";
}

function latestPublished(revisions: IPersonalUniverseCanonRevisionDoc[]) {
  const latest = new Map<string, IPersonalUniverseCanonRevisionDoc>();
  for (const revision of revisions) {
    const key = `${revision.entityType}:${revision.entityId}`;
    const current = latest.get(key);
    if (!current || revision.revision > current.revision) latest.set(key, revision);
  }
  return [...latest.values()];
}

async function getJoinContext(uid: string, characterId: string) {
  const character = await getUserGameCharacterById({ uid, characterId });
  if (!character) return null;
  const universe = await getPersonalUniverseByUid(uid);
  if (!universe) return { character, universe: null, mode: "world-seed" as const, targets: [] };
  if (character.personalUniverseId === universe.personalUniverseId) {
    return { character, universe, mode: "already-joined" as const, targets: [] };
  }
  const revisions = latestPublished(await listPublishedPersonalUniverseCanon(universe.personalUniverseId, uid));
  const ownedCharacters = await listUserGameCharacters({ uid, universeId: character.universeId, status: "active", limit: 50 });
  const ownedCharacterNames = new Map(ownedCharacters.map((item) => [item.characterId, item.name]));
  const targets = revisions
    .filter((revision) => TARGET_TYPES.has(revision.entityType as CanonReferenceEntityType) && revision.entityId !== character.characterId)
    .map((revision) => ({
      targetRefType: revision.entityType as CanonReferenceEntityType,
      targetRefId: revision.entityId,
      title: ownedCharacterNames.get(revision.entityId) || String(revision.payload.title || revision.entityId),
      summary: String(revision.payload.summary || revision.payload.description || ""),
    }));
  return { character, universe, mode: "join" as const, targets };
}

export const GET = withAuth(
  async (_body, user, request) => {
    const uid = getAuthenticatedUid(user as AuthenticatedUserType);
    const characterId = new URL(request.url).searchParams.get("characterId")?.trim() || "";
    if (!uid || !characterId) return NextResponse.json({ ok: false, error: "PERSONAL_CHARACTER_JOIN_INPUT_INVALID" }, { status: 400 });
    const context = await getJoinContext(uid, characterId);
    if (!context) return NextResponse.json({ ok: false, error: "CHARACTER_NOT_FOUND_OR_FORBIDDEN" }, { status: 404 });
    return NextResponse.json({ ok: true, data: context });
  },
  undefined,
  "game/personal-universe/join:read",
);

export const POST = withAuth(
  async (body: UnknownRecord, user) => {
    try {
      const uid = getAuthenticatedUid(user as AuthenticatedUserType);
      const characterId = value(body, "characterId");
      const action = value(body, "action");
      const targetRefType = value(body, "targetRefType") as CanonReferenceEntityType;
      const targetRefId = value(body, "targetRefId");
      const relationType = value(body, "relationType");
      const reason = value(body, "reason");
      if (!uid || !characterId || !["proposal", "approve"].includes(action) || !TARGET_TYPES.has(targetRefType) || !targetRefId) {
        return NextResponse.json({ ok: false, error: "PERSONAL_CHARACTER_JOIN_INPUT_INVALID" }, { status: 400 });
      }
      const context = await getJoinContext(uid, characterId);
      if (!context?.universe || context.mode !== "join") {
        return NextResponse.json({ ok: false, error: context?.mode === "already-joined" ? "PERSONAL_CHARACTER_ALREADY_JOINED" : "PERSONAL_UNIVERSE_REQUIRED" }, { status: 409 });
      }
      if (context.character.genesisStatus !== "applied") {
        return NextResponse.json({ ok: false, error: "PERSONAL_CHARACTER_GENESIS_REQUIRED" }, { status: 409 });
      }
      const targetExists = context.targets.some((target) => target.targetRefType === targetRefType && target.targetRefId === targetRefId);
      const proposal = buildPersonalCharacterJoinProposal({
        ownerUid: uid,
        characterId: context.character.characterId,
        characterName: context.character.name,
        targetRefType,
        targetRefId,
        relationType,
        reason,
        targetExists,
      });
      if (!proposal) return NextResponse.json({ ok: false, error: "PERSONAL_CHARACTER_JOIN_PROPOSAL_INVALID" }, { status: 400 });
      if (action === "proposal") return NextResponse.json({ ok: true, data: { proposal, persisted: false } });
      if (value(body, "proposalId") !== proposal.proposalId) return NextResponse.json({ ok: false, error: "PERSONAL_CHARACTER_JOIN_PROPOSAL_STALE" }, { status: 409 });

      const approved = await publishPersonalCharacterJoin({ ownerUid: uid, proposal });
      const character = await attachUserGameCharacterPersonalUniverse({
        uid,
        characterId,
        personalUniverseId: approved.universe.personalUniverseId,
      });
      return NextResponse.json({ ok: true, data: { proposal, persisted: true, universe: approved.universe, character, characterRevision: approved.characterRevision, relationRevision: approved.relationRevision } }, { status: approved.created ? 201 : 200 });
    } catch (error) {
      const code = String((error as { code?: unknown })?.code || (error as { message?: unknown })?.message || "PERSONAL_CHARACTER_JOIN_FAILED");
      const status = code.includes("FORBIDDEN") ? 403 : code.includes("CONFLICT") || code.includes("STALE") ? 409 : code.includes("INVALID") ? 400 : 500;
      return NextResponse.json({ ok: false, error: code }, { status });
    }
  },
  undefined,
  "game/personal-universe/join:write",
  { bodyParser: "json" },
);
