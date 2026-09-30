import { SPEECH_MODEL_CATALOG, type SpeechModelPolicy } from "consts/ai/speechModel";
import { ELEVENLABS_DEFAULT_TTS_MODEL } from "consts/ai/voiceCatalog";
import {
  DEFAULT_IMAGE_MODEL_BY_PROVIDER,
  DEFAULT_TEXT_MODEL_BY_PROVIDER,
  IMAGE_REF_LIMIT_BY_PROVIDER,
  IMAGE_SELECTABLE_MODEL_MAP,
  OPENAI_COMPAT_IMAGE_SIZES,
  OPENAI_COMPAT_UI_RATIOS,
  TEXT_MODEL_MAP,
  supportsTextModelImageInput,
  supportsTextModelAudioInput,
  supportsTextModelAudioUnderstanding,
  getImageModelAliasLabel,
  getSupportedGoogleAspectRatios,
  getSupportedGoogleImageSizes,
  getSupportedOpenAIAspectRatios,
  resolveUpstreamModelName,
} from "consts/ai";
import fetchClient from "libs/api/fetchClient";

export type GenStudioModelCatalogClientType = "all" | "audio" | "image" | "text" | "video";

export type GenStudioModelCatalogClientItem = {
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
  supportsAudioInput?: boolean;
  supportsAudioUnderstanding?: boolean;
  deprecated?: boolean;
};

export type GenStudioModelCatalogClientProvider = {
  provider: string;
  defaultModelName: string;
  modelCount: number;
  referenceLimit?: number;
  models: GenStudioModelCatalogClientItem[];
};

export type GenStudioModelCatalogClientSection = {
  totalProviders: number;
  totalModels: number;
  countByProvider: Record<string, number>;
  providers: GenStudioModelCatalogClientProvider[];
};

export type GenStudioModelCatalogClientResult = {
  type: GenStudioModelCatalogClientType;
  source: "server" | "fallback";
  policy?: {
    hideDisabled: boolean;
    hideAdminOnly: boolean;
    showDeprecated: boolean;
  };
  pricingRevision?: string;
  image?: GenStudioModelCatalogClientSection | null;
  text?: GenStudioModelCatalogClientSection | null;
  video?: GenStudioModelCatalogClientSection | null;
  audio?: GenStudioModelCatalogClientSection | null;
};

