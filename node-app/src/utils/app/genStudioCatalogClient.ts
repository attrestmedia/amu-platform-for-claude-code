import type { GenStudioModelCatalogClientProvider, GenStudioModelCatalogClientSection } from "libs/api/lab/modelCatalog";

export type CatalogImageModelOption = {
  provider: string;
  modelName: string;
  displayName: string;
  upstreamModelName: string;
  aspectRatios?: string[];
  sizes?: string[];
  recommendedModel?: boolean;
  deprecated?: boolean;
};

export type CatalogVideoModelOption = {
  provider: string;
  modelName: string;
  displayName: string;
  upstreamModelName: string;
  recommendedModel?: boolean;
  deprecated?: boolean;
};

export function getCatalogDefaultModelByProvider(section?: GenStudioModelCatalogClientSection | null) {
  return Object.fromEntries(
    (section?.providers || []).map((provider) => [provider.provider, String(provider.defaultModelName || "").trim()]),
  ) as Record<string, string>;
}

export function getCatalogModelsByProvider(section?: GenStudioModelCatalogClientSection | null) {
  return Object.fromEntries(
    (section?.providers || []).map((provider) => [provider.provider, provider.models || []]),
  ) as Record<string, GenStudioModelCatalogClientProvider["models"]>;
}

export function getCatalogImageModelOptions(section?: GenStudioModelCatalogClientSection | null): CatalogImageModelOption[] {
  return (section?.providers || []).flatMap((provider) =>
    (provider.models || []).map((model) => ({
      provider: provider.provider,
      modelName: model.name,
      displayName: model.displayName,
      upstreamModelName: model.upstreamModelName,
      aspectRatios: model.aspectRatios,
      sizes: model.sizes,
      recommendedModel: model.recommendedModel,
      deprecated: model.deprecated,
    })),
  );
}

export function getCatalogVideoModelOptions(section?: GenStudioModelCatalogClientSection | null): CatalogVideoModelOption[] {
  return (section?.providers || []).flatMap((provider) =>
    (provider.models || []).map((model) => ({
      provider: provider.provider,
      modelName: model.name,
      displayName: model.displayName,
      upstreamModelName: model.upstreamModelName,
      recommendedModel: model.recommendedModel,
      deprecated: model.deprecated,
    })),
  );
}

export function getCatalogReferenceLimitByProvider(section?: GenStudioModelCatalogClientSection | null) {
  return Object.fromEntries(
    (section?.providers || []).map((provider) => [provider.provider, Number(provider.referenceLimit || 0)]),
  ) as Record<string, number>;
}
