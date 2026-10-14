import "server-only";
import {
  AI_PROVIDER_TYPES,
  IMAGE_PROVIDER_TYPES,
  VIDEO_PROVIDER_TYPES,
  computeDefaultInvariant,
  enabledAdminOnlyToLaunchState,
  getImageModelAliasLabel,
  getModelLaunchState,
  getPolicyReasoningEffort,
  getReasoningEffortLevels,
  launchStateToEnabledAdminOnly,
  isPreApprovalLockedModel,
  normalizeReasoningEffort,
  resolveUpstreamModelName,
  supportsReasoningEffort,
  TEXT_PROVIDER_TYPES,
  supportsTextModelAudioInput,
  supportsTextModelAudioUnderstanding,
  supportsTextModelImageInput,
  computeSpeechRoleDefaultInvariant,
  getDefaultSpeechModelName,
  getSpeechModelPolicy,
  listSpeechModelPolicies,
  type DefaultInvariantViolationType,
  type ModelLaunchStateType,
  type SpeechRoleDefaultInvariantViolationType,
} from "consts/ai";
import type { ImageProviderType, TextProviderType } from "types/ai";
import type { SystemModelCatalogModalityType } from "models/system";
import { canSelectSystemModel, resolveSystemModelAccessActor } from "libs/server-utils/ai/systemModelAccess";
import { assertModelProfileNotEmergencyDisabledOrThrow } from "libs/server-utils/ai/modelEmergencyDisable";
import {
  AI_MODEL_CATALOG,
  AI_DEFAULT_IMAGE_MODEL_BY_PROVIDER,
  AI_DEFAULT_TEXT_MODEL_BY_PROVIDER,
  AI_DEFAULT_VIDEO_MODEL_BY_PROVIDER,
  AI_DEPRECATED_XAI_TEXT_MODELS,
  AI_IMAGE_SELECTABLE_MODEL_MAP,
  AI_VIDEO_MODEL_MAP,
  AI_QWEN_IMAGE_MODEL_CATALOG,
  AI_QWEN_TEXT_MODEL_CATALOG,
  AI_TEXT_MODEL_MAP,
} from "consts/ai/generated/modelCatalog.generated";

export type SystemModelControlModalityType = SystemModelCatalogModalityType;
export type SystemModelCatalogStatusType = "active" | "deprecated";

export type SystemModelCatalogItem = {
  key: string;
  provider: string;
  modelName: string;
  modality: SystemModelControlModalityType;
  displayName: string;
  upstreamModelName: string;
  enabled: boolean;
  adminOnly: boolean;
  defaultModel: boolean;
  recommendedModel: boolean;
  supportsImageInput: boolean;
  /** TUTORS-193 D2 — audio(원음) 입력 수신 가능 여부. */
  supportsAudioInput: boolean;
  /** TUTORS-193 D2 — audio 이해 실호출 증거 등록 여부. */
  supportsAudioUnderstanding: boolean;
  supportsReasoningEffort: boolean;
  reasoningEffort: string;
  policyReasoningEffort: string;
  reasoningEffortLevels: string[];
  status: SystemModelCatalogStatusType;
  deprecated: boolean;
  catalogSource: "policy" | "manifest";
  policyDefaultModel: boolean;
  launchState: ModelLaunchStateType;
  policyLaunchState?: ModelLaunchStateType;
  overrides: string[];
  invariantViolation?: DefaultInvariantViolationType | SpeechRoleDefaultInvariantViolationType;
};

/**
 * audio 행의 기본값 판정. modality scope 기본값이 아니라 **역할별 기본값**을 검사한다
 * (ADR-EL-001 D7 — 역할 기본값은 별도 role mapping).
 * 이 모델이 어떤 역할의 기본값으로 지정돼 있을 때만 검사 대상이다.
 */
function computeAudioInvariant(item: {
  provider: string;
  modelName: string;
  enabled: boolean;
  deprecated: boolean;
}): SpeechRoleDefaultInvariantViolationType | undefined {
  const policy = getSpeechModelPolicy(item.provider, item.modelName);
  if (!policy) return undefined;
  for (const role of policy.roles) {
    if (getDefaultSpeechModelName(item.provider, role) !== item.modelName) continue;
    const violation = computeSpeechRoleDefaultInvariant({
      provider: item.provider,
      modelName: item.modelName,
      role,
      enabled: item.enabled,
      deprecated: item.deprecated,
    });
    if (violation) return violation;
  }
  return undefined;
}

