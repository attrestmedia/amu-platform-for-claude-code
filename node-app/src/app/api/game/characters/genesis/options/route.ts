import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import { getAuthenticatedUid } from "libs/server-utils/lab/imageAssetAccess";
import { getPublishedUniverseNarrativeRuleset } from "libs/database/universe";
import { CHARACTER_GENESIS_RARITY_DISCLOSURE, CHARACTER_SPECIES_OPTIONS } from "consts/game/characterGenesisPolicy";
import { CharacterUniversePolicyError } from "libs/server-utils/game/characterUniversePolicy";
import { resolveCharacterUniverseAccess } from "libs/server-utils/game/characterUniverseAccess";
import type { CharacterSpeciesPolicy, CharacterUniverseRole } from "types/game/characterUniverse";
import { CHARACTER_FEATURE_KEYS } from "consts/system/featureRollout";
import { resolveFeatureAccess } from "libs/server-utils/auth/featureAccessPolicy";

export const runtime = "nodejs";

export const GET = withAuth(
  async (_body, user, request) => {
    const uid = getAuthenticatedUid(user as AuthenticatedUserType);
    if (!uid) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
    const universeId = new URL(request.url).searchParams.get("universeId")?.trim() || "";
    if (!universeId) return NextResponse.json({ ok: false, error: "UNIVERSE_ID_REQUIRED" }, { status: 400 });

    let speciesPolicy: CharacterSpeciesPolicy;
    let viewerRole: CharacterUniverseRole;
    try {
      const access = await resolveCharacterUniverseAccess(user as AuthenticatedUserType, universeId);
      speciesPolicy = access.speciesPolicy;
      viewerRole = access.role;
    } catch (error) {
      if (error instanceof CharacterUniversePolicyError) {
        return NextResponse.json(
          { ok: false, error: error.code.toLowerCase(), errorCode: error.code },
          { status: error.status },
        );
      }
      throw error;
    }

    const sourceAccess = await resolveFeatureAccess({
      featureKey: CHARACTER_FEATURE_KEYS.uploadSource,
      user,
    });

    const ruleset = await getPublishedUniverseNarrativeRuleset(universeId);
    if (!ruleset) return NextResponse.json({ ok: false, error: "GENESIS_RULESET_UNAVAILABLE" }, { status: 424 });

    return NextResponse.json({
      ok: true,
      data: {
        universeId,
        rulesetVersion: ruleset.rulesetVersion,
        species: CHARACTER_SPECIES_OPTIONS.filter((option) => speciesPolicy.allowedSpecies.includes(option.id)),
        speciesMode: speciesPolicy.mode,
        legacyFallback: speciesPolicy.legacyFallback,
        viewerRole,
        sourceAccess: { upload: sourceAccess.allowed },
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