function buildTextSection(): GenStudioModelCatalogClientSection {
  const providers = Object.entries(TEXT_MODEL_MAP).map(([provider, modelNames]) => {
    const models = [...modelNames].map((modelName) => ({
      name: modelName,
      displayName: modelName,
      upstreamModelName: resolveUpstreamModelName(provider, modelName),
      enabled: true,
      adminOnly: false,
      defaultModel: DEFAULT_TEXT_MODEL_BY_PROVIDER[provider as keyof typeof DEFAULT_TEXT_MODEL_BY_PROVIDER] === modelName,
      recommendedModel: false,
      supportsImageInput: supportsTextModelImageInput(modelName),
      supportsAudioInput: supportsTextModelAudioInput(modelName),
      supportsAudioUnderstanding: supportsTextModelAudioUnderstanding(modelName),
      deprecated: false,
    }));
    const defaultModelName =
      DEFAULT_TEXT_MODEL_BY_PROVIDER[provider as keyof typeof DEFAULT_TEXT_MODEL_BY_PROVIDER] || models[0]?.name || "";
    return {
      provider,
      defaultModelName,
      modelCount: models.length,
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

function buildImageSection(): GenStudioModelCatalogClientSection {
  const providers = Object.entries(IMAGE_SELECTABLE_MODEL_MAP).map(([provider, modelNames]) => {
    const models = [...modelNames].map((modelName) => ({
      name: modelName,
      displayName: getImageModelAliasLabel(provider, modelName) || modelName,
      upstreamModelName: resolveUpstreamModelName(provider, modelName),
      aspectRatios:
        provider === "google"
          ? [...getSupportedGoogleAspectRatios(modelName)]
          : provider === "openai"
            ? [...getSupportedOpenAIAspectRatios(modelName)]
            : [...OPENAI_COMPAT_UI_RATIOS],
      sizes: provider === "google" ? [...getSupportedGoogleImageSizes(modelName)] : [...OPENAI_COMPAT_IMAGE_SIZES],
      enabled: true,
      adminOnly: false,
      defaultModel: DEFAULT_IMAGE_MODEL_BY_PROVIDER[provider as keyof typeof DEFAULT_IMAGE_MODEL_BY_PROVIDER] === modelName,
      recommendedModel: false,
      deprecated: false,
    }));
    const defaultModelName =
      DEFAULT_IMAGE_MODEL_BY_PROVIDER[provider as keyof typeof DEFAULT_IMAGE_MODEL_BY_PROVIDER] || models[0]?.name || "";
    return {
      provider,
      defaultModelName,
      modelCount: models.length,
      referenceLimit: IMAGE_REF_LIMIT_BY_PROVIDER[provider as keyof typeof IMAGE_REF_LIMIT_BY_PROVIDER],
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

function buildVideoSection(): GenStudioModelCatalogClientSection {
  return {
    totalProviders: 0,
    totalModels: 0,
    countByProvider: {},
    providers: [],
  };
}

/**
 * EL-502 — audio(TTS) client section. 서버 route가 audio section을 아직 내려보내지 않으므로
 * client가 코드 정책(SPEECH_MODEL_CATALOG)에서 직접 조립해 round-trip을 보장한다.
 * 서비스 노출은 G-EL-PILOT 전까지 off이므로 enabled=false로 내려 UI가 임의 노출하지 않는다.
 */
function buildAudioSection(): GenStudioModelCatalogClientSection {
  const policies: readonly SpeechModelPolicy[] = SPEECH_MODEL_CATALOG;
  const models = policies
    .filter((policy) => policy.provider === "elevenlabs" && policy.roles.includes("speech_tts") && policy.billingUnit === "character")
    .map((policy) => ({
      name: policy.modelName,
      displayName: policy.modelName,
      upstreamModelName: policy.documentedModelId || policy.modelName,
      enabled: false,
      adminOnly: true,
      defaultModel: policy.modelName === ELEVENLABS_DEFAULT_TTS_MODEL,
      recommendedModel: false,
      deprecated: false,
    }));

  return {
    totalProviders: models.length ? 1 : 0,
    totalModels: models.length,
    countByProvider: models.length ? { elevenlabs: models.length } : {},
    providers: models.length
      ? [{ provider: "elevenlabs", defaultModelName: ELEVENLABS_DEFAULT_TTS_MODEL, modelCount: models.length, models }]
      : [],
  };
}

function buildFallbackGenStudioModelCatalog(type: GenStudioModelCatalogClientType): GenStudioModelCatalogClientResult {
  return {
    type,
    source: "fallback",
    pricingRevision: "pricing-fallback",
    policy: {
      hideDisabled: true,
      hideAdminOnly: true,
      showDeprecated: true,
    },
    image: type === "all" || type === "image" ? buildImageSection() : null,
    text: type === "all" || type === "text" ? buildTextSection() : null,
    video: type === "all" || type === "video" ? buildVideoSection() : null,
    audio: type === "all" || type === "audio" ? buildAudioSection() : null,
  };
}

export async function fetchGenStudioModelCatalog(
  type: GenStudioModelCatalogClientType = "all",
): Promise<GenStudioModelCatalogClientResult> {
  try {
    const out = await fetchClient.get<GenStudioModelCatalogClientResult>("/lab/gen-studio-model-catalog", {
      params: { type },
      responseType: "json",
    });
    const wantsAudio = type === "all" || type === "audio";
    return {
      ...out.data,
      source: out.data?.source === "server" ? "server" : "fallback",
      audio: out.data?.audio ?? (wantsAudio ? buildAudioSection() : null),
    };
  } catch {
    return buildFallbackGenStudioModelCatalog(type);
  }
}