function modelKey(provider: string, modelName: string, modality: SystemModelControlModalityType) {
  return `${provider}:${modelName}:${modality}`;
}

function resolveDefaultDisplayName(provider: string, modelName: string, modality: SystemModelControlModalityType) {
  if (modality === "image") {
    const aliasLabel = getImageModelAliasLabel(provider, modelName);
    if (aliasLabel) return aliasLabel;
  }
  return modelName;
}

/**
 * G-MCG-02 — 정책값과 다른 가변 필드를 표기한다.
 * - capability(supportsImageInput·supportsAudioInput·supportsAudioUnderstanding·supportsReasoningEffort)는
 *   override 대상이 아니다.
 * - enabled/adminOnly는 launchState 한 축으로 통합 표기한다(계약 §4.3).
 */
function computeOverrides(item: SystemModelCatalogItem): string[] {
  const overrides: string[] = [];
  if (item.launchState !== item.policyLaunchState) overrides.push("launchState");
  if (item.defaultModel !== item.policyDefaultModel) overrides.push("defaultModel");
  if (item.recommendedModel) overrides.push("recommendedModel");
  if (item.supportsReasoningEffort && item.reasoningEffort !== item.policyReasoningEffort) {
    overrides.push("reasoningEffort");
  }
  if (item.deprecated) overrides.push("status");
  return overrides;
}

