import type { AiModalityType, BillableProviderType } from "types/ai";
import type { ITokenUsageBreakdown } from "types/payment";
import { FIXED_COSTS, TOKENS_PER_COIN } from "consts/payment";
import { OPENAI_FLEXIBLE_SIZE_IMAGE_MODELS } from "consts/ai";

export type MediaBillingStrategyType = "fixed" | "token" | "hybrid";
type PricingMapArgs = {
  tokenMap?: Record<string, unknown>;
  fixedMap?: Record<string, unknown>;
};

function hasOwn(obj: object, key: string) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function buildPricingCandidates(provider: BillableProviderType, modelName: string, modality: AiModalityType, variant?: string) {
  const base = `${String(provider || "").trim().toLowerCase()}:${String(modelName || "").trim()}`;
  return [
    variant ? `${base}:${variant}:${modality}` : "",
    variant ? `${base}:${variant}` : "",
    `${base}:${modality}`,
    base,
  ].filter(Boolean);
}

// 고정 최소요금 + 토큰 초과분 hybrid 과금 대상.
// gpt-image-2.5 계열은 장당 토큰 소모량이 공개되지 않아 fixed 단독으로는 원가를 담보하지 못한다.
const TOKEN_BILLED_IMAGE_MODEL_KEYS = new Set<string>(
  OPENAI_FLEXIBLE_SIZE_IMAGE_MODELS.map((modelName) => `openai:${modelName}`),
);

function isTokenBilledImageModel(provider: BillableProviderType, modelName: string) {
  return TOKEN_BILLED_IMAGE_MODEL_KEYS.has(
    `${String(provider || "").toLowerCase()}:${String(modelName || "").trim()}`,
  );
}

export function hasTokenPricingForMedia(
  provider: BillableProviderType,
  modelName: string,
  modality: AiModalityType,
  variant?: string,
  pricing?: PricingMapArgs,
) {
  const tokenMap = pricing?.tokenMap || TOKENS_PER_COIN;
  return buildPricingCandidates(provider, modelName, modality, variant).some((key) => hasOwn(tokenMap, key));
}

export function hasFixedPricingForMedia(
  provider: BillableProviderType,
  modelName: string,
  modality: AiModalityType,
  variant?: string,
  pricing?: PricingMapArgs,
) {
  const fixedMap = pricing?.fixedMap || FIXED_COSTS;
  return buildPricingCandidates(provider, modelName, modality, variant).some((key) => hasOwn(fixedMap, key));
}

export function resolveMediaBillingStrategy(args: {
  provider: BillableProviderType;
  modelName: string;
  modality: AiModalityType;
  variant?: string;
  pricing?: PricingMapArgs;
}): MediaBillingStrategyType {
  const hasFixed = hasFixedPricingForMedia(args.provider, args.modelName, args.modality, args.variant, args.pricing);
  const tokenBillingAllowed =
    args.modality !== "image" || !hasFixed || isTokenBilledImageModel(args.provider, args.modelName);
  const hasToken =
    tokenBillingAllowed &&
    hasTokenPricingForMedia(args.provider, args.modelName, args.modality, args.variant, args.pricing);

  if (hasToken && hasFixed) return "hybrid";
  if (hasToken) return "token";
  return "fixed";
}

export function hasBillableTokenUsage(usage: ITokenUsageBreakdown | null | undefined) {
  if (!usage || typeof usage !== "object") return false;
  return ["text", "audio", "image", "video"].some((modality) => {
    const row = usage[modality as keyof ITokenUsageBreakdown];
    return Number(row?.input || 0) > 0 || Number(row?.output || 0) > 0;
  });
}
