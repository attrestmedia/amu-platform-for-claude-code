import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import { getAuthenticatedUid } from "libs/server-utils/lab/imageAssetAccess";
import { getPublishedUniverseNarrativeRuleset } from "libs/database/universe";
import { CHARACTER_GENESIS_RARITY_DISCLOSURE, CHARACTER_SPECIES_OPTIONS } from "consts/game/characterGenesisPolicy";

export const runtime = "nodejs";

export const GET = withAuth(
  async (_body, user, request) => {
    const uid = getAuthenticatedUid(user as AuthenticatedUserType);
    if (!uid) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
    const universeId = new URL(request.url).searchParams.get("universeId")?.trim() || "";
    if (!universeId) return NextResponse.json({ ok: false, error: "UNIVERSE_ID_REQUIRED" }, { status: 400 });

    const ruleset = await getPublishedUniverseNarrativeRuleset(universeId);
    if (!ruleset) return NextResponse.json({ ok: false, error: "GENESIS_RULESET_UNAVAILABLE" }, { status: 424 });

    return NextResponse.json({
      ok: true,
      data: {
        universeId,
        rulesetVersion: ruleset.rulesetVersion,
        species: CHARACTER_SPECIES_OPTIONS,
        attributes: ruleset.attributes.map(({ id, i18nKey, displayName, description }) => ({
          id,
          i18nKey,
          displayName: displayName || id,
          description: description || "",
        })),
        rarityDisclosure: CHARACTER_GENESIS_RARITY_DISCLOSURE,
      },
    });
  },
  undefined,
  "game/characters/genesis:options",
  { bodyParser: "none" },
);