export function listBootstrapModelCatalog(): SystemModelCatalogItem[] {
  const image = (IMAGE_PROVIDER_TYPES as readonly (keyof typeof AI_IMAGE_SELECTABLE_MODEL_MAP)[]).flatMap((provider) =>
    (AI_IMAGE_SELECTABLE_MODEL_MAP as Readonly<Record<ImageProviderType, readonly string[]>>)[provider].map((modelName) => ({
      key: modelKey(provider, modelName, "image"),
      provider,
      modelName,
      modality: "image" as const,
      displayName: resolveDefaultDisplayName(provider, modelName, "image"),
      upstreamModelName: resolveUpstreamModelName(provider, modelName),
      ...launchStateToEnabledAdminOnly(getModelLaunchState(provider, modelName, "image")),
      launchState: getModelLaunchState(provider, modelName, "image"),
      policyLaunchState: getModelLaunchState(provider, modelName, "image"),
      defaultModel: String(AI_DEFAULT_IMAGE_MODEL_BY_PROVIDER[provider] || "").trim() === modelName,
      recommendedModel: false,
      supportsImageInput: false,
      supportsAudioInput: false,
      supportsAudioUnderstanding: false,
      supportsReasoningEffort: false,
      reasoningEffort: "",
      policyReasoningEffort: "",
      reasoningEffortLevels: [],
      status: "active" as const,
      deprecated: false,
      catalogSource: "policy" as const,
      policyDefaultModel: String(AI_DEFAULT_IMAGE_MODEL_BY_PROVIDER[provider] || "").trim() === modelName,
      overrides: [],
    })),
  );

  const qwenImage = AI_QWEN_IMAGE_MODEL_CATALOG.map((modelName) => ({
    key: modelKey("qwen", modelName, "image"),
    provider: "qwen",
    modelName,
    modality: "image" as const,
    displayName: resolveDefaultDisplayName("qwen", modelName, "image"),
    upstreamModelName: resolveUpstreamModelName("qwen", modelName),
    ...launchStateToEnabledAdminOnly(getModelLaunchState("qwen", modelName, "image")),
    launchState: getModelLaunchState("qwen", modelName, "image"),
    policyLaunchState: getModelLaunchState("qwen", modelName, "image"),
    defaultModel: AI_DEFAULT_IMAGE_MODEL_BY_PROVIDER.qwen === modelName,
    recommendedModel: false,
    supportsImageInput: false,
    supportsAudioInput: false,
    supportsAudioUnderstanding: false,
    supportsReasoningEffort: false,
    reasoningEffort: "",
    policyReasoningEffort: "",
    reasoningEffortLevels: [] as string[],
    status: "active" as const,
    deprecated: false,
    catalogSource: "policy" as const,
    policyDefaultModel: AI_DEFAULT_IMAGE_MODEL_BY_PROVIDER.qwen === modelName,
    overrides: [],
  }));

  const text = (TEXT_PROVIDER_TYPES as readonly (keyof typeof AI_TEXT_MODEL_MAP)[]).flatMap((provider) =>
    (AI_TEXT_MODEL_MAP[provider] as readonly string[]).map((modelName) => ({
        key: modelKey(provider, modelName, "text"),
        provider,
        modelName,
        modality: "text" as const,
        displayName: resolveDefaultDisplayName(provider, modelName, "text"),
        upstreamModelName: resolveUpstreamModelName(provider, modelName),
        ...launchStateToEnabledAdminOnly(getModelLaunchState(provider, modelName, "text")),
        launchState: getModelLaunchState(provider, modelName, "text"),
        policyLaunchState: getModelLaunchState(provider, modelName, "text"),
        defaultModel: String(AI_DEFAULT_TEXT_MODEL_BY_PROVIDER[provider] || "").trim() === modelName,
        recommendedModel: false,
        supportsImageInput: supportsTextModelImageInput(modelName),
        supportsAudioInput: supportsTextModelAudioInput(modelName),
        supportsAudioUnderstanding: supportsTextModelAudioUnderstanding(modelName),
        supportsReasoningEffort: supportsReasoningEffort(provider, modelName, "text"),
        reasoningEffort: getPolicyReasoningEffort(provider, modelName, "text"),
        policyReasoningEffort: getPolicyReasoningEffort(provider, modelName, "text"),
        reasoningEffortLevels: [...getReasoningEffortLevels(provider, modelName, "text")],
        status: "active" as const,
        deprecated: false,
        catalogSource: "policy" as const,
        policyDefaultModel: String(AI_DEFAULT_TEXT_MODEL_BY_PROVIDER[provider] || "").trim() === modelName,
        overrides: [],
      })),
  );

  const deprecatedXaiText = AI_DEPRECATED_XAI_TEXT_MODELS.map((modelName) => {
    const launchState = getModelLaunchState("xai", modelName, "text");
    return {
      key: modelKey("xai", modelName, "text"),
      provider: "xai",
      modelName,
      modality: "text" as const,
      displayName: resolveDefaultDisplayName("xai", modelName, "text"),
      upstreamModelName: resolveUpstreamModelName("xai", modelName),
      ...launchStateToEnabledAdminOnly(launchState),
      launchState,
      policyLaunchState: launchState,
      defaultModel: false,
      recommendedModel: false,
      supportsImageInput: supportsTextModelImageInput(modelName),
      supportsAudioInput: supportsTextModelAudioInput(modelName),
      supportsAudioUnderstanding: supportsTextModelAudioUnderstanding(modelName),
      supportsReasoningEffort: supportsReasoningEffort("xai", modelName, "text"),
      reasoningEffort: getPolicyReasoningEffort("xai", modelName, "text"),
      policyReasoningEffort: getPolicyReasoningEffort("xai", modelName, "text"),
      reasoningEffortLevels: [...getReasoningEffortLevels("xai", modelName, "text")],
      status: "deprecated" as const,
      deprecated: true,
      catalogSource: "policy" as const,
      policyDefaultModel: false,
      overrides: [],
    };
  });

  const qwenText = AI_QWEN_TEXT_MODEL_CATALOG.map((modelName) => ({
    key: modelKey("qwen", modelName, "text"),
    provider: "qwen",
    modelName,
    modality: "text" as const,
    displayName: resolveDefaultDisplayName("qwen", modelName, "text"),
    upstreamModelName: resolveUpstreamModelName("qwen", modelName),
    ...launchStateToEnabledAdminOnly(getModelLaunchState("qwen", modelName, "text")),
    launchState: getModelLaunchState("qwen", modelName, "text"),
    policyLaunchState: getModelLaunchState("qwen", modelName, "text"),
    defaultModel: AI_DEFAULT_TEXT_MODEL_BY_PROVIDER.qwen === modelName,
    recommendedModel: false,
    supportsImageInput: true,
    supportsAudioInput: false,
    supportsAudioUnderstanding: false,
    supportsReasoningEffort: false,
    reasoningEffort: "",
    policyReasoningEffort: "",
    reasoningEffortLevels: [] as string[],
    status: "active" as const,
    deprecated: false,
    catalogSource: "policy" as const,
    policyDefaultModel: AI_DEFAULT_TEXT_MODEL_BY_PROVIDER.qwen === modelName,
    overrides: [],
  }));

  const video = (VIDEO_PROVIDER_TYPES as readonly (keyof typeof AI_VIDEO_MODEL_MAP)[]).flatMap((provider) =>
    AI_VIDEO_MODEL_MAP[provider].map((modelName) => ({
      key: modelKey(provider, modelName, "video"),
      provider,
      modelName,
      modality: "video" as const,
      displayName: resolveDefaultDisplayName(provider, modelName, "video"),
      upstreamModelName: resolveUpstreamModelName(provider, modelName),
      ...launchStateToEnabledAdminOnly(getModelLaunchState(provider, modelName, "video")),
      launchState: getModelLaunchState(provider, modelName, "video"),
      policyLaunchState: getModelLaunchState(provider, modelName, "video"),
      defaultModel: String(AI_DEFAULT_VIDEO_MODEL_BY_PROVIDER[provider] || "").trim() === modelName,
      recommendedModel: false,
      supportsImageInput: false,
      supportsAudioInput: false,
      supportsAudioUnderstanding: false,
      supportsReasoningEffort: false,
      reasoningEffort: "",
      policyReasoningEffort: "",
      reasoningEffortLevels: [],
      status: "active" as const,
      deprecated: false,
      catalogSource: "policy" as const,
      policyDefaultModel: String(AI_DEFAULT_VIDEO_MODEL_BY_PROVIDER[provider] || "").trim() === modelName,
      overrides: [],
    })),
  );

  // EL-202 — audio(speech) modality. 역할·capability·readiness는 consts/ai/speechModel.ts가 소유하고
  // 여기서는 기존 카탈로그 항목과 같은 모양으로만 노출한다.
  // launchState는 getModelLaunchState가 speech 정책에서 해석하므로 미등록 모델은 internal로 떨어진다.
  const audio = listSpeechModelPolicies().map((policy) => ({
    key: modelKey(policy.provider, policy.modelName, "audio"),
    provider: policy.provider as string,
    modelName: policy.modelName,
    modality: "audio" as const,
    displayName: resolveDefaultDisplayName(policy.provider, policy.modelName, "audio"),
    upstreamModelName:
      policy.upstreamCertainty === "verified" ? resolveUpstreamModelName(policy.provider, policy.modelName) : "",
    ...launchStateToEnabledAdminOnly(getModelLaunchState(policy.provider, policy.modelName, "audio")),
    launchState: getModelLaunchState(policy.provider, policy.modelName, "audio"),
    policyLaunchState: getModelLaunchState(policy.provider, policy.modelName, "audio"),
    // modality scope 기본값은 audio에 두지 않는다. 역할 기본값은 speechModel.ts가 별도로 판정한다.
    defaultModel: false,
    recommendedModel: false,
    supportsImageInput: false,
    supportsAudioInput: false,
    supportsAudioUnderstanding: false,
    supportsReasoningEffort: false,
    reasoningEffort: "",
    policyReasoningEffort: "",
    reasoningEffortLevels: [] as string[],
    status: "active" as const,
    deprecated: false,
    catalogSource: "policy" as const,
    policyDefaultModel: false,
    overrides: [],
  }));

  return [...audio, ...image, ...qwenImage, ...text, ...deprecatedXaiText, ...qwenText, ...video];
}

