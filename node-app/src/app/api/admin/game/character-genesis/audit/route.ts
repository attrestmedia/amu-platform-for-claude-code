import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { getCharacterGenerationRollModel } from "libs/database/game";
import { getRarityDisclosure } from "libs/server-utils/game/characterGenesisRoll";
import { buildRarityAuditSummary } from "libs/server-utils/game/characterGenesisAudit";

export const runtime = "nodejs";

export const GET = withAuth(
  async (_body, _user, request) => {
    const model = await getCharacterGenerationRollModel();
    const { searchParams } = new URL(request.url);
    const universeId = searchParams.get("universeId")?.trim();
    const rulesetVersion = Number(searchParams.get("rulesetVersion") || 0);
    const query: Record<string, unknown> = {};
    if (universeId) query.universeId = universeId;
    if (Number.isInteger(rulesetVersion) && rulesetVersion > 0) query.rulesetVersion = rulesetVersion;

    const [summary] = await model.aggregate([
      { $match: query },
      {
        $facet: {
          totals: [{ $count: "sampleSize" }],
          rarity: [
            { $group: { _id: "$rarityTier", count: { $sum: 1 } } },
            { $sort: { _id: 1 } },
          ],
          potential: [
            { $group: { _id: { rarityTier: "$rarityTier", potentialBand: "$potentialBand" }, count: { $sum: 1 } } },
            { $sort: { "_id.rarityTier": 1, "_id.potentialBand": 1 } },
          ],
          statBudget: [
            { $group: { _id: "$rarityTier", min: { $min: "$statBudget" }, max: { $max: "$statBudget" }, average: { $avg: "$statBudget" } } },
            { $sort: { _id: 1 } },
          ],
          traits: [
            { $group: { _id: "$rarityTier", traitCountAverage: { $avg: "$traitCount" } } },
            { $sort: { _id: 1 } },
          ],
        },
      },
    ]);
    const sampleSize = Number(summary?.totals?.[0]?.sampleSize || 0);
    const tierCounts: Record<string, number> = {};
    for (const row of summary?.rarity || []) tierCounts[String(row._id)] = Number(row.count) || 0;
    return NextResponse.json({
      ok: true,
      data: {
        sampleSize,
        filters: { universeId: universeId || null, rulesetVersion: rulesetVersion || null },
        expectedRarity: getRarityDisclosure(),
        rarity: buildRarityAuditSummary(tierCounts),
        potential: summary?.potential || [],
        statBudget: summary?.statBudget || [],
        traits: summary?.traits || [],
        lowFrequencyWarning: sampleSize < 10_000,
        rawSeedIncluded: false,
      },
    });
  },
  undefined,
  "admin/game/character-genesis/audit:read",
  { requireAdmin: true, bodyParser: "none" },
);
