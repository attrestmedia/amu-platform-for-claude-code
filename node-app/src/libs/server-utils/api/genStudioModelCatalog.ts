import {
  IMAGE_REF_LIMIT_BY_PROVIDER,
  OPENAI_COMPAT_IMAGE_SIZES,
  OPENAI_COMPAT_UI_RATIOS,
  getSupportedGoogleAspectRatios,
  getSupportedGoogleImageSizes,
  getSupportedOpenAIAspectRatios,
} from "consts/ai";
import { listSystemModelCatalog, type SystemModelCatalogItem } from "libs/server-utils/api/systemModelControl";
import { createSystemPricingSnapshotRevision, getSystemPricingMaps } from "libs/server-utils/api/systemPricingControl";

export type GenStudioModelCatalogType = "all" | "audio" | "image" | "text" | "video";

export type GenStudioModelCatalogItem = {
  name: string;
  displayName: string;
  upstreamModelName: string;
  aspectRatios?: string[];
  sizes?: string[];
  enabled?: boolean;
  adminOnly?: boolean;
  defaultModel?: boolean;
  recommendedModel?: boolean;
  supportsImageInput?: boolean;
  deprecated?: boolean;
};

export type GenStudioModelCatalogProvider = {
  provider: string;
  defaultModelName: string;
  modelCount: number;
  referenceLimit?: number;
  models: GenStudioModelCatalogItem[];
};

export type GenStudioModelCatalogSection = {
  totalProviders: number;
  totalModels: number;
  countByProvider: Record<string, number>;
  providers: GenStudioModelCatalogProvider[];
};

export type GenStudioModelCatalogResult = {
  type: GenStudioModelCatalogType;
  pricingRevision: string;
  audio?: GenStudioModelCatalogSection;
  image?: GenStudioModelCatalogSection;
  text?: GenStudioModelCatalogSection;
  video?: GenStudioModelCatalogSection;
};

function groupCatalogItems(
  catalog: Awaited<ReturnType<typeof listSystemModelCatalog>>,
  modality: GenStudioModelCatalogType,
) {
  return catalog.reduce<Record<string, SystemModelCatalogItem[]>>((acc, item) => {
    if (item.modality !== modality) return acc;
    acc[item.provider] = acc[item.provider] || [];
    acc[item.provider].push(item);
    return acc;
  }, {});
}

function buildSection(
  providersByName: Record<string, SystemModelCatalogItem[]>,
  modality: "audio" | "image" | "text" | "video",
): GenStudioModelCatalogSection {
  const providers = Object.entries(providersByName)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([provider, items]) => {
      const sortedItems = [...items].sort((a, b) => a.modelName.localeCompare(b.modelName));
      const models = sortedItems.map((item) => ({
        name: item.modelName,
        displayName: item.displayName,
        upstreamModelName: item.upstreamModelName,
        aspectRatios:
          modality === "image"
            ? provider === "google"
              ? [...getSupportedGoogleAspectRatios(item.modelName)]
              : provider === "openai"
                ? [...getSupportedOpenAIAspectRatios(item.modelName)]
              : [...OPENAI_COMPAT_UI_RATIOS]
            : undefined,
        sizes:
          modality === "image"
            ? provider === "google"
              ? [...getSupportedGoogleImageSizes(item.modelName)]
              : [...OPENAI_COMPAT_IMAGE_SIZES]
            : undefined,
        enabled: item.enabled,
        adminOnly: item.adminOnly,
        defaultModel: item.defaultModel,
        recommendedModel: item.recommendedModel,
        supportsImageInput: item.supportsImageInput,
        deprecated: item.deprecated,
      }));
      // EL-202 — audio는 modality 단위 기본 모델을 갖지 않는다(역할별 기본값은 speech 정책 소유).
      // 첫 항목을 기본값으로 승격하면 서비스가 임의 speech 모델을 기본으로 읽는다.
      const defaultModelName =
        modality === "audio"
          ? ""
          : sortedItems.find((item) => item.defaultModel)?.modelName || sortedItems[0]?.modelName || "";

      return {
        provider,
        defaultModelName,
        modelCount: models.length,
        referenceLimit: modality === "image" ? IMAGE_REF_LIMIT_BY_PROVIDER[provider as keyof typeof IMAGE_REF_LIMIT_BY_PROVIDER] : undefined,
        models,
      };
    });

  return {
    totalProviders: providers.length,
    totalModels: providers.reduce((sum, provider) => sum + provider.modelCount, 0),
    countByProvider: Object.fromEntries(providers.map((provider) => [provider.provider, provider.modelCount])),
    providers,
  };
}

export async function listGenStudioModelCatalog(args: {
  type?: GenStudioModelCatalogType;
} = {}): Promise<GenStudioModelCatalogResult> {
  const type = args.type || "all";
  const [catalog, pricingMaps] = await Promise.all([listSystemModelCatalog(), getSystemPricingMaps()]);

  return {
    type,
    pricingRevision: createSystemPricingSnapshotRevision(pricingMaps),
    audio: type === "all" || type === "audio" ? buildSection(groupCatalogItems(catalog, "audio"), "audio") : undefined,
    image: type === "all" || type === "image" ? buildSection(groupCatalogItems(catalog, "image"), "image") : undefined,
    text: type === "all" || type === "text" ? buildSection(groupCatalogItems(catalog, "text"), "text") : undefined,
    video: type === "all" || type === "video" ? buildSection(groupCatalogItems(catalog, "video"), "video") : undefined,
  };
}
