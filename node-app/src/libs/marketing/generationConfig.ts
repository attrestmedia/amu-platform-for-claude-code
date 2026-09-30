import { DEFAULT_TEXT_MODEL_BY_PROVIDER, TEXT_MODEL_MAP } from "consts/ai";

export type MarketingGenerationMode = "server_worker" | "local_agent";

export type MarketingReviewMode = "review_required" | "auto_after_review" | "full_auto";

export type MarketingGenerationConfig = {
  generationMode: MarketingGenerationMode;
  modelProvider: keyof typeof TEXT_MODEL_MAP;
  modelName: string;
  instructionText: string;
  contentTemplateKey: string;
  imageTemplateKey: string;
  reviewMode: MarketingReviewMode;
  reviewRequired: boolean;
  autoPublishAfterReview: boolean;
};

const DEFAULT_PROVIDER: keyof typeof TEXT_MODEL_MAP = "google";
const DEFAULT_REVIEW_MODE: MarketingReviewMode = "review_required";

function toSafeString(value: unknown, max = 2000) {
  return String(value || "").trim().slice(0, max);
}

function resolveModelProvider(value: unknown): keyof typeof TEXT_MODEL_MAP {
  const provider = toSafeString(value, 40) as keyof typeof TEXT_MODEL_MAP;
  return provider && provider in TEXT_MODEL_MAP ? provider : DEFAULT_PROVIDER;
}

function resolveModelName(provider: keyof typeof TEXT_MODEL_MAP, value: unknown) {
  const modelName = toSafeString(value, 120);
  const allowedModels = (TEXT_MODEL_MAP as Record<string, readonly string[]>)[provider] || [];
  return modelName && allowedModels.includes(modelName) ? modelName : DEFAULT_TEXT_MODEL_BY_PROVIDER[provider];
}

function resolveReviewMode(value: unknown): MarketingReviewMode {
  const reviewMode = toSafeString(value, 60);
  if (reviewMode === "auto_after_review" || reviewMode === "full_auto") return reviewMode;
  return DEFAULT_REVIEW_MODE;
}

export function normalizeMarketingGenerationConfig(value?: Record<string, unknown> | null): MarketingGenerationConfig {
  const provider = resolveModelProvider(value?.modelProvider);
  const reviewMode = resolveReviewMode(value?.reviewMode);

  return {
    generationMode: toSafeString(value?.generationMode, 40) === "local_agent" ? "local_agent" : "server_worker",
    modelProvider: provider,
    modelName: resolveModelName(provider, value?.modelName),
    instructionText: toSafeString(value?.instructionText, 4000),
    contentTemplateKey: toSafeString(value?.contentTemplateKey, 120),
    imageTemplateKey: toSafeString(value?.imageTemplateKey, 120),
    reviewMode,
    reviewRequired: reviewMode !== "full_auto",
    autoPublishAfterReview: reviewMode === "auto_after_review" || reviewMode === "full_auto",
  };
}

type MarketingJobLike = {
  request?: { generationConfig?: Record<string, unknown> };
  featureFlags?: { generationConfig?: Record<string, unknown> };
};
export function getMarketingGenerationConfigFromJob(job: MarketingJobLike | null | undefined): MarketingGenerationConfig {
  return normalizeMarketingGenerationConfig(job?.request?.generationConfig || job?.featureFlags?.generationConfig || null);
}
