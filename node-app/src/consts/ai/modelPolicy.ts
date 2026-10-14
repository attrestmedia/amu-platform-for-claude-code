import { AI_MODEL_REQUEST_FLAGS } from "./generated/modelPolicy.generated";

export type ModelPolicyModality = "text" | "image" | "audio" | "video";

export type ModelRequestFlagProfile = Readonly<Partial<{
  temperature: "supported" | "unsupported" | "not_applicable";
  thinkingBudget: "supported" | "unsupported" | "not_applicable";
  thinkingMode: "none" | "adaptive" | "always_on" | "not_applicable";
  thinkingOff: "disabled" | "between_tools";
  imageSizeMode: string;
}>>;

type ModelRequestPolicyEntry = Readonly<Partial<Record<ModelPolicyModality, ModelRequestFlagProfile>>>;

const MODEL_POLICY_MODALITIES = new Set<ModelPolicyModality>(["text", "image", "audio", "video"]);

export function parseModelModalityRef(ref: string): {
  provider: string;
  modelName: string;
  modality: ModelPolicyModality;
} {
  if (typeof ref !== "string") throw new TypeError("Model modality reference must be a string");

  const slashIndex = ref.indexOf("/");
  if (slashIndex <= 0 || slashIndex !== ref.lastIndexOf("/")) {
    throw new Error(`Invalid model modality reference: ${ref}`);
  }

  const identity = ref.slice(0, slashIndex);
  const colonIndex = identity.indexOf(":");
  if (colonIndex <= 0 || colonIndex !== identity.lastIndexOf(":") || colonIndex === identity.length - 1) {
    throw new Error(`Invalid model modality reference: ${ref}`);
  }

  const modality = ref.slice(slashIndex + 1);
  if (!MODEL_POLICY_MODALITIES.has(modality as ModelPolicyModality)) {
    throw new Error(`Invalid model modality reference: ${ref}`);
  }

  return {
    provider: identity.slice(0, colonIndex),
    modelName: identity.slice(colonIndex + 1),
    modality: modality as ModelPolicyModality,
  };
}

export function getModelRequestFlags(
  provider: string,
  modelName: string,
  modality: ModelPolicyModality,
): ModelRequestFlagProfile | null {
  const normalizedModelName = modelName.trim().toLowerCase();
  if (!normalizedModelName) return null;

  const key = `${provider}:${normalizedModelName}` as keyof typeof AI_MODEL_REQUEST_FLAGS;
  const policy = AI_MODEL_REQUEST_FLAGS[key] as ModelRequestPolicyEntry | undefined;
  return policy?.[modality] ?? null;
}

export function roleRefToProviderModel(ref: string): { provider: string; modelName: string } {
  const { provider, modelName } = parseModelModalityRef(ref);
  return { provider, modelName };
}
