import "server-only";

import { AI_MODEL_CATALOG, AI_MODEL_ROLES } from "consts/ai/generated/modelCatalog.generated";
import { parseModelModalityRef } from "consts/ai/modelPolicy";
import { TEXT_PROVIDER_TYPES } from "consts/ai/modelRole";
import type { TextProviderType } from "types/ai";

type NarrativeDirectorRole = NonNullable<typeof AI_MODEL_ROLES.internalTools.narrativeDirector>;

type NarrativeDirectorModelResolution = {
  provider: TextProviderType;
  modelName: string;
  thinkingBudgetControl: "supported" | "not_applicable";
};

export function resolveNarrativeDirectorModelFromManifest(
  role: NarrativeDirectorRole | null | undefined,
  models: typeof AI_MODEL_CATALOG.models,
): NarrativeDirectorModelResolution | null {
  if (!role || !Array.isArray(role.allowedModels) || !role.allowedModels.includes(role.defaultModel)) return null;

  let reference: ReturnType<typeof parseModelModalityRef>;
  try {
    reference = parseModelModalityRef(role.defaultModel);
  } catch {
    return null;
  }

  if (reference.modality !== "text" || !(TEXT_PROVIDER_TYPES as readonly string[]).includes(reference.provider)) return null;

  const model = models.find((candidate) => candidate.id === `${reference.provider}:${reference.modelName}`);
  if (!model || model.entryKind !== "model" || model.status !== "active") return null;

  const profile = model.modalities.find((candidate) => candidate.modality === "text");
  if (!profile || !profile.routable || profile.launchState === "internal") return null;

  const thinkingBudget = profile.request.thinkingBudget as "supported" | "unsupported" | "not_applicable";
  let thinkingBudgetControl: NarrativeDirectorModelResolution["thinkingBudgetControl"];
  if (thinkingBudget === "supported") {
    thinkingBudgetControl = "supported";
  } else if (profile.request.thinkingMode === "not_applicable") {
    thinkingBudgetControl = "not_applicable";
  } else {
    return null;
  }

  return {
    provider: reference.provider as TextProviderType,
    modelName: reference.modelName,
    thinkingBudgetControl,
  };
}

export function resolveNarrativeDirectorModel(): NarrativeDirectorModelResolution | null {
  return resolveNarrativeDirectorModelFromManifest(
    AI_MODEL_ROLES.internalTools.narrativeDirector,
    AI_MODEL_CATALOG.models,
  );
}
