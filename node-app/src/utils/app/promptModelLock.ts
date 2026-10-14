import type { ImageProviderType } from "types/ai";
import type { ImagePromptDefaultParamsType } from "types/app";
import { toUnknownRecord, type UnknownRecord } from "utils/common/typeUtils";
import { AI_IMAGE_MODEL_MAP } from "consts/ai/generated/modelCatalog.generated";

export type PromptModelLockResolution = {
  enabled: true;
  provider: ImageProviderType;
  modelName: string;
  reason?: string;
};

// Keep the existing three-provider lock behavior; IMAGE_PROVIDER_TYPES also includes zai.
const IMAGE_PROVIDER_SET = new Set<string>(["google", "openai", "xai"]);

function normalizeImageProviderValue(value: unknown): ImageProviderType | "" {
  const provider = String(value || "").trim().toLowerCase();
  return IMAGE_PROVIDER_SET.has(provider) ? (provider as ImageProviderType) : "";
}

function inferProviderFromPromptModelName(modelName: string): ImageProviderType {
  const key = String(modelName || "").trim().toLowerCase();
  const mappedProvider = Object.entries(AI_IMAGE_MODEL_MAP).find(
    ([provider, modelNames]) =>
      IMAGE_PROVIDER_SET.has(provider) &&
      (modelNames as readonly string[]).some((candidate) => candidate.trim().toLowerCase() === key),
  )?.[0];
  if (mappedProvider) return mappedProvider as ImageProviderType;

  // Preserve inference for saved templates that refer to deprecated, unlisted image models.
  if (key.startsWith("gpt-image")) return "openai";
  if (key.startsWith("grok")) return "xai";
  return "google";
}

export function resolvePromptModelLock(defaultParams?: ImagePromptDefaultParamsType | UnknownRecord | null) {
  const params = toUnknownRecord(defaultParams);
  const lock = toUnknownRecord(params.modelLock);
  if (lock.enabled !== true) return null;

  const modelName = String(lock.modelName || "").trim();
  if (!modelName) return null;

  const provider =
    normalizeImageProviderValue(lock.provider) ||
    normalizeImageProviderValue(params.provider) ||
    inferProviderFromPromptModelName(modelName);

  return {
    enabled: true,
    provider,
    modelName,
    reason: String(lock.reason || "").trim() || undefined,
  } satisfies PromptModelLockResolution;
}

export function resolvePromptDefaultModelName(defaultParams?: ImagePromptDefaultParamsType | UnknownRecord | null) {
  const locked = resolvePromptModelLock(defaultParams);
  if (locked) return locked.modelName;
  const params = toUnknownRecord(defaultParams);
  return String(params.modelName || "").trim();
}
