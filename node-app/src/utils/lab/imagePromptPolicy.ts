import { IMAGE_REF_LIMIT_BY_PROVIDER } from "consts/ai";
import type { ImageProviderType } from "types/ai";
import type { BaseImageType, ImagePromptInputPolicyType, PromptItemType } from "types/app";
import { toUnknownRecord } from "utils/common/typeUtils";

export type ResolvedImageReferencePolicyType = {
  required: boolean;
  minCount: number;
  maxCount: number;
  enforceInCustomMode: boolean;
  limit: number;
};

function toSafeInt(value: unknown, fallback: number) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.floor(num));
}

export function resolveImageReferencePolicy(
  inputPolicy?: ImagePromptInputPolicyType,
  provider: ImageProviderType = "google",
): ResolvedImageReferencePolicyType {
  const limit = Math.max(1, Number(IMAGE_REF_LIMIT_BY_PROVIDER[provider] || 1));
  const raw = inputPolicy?.referenceImage || {};
  const required = raw.required === true;
  const minBase = required ? 1 : 0;
  const minCount = Math.min(limit, Math.max(minBase, toSafeInt(raw.minCount, minBase)));
  const maxFallback = Math.max(required ? 1 : limit, minCount);
  const maxCount = Math.min(limit, Math.max(minCount, toSafeInt(raw.maxCount, maxFallback)));

  return {
    required,
    minCount,
    maxCount,
    enforceInCustomMode: raw.enforceInCustomMode !== false,
    limit,
  };
}

export function buildImageReferenceInputPolicy(args: {
  required: boolean;
  minCount: number;
  maxCount: number;
  enforceInCustomMode: boolean;
  provider: ImageProviderType;
}): ImagePromptInputPolicyType {
  const resolved = resolveImageReferencePolicy(
    {
      referenceImage: {
        required: args.required,
        minCount: args.minCount,
        maxCount: args.maxCount,
        enforceInCustomMode: args.enforceInCustomMode,
      },
    },
    args.provider,
  );

  return {
    referenceImage: {
      required: resolved.required,
      minCount: resolved.minCount,
      maxCount: resolved.maxCount,
      enforceInCustomMode: resolved.enforceInCustomMode,
    },
  };
}

export function countImageReferenceInputs(baseImages?: BaseImageType[]) {
  return Array.isArray(baseImages) ? baseImages.filter((item) => Boolean(item?.data)).length : 0;
}

function toSearchableToken(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

export function isEcommerceImagePromptTemplate(item?: Pick<PromptItemType, "key" | "categories" | "tags" | "defaultParams"> | null) {
  if (!item) return false;

  const key = toSearchableToken(item.key);
  if (key.startsWith("ecommerce-") || key.startsWith("commerce-")) return true;

  const explicitHint = toSearchableToken(toUnknownRecord(item.defaultParams).referenceHint);
  if (explicitHint === "ecommerce" || explicitHint === "product") return true;

  const labels = [...(item.categories || []), ...(item.tags || [])].map(toSearchableToken);
  return labels.some((label) => label === "ecommerce" || label === "e-commerce" || label === "commerce" || label === "쇼핑몰");
}