export async function listSystemModelCatalog() {
  const bootstrap = listBootstrapModelCatalog();
  const manifestProfilesByKey = new Map(
    AI_MODEL_CATALOG.models
      .filter((model) => model.entryKind === "model")
      .flatMap((model) =>
        model.modalities.map((profile) => [
          modelKey(model.provider, model.modelName, profile.modality),
          profile.recommended,
        ] as const),
      ),
  );
  const manifestBacked = bootstrap.map((item) => ({
    ...item,
    displayName: String(item.displayName || item.modelName).trim(),
    upstreamModelName: String(item.upstreamModelName || item.modelName).trim(),
    recommendedModel: item.deprecated ? false : manifestProfilesByKey.get(item.key) ?? false,
    reasoningEffort: item.supportsReasoningEffort
      ? normalizeReasoningEffort({
          provider: item.provider,
          modelName: item.modelName,
          modality: item.modality,
          value: undefined,
        })
      : "",
    catalogSource: "manifest" as const,
  }));

  const catalog = manifestBacked
    .map((item) => {
      const preApprovalLocked = isPreApprovalLockedModel(item.provider, item.modelName, item.modality);
      const effectiveItem = preApprovalLocked
        ? {
            ...item,
            enabled: false,
            adminOnly: true,
            defaultModel: false,
            recommendedModel: false,
            launchState: "internal" as const,
          }
        : item.modality === "audio"
          ? { ...item, defaultModel: false }
          : item;
      const launchState = enabledAdminOnlyToLaunchState(effectiveItem.enabled, effectiveItem.adminOnly);
      return {
        ...effectiveItem,
        launchState,
        overrides: computeOverrides({ ...effectiveItem, launchState }),
        invariantViolation:
          effectiveItem.modality === "audio"
            ? computeAudioInvariant({
                provider: effectiveItem.provider,
                modelName: effectiveItem.modelName,
                enabled: effectiveItem.enabled,
                deprecated: effectiveItem.deprecated,
              })
            : computeDefaultInvariant({
                modality: effectiveItem.modality,
                enabled: effectiveItem.enabled,
                adminOnly: effectiveItem.adminOnly,
                deprecated: effectiveItem.deprecated,
                defaultModel: effectiveItem.defaultModel,
                policyDefaultModel: effectiveItem.policyDefaultModel,
              }),
      };
    })
    .sort((a, b) => {
      const modalityDiff = a.modality.localeCompare(b.modality);
      if (modalityDiff !== 0) return modalityDiff;
      const providerDiff = a.provider.localeCompare(b.provider);
      if (providerDiff !== 0) return providerDiff;
      return a.modelName.localeCompare(b.modelName);
    });

  return catalog;
}

