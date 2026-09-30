import type { ImageModelNameType } from "consts/ai";
import type { ImageProviderType } from "types/ai";
import { inferProviderFromModelName } from "./genStudioHelpers";
import { getPerImageCost } from "../payment";

function sanitizeModelName(value: unknown) {
  return String(value || "").trim();
}

export function isSameModelNameList(a: readonly string[], b: readonly string[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (String(a[i] || "") !== String(b[i] || "")) return false;
  }
  return true;
}

export function normalizeSelectedModelNames(
  modelNames: readonly string[],
  fallbackModelName: string,
): ImageModelNameType[] {
  const deduped = Array.from(new Set((modelNames || []).map(sanitizeModelName).filter(Boolean)));
  if (deduped.length > 0) return deduped as ImageModelNameType[];

  const fallback = sanitizeModelName(fallbackModelName);
  return (fallback ? [fallback] : []) as ImageModelNameType[];
}

export function toggleSelectedModelName(
  modelNames: readonly string[],
  targetModelName: string,
  fallbackModelName: string,
): ImageModelNameType[] {
  const target = sanitizeModelName(targetModelName);
  const normalized = normalizeSelectedModelNames(modelNames, fallbackModelName).map((v) => String(v));
  if (!target) return normalized as ImageModelNameType[];

  const has = normalized.includes(target);
  if (has) {
    if (normalized.length === 1) return normalized as ImageModelNameType[];
    return normalized.filter((v) => v !== target) as ImageModelNameType[];
  }
  return [...normalized, target] as ImageModelNameType[];
}

export function hasSelectedProvider(modelNames: readonly string[], provider: ImageProviderType) {
  return modelNames.some((m) => inferProviderFromModelName(String(m || "")) === provider);
}

export function sumSelectedPerImageCoins(modelNames: readonly string[], variantByModel?: Record<string, string | undefined>) {
  let total = 0;
  for (const name of modelNames) {
    const modelName = sanitizeModelName(name);
    if (!modelName) continue;
    const provider = inferProviderFromModelName(modelName);
    const perImage = getPerImageCost(provider, modelName, "image", variantByModel?.[modelName]);
    if (perImage == null) return null;
    total += perImage;
  }
  return total;
}
