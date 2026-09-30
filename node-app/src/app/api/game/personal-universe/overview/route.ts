import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import {
  getPersonalUniverseByUid,
  listPublishedPersonalUniverseCanon,
  listUserGameCharacters,
} from "libs/database/game";
import type { IPersonalUniverseCanonRevisionDoc } from "types/game";

export const runtime = "nodejs";

/**
 * @docHint
 * @purpose owner의 Personal Universe 탐색 화면에 필요한 published Canon read model 제공
 * @process owner 인증  active universe 조회  최신 published revision dedupe  소유 캐릭터 read
 * @domain game.personal-universe.explorer
 * @scope user-api
 */

function uidOf(user: AuthenticatedUserType) {
  return String(user?.uid || user?.ID || "").trim();
}

function latestPublished(revisions: IPersonalUniverseCanonRevisionDoc[]) {
  const latest = new Map<string, IPersonalUniverseCanonRevisionDoc>();
  revisions.forEach((revision) => {
    const key = `${revision.entityType}:${revision.entityId}`;
    const current = latest.get(key);
    if (!current || revision.revision > current.revision) latest.set(key, revision);
  });
  return [...latest.values()].sort((a, b) => {
    const typeOrder = a.entityType.localeCompare(b.entityType);
    return typeOrder || a.entityId.localeCompare(b.entityId);
  });
}

export const GET = withAuth(
  async (_body, user) => {
    const uid = uidOf(user as AuthenticatedUserType);
    if (!uid) return NextResponse.json({ ok: false, error: "PERSONAL_UNIVERSE_OWNER_REQUIRED" }, { status: 401 });

    const universe = await getPersonalUniverseByUid(uid);
    if (!universe) {
      return NextResponse.json({
        ok: true,
        data: { universe: null, characters: [], canon: [] },
      }, { headers: { "Cache-Control": "no-store" } });
    }

    const [revisions, characters] = await Promise.all([
      listPublishedPersonalUniverseCanon(universe.personalUniverseId, uid),
      listUserGameCharacters({ uid, universeId: universe.rulesetUniverseId, status: "active", limit: 50 }),
    ]);

    return NextResponse.json({
      ok: true,
      data: {
        universe,
        canon: latestPublished(revisions),
        characters: characters
          .filter((character) => character.personalUniverseId === universe.personalUniverseId)
          .map((character) => ({
            characterId: character.characterId,
            name: character.name,
            sourceImageRef: character.sourceImageRef,
            speciesId: character.speciesId,
            primaryAttributeId: character.primaryAttributeId,
            updatedAt: character.updatedAt,
          })),
      },
    }, { headers: { "Cache-Control": "no-store" } });
  },
  undefined,
  "game/personal-universe/overview:read",
  { bodyParser: "none" },
);