export async function listSystemModelControls() {
  const catalog = await listSystemModelCatalog();
  return catalog.map(
    ({
      key,
      provider,
      modelName,
      modality,
      displayName,
      upstreamModelName,
      enabled,
      adminOnly,
      defaultModel,
      recommendedModel,
      supportsImageInput,
      supportsAudioInput,
      supportsAudioUnderstanding,
      supportsReasoningEffort: itemSupportsReasoningEffort,
      reasoningEffort,
      policyReasoningEffort,
      reasoningEffortLevels,
      status,
      deprecated,
      catalogSource,
      policyDefaultModel,
      launchState,
      policyLaunchState,
      overrides,
      invariantViolation,
    }) => ({
      key,
      provider,
      modelName,
      modality,
      displayName,
      upstreamModelName,
      enabled,
      adminOnly,
      defaultModel,
      recommendedModel,
      supportsImageInput,
      supportsAudioInput,
      supportsAudioUnderstanding,
      supportsReasoningEffort: itemSupportsReasoningEffort,
      reasoningEffort,
      policyReasoningEffort,
      reasoningEffortLevels,
      status,
      deprecated,
      catalogSource,
      policyDefaultModel,
      launchState,
      policyLaunchState,
      overrides,
      invariantViolation,
    }),
  );
}

