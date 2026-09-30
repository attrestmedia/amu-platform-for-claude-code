import { getModel } from "libs/database/modelCache";
import { MONGODB_AMU_URL } from "consts/env/server";
import {
  UniverseNarrativeRulesetSchema,
  type IUniverseNarrativeRulesetDocument,
} from "models/universe";

const COLLECTION = "universe_narrative_rulesets";

async function getUniverseNarrativeRulesetModel() {
  return await getModel<IUniverseNarrativeRulesetDocument>(
    MONGODB_AMU_URL,
    "UniverseNarrativeRuleset",
    UniverseNarrativeRulesetSchema,
    COLLECTION,
  );
}

export async function getPublishedUniverseNarrativeRuleset(universeId: string) {
  const normalizedUniverseId = universeId.trim();
  if (!normalizedUniverseId) return null;

  const model = await getUniverseNarrativeRulesetModel();
  return await model
    .findOne({ universeId: normalizedUniverseId, status: "published" })
    .sort({ rulesetVersion: -1 })
    .lean();
}