export async function resolveSystemDefaultModelName(args: {
  provider: string;
  modality: SystemModelControlModalityType;
}) {
  const provider = String(args.provider || "").trim().toLowerCase();
  // Speech defaults are role-specific and owned by speechModel.ts. Audio has no modality-wide default.
  if (args.modality === "audio") return "";
  const catalog = await listSystemModelCatalog();
  const matches = catalog.filter((item) => item.provider === provider && item.modality === args.modality);
  const enabledDefault = matches.find((item) => item.defaultModel && item.enabled);
  if (enabledDefault) return enabledDefault.modelName;
  const enabledAny = matches.find((item) => item.enabled);
  if (enabledAny) return enabledAny.modelName;
  if (args.modality === "image") {
    return String(
      (AI_DEFAULT_IMAGE_MODEL_BY_PROVIDER as Record<string, string>)[provider] ||
        AI_DEFAULT_IMAGE_MODEL_BY_PROVIDER.google ||
        "",
    ).trim();
  }
  if (args.modality === "video") {
    return String(
      (AI_DEFAULT_VIDEO_MODEL_BY_PROVIDER as Record<string, string>)[provider] ||
        AI_DEFAULT_VIDEO_MODEL_BY_PROVIDER.google ||
        "",
    ).trim();
  }
  return String(
    (AI_DEFAULT_TEXT_MODEL_BY_PROVIDER as Record<string, string>)[provider] ||
      AI_DEFAULT_TEXT_MODEL_BY_PROVIDER.google ||
      "",
  ).trim();
}

export async function resolveSystemModelNameOrThrow(args: {
  provider: string;
  modelName?: string;
  modality: SystemModelControlModalityType;
  actor?: { user?: unknown };
}) {
  const provider = String(args.provider || "").trim().toLowerCase();
  const requestedModelName = String(args.modelName || "").trim();
  const catalog = await listSystemModelCatalog();
  const matches = catalog.filter((item) => item.provider === provider && item.modality === args.modality);
  const candidate = requestedModelName || (await resolveSystemDefaultModelName({ provider, modality: args.modality }));
  const hit = matches.find((item) => item.modelName === candidate);

  if (!hit) {
    const err = new Error("unsupported_model") as Error & { errorCode: string; status: number; detail?: unknown };
    err.errorCode = "UNSUPPORTED_MODEL";
    err.status = 400;
    err.detail = { provider, modelName: candidate, modality: args.modality };
    throw err;
  }

  if (!canSelectSystemModel(hit, resolveSystemModelAccessActor(args.actor?.user))) {
    const err = new Error("model_not_selectable") as Error & {
      errorCode: string;
      status: number;
      detail?: unknown;
    };
    err.errorCode = "MODEL_NOT_SELECTABLE";
    err.status = 403;
    err.detail = { provider, modelName: candidate, modality: args.modality };
    throw err;
  }

  return hit.modelName;
}

export async function inferSystemProviderFromModelName(args: {
  modelName?: string;
  modality?: SystemModelControlModalityType;
}): Promise<(typeof AI_PROVIDER_TYPES)[number] | ""> {
  const modelName = String(args.modelName || "").trim();
  if (!modelName) return "";

  const catalog = await listSystemModelCatalog();
  const matches = catalog.filter(
    (item) => item.modelName === modelName && (!args.modality || item.modality === args.modality),
  );
  const providers = Array.from(new Set(matches.map((item) => item.provider).filter(Boolean)));
  return providers.length === 1 ? ((providers[0] as (typeof AI_PROVIDER_TYPES)[number]) || "") : "";
}

export async function assertSystemModelEnabledOrThrow(args: {
  provider: string;
  modelName: string;
  modality: SystemModelControlModalityType;
}) {
  const catalog = await listSystemModelCatalog();
  const key = modelKey(args.provider, args.modelName, args.modality);
  const hit = catalog.find((item) => item.key === key);

  if (!hit) {
    const err = new Error("unsupported_model") as Error & { errorCode: string; status: number; detail?: unknown };
    err.errorCode = "UNSUPPORTED_MODEL";
    err.status = 400;
    throw err;
  }

  if (!hit.enabled) {
    const err = new Error("model_disabled") as Error & { errorCode: string; status: number; detail?: unknown };
    err.errorCode = "MODEL_DISABLED";
    err.status = 403;
    err.detail = { provider: args.provider, modelName: args.modelName, modality: args.modality };
    throw err;
  }

  await assertModelProfileNotEmergencyDisabledOrThrow(args);
}

export async function assertSystemModelSelectableOrThrow(args: {
  provider: string;
  modelName: string;
  modality: SystemModelControlModalityType;
  actor?: { user?: unknown };
}) {
  const catalog = await listSystemModelCatalog();
  const key = modelKey(args.provider, args.modelName, args.modality);
  const hit = catalog.find((item) => item.key === key);

  if (!hit) {
    const err = new Error("unsupported_model") as Error & { errorCode: string; status: number };
    err.errorCode = "UNSUPPORTED_MODEL";
    err.status = 400;
    throw err;
  }

  if (!canSelectSystemModel(hit, resolveSystemModelAccessActor(args.actor?.user))) {
    const err = new Error("model_not_selectable") as Error & {
      errorCode: string;
      status: number;
      detail?: unknown;
    };
    err.errorCode = "MODEL_NOT_SELECTABLE";
    err.status = 403;
    err.detail = {
      provider: args.provider,
      modelName: args.modelName,
      modality: args.modality,
    };
    throw err;
  }

  await assertModelProfileNotEmergencyDisabledOrThrow(args);

  return hit;
}

/**
 * 호출 시점의 reasoning effort를 해석한다. 어드민에서 저장한 값이 있으면 그 값을,
 * 없거나 조회에 실패하면 코드 정책 기본값을 쓴다(fail-safe).
 * 미지원 모델에는 빈 문자열을 돌려주며, 호출부는 빈 값이면 파라미터를 붙이지 않는다.
 */
export async function resolveSystemReasoningEffort(args: {
  provider: string;
  modelName: string;
  modality?: SystemModelControlModalityType;
}): Promise<string> {
  const provider = String(args.provider || "").trim().toLowerCase();
  const modelName = String(args.modelName || "").trim();
  const modality = args.modality || "text";
  const policyDefault = getPolicyReasoningEffort(provider, modelName, modality);
  if (!policyDefault) return "";

  try {
    const catalog = await listSystemModelCatalog();
    const hit = catalog.find((item) => item.key === modelKey(provider, modelName, modality));
    return hit?.reasoningEffort || policyDefault;
  } catch {
    return policyDefault;
  }
}

export async function assertSystemModelSupportsImageInputOrThrow(args: {
  provider: string;
  modelName: string;
}) {
  const catalog = await listSystemModelCatalog();
  const key = modelKey(args.provider, args.modelName, "text");
  const hit = catalog.find((item) => item.key === key);
  if (!hit) {
    const err = new Error("unsupported_model") as Error & { errorCode: string; status: number };
    err.errorCode = "UNSUPPORTED_MODEL";
    err.status = 400;
    throw err;
  }
  if (!hit.supportsImageInput) {
    const err = new Error("model_image_input_unsupported") as Error & {
      errorCode: string;
      status: number;
      detail?: unknown;
    };
    err.errorCode = "MODEL_IMAGE_INPUT_UNSUPPORTED";
    err.status = 400;
    err.detail = { provider: args.provider, modelName: args.modelName };
    throw err;
  }
}

/**
 * 이미지 입력을 지원하는 활성 텍스트 모델을 서버 카탈로그에서 선택한다.
 * 기본 모델이 비전을 지원하지 않아도 지원 모델 중에서 골라 반환하며, 사용 가능한 모델이
 * 없으면 null을 돌려준다. 호출 측은 이 값을 반드시 이미지 입력 생성에 사용해야 하고,
 * generateAndBillContent의 assertSystemModelSupportsImageInputOrThrow가 최종 게이트다.
 */
export async function resolveSystemVisionTextModel(): Promise<{
  provider: TextProviderType;
  modelName: string;
} | null> {
  const catalog = await listSystemModelCatalog();
  const visionModels = catalog.filter(
    (item) =>
      item.modality === "text" &&
      item.enabled &&
      item.supportsImageInput &&
      !item.adminOnly &&
      !item.deprecated,
  );
  if (visionModels.length === 0) return null;

  const providerPriority: TextProviderType[] = ["google", "openai", "claude", "xai", "zai", "deepseek"];
  const picked = [...visionModels].sort((a, b) => {
    if (a.defaultModel !== b.defaultModel) return a.defaultModel ? -1 : 1;
    const providerDiff =
      providerPriority.indexOf(a.provider as TextProviderType) -
      providerPriority.indexOf(b.provider as TextProviderType);
    if (providerDiff !== 0) return providerDiff;
    return a.modelName.localeCompare(b.modelName);
  })[0];

  return { provider: picked.provider as TextProviderType, modelName: picked.modelName };
}
