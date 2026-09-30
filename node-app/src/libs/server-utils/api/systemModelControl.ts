import "server-only";
import {
  AI_PROVIDER_TYPES,
  DEFAULT_IMAGE_MODEL_BY_PROVIDER,
  DEFAULT_TEXT_MODEL_BY_PROVIDER,
  DEFAULT_VIDEO_MODEL_BY_PROVIDER,
  DEPRECATED_XAI_TEXT_MODELS,
  IMAGE_PROVIDER_TYPES,
  IMAGE_SELECTABLE_MODEL_MAP,
  VIDEO_MODEL_MAP,
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
  QWEN_IMAGE_MODEL_CATALOG,
  QWEN_TEXT_MODEL_CATALOG,
  TEXT_MODEL_MAP,
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
import type { TextProviderType } from "types/ai";
import {
  deleteSystemModelCatalogEntries,
  listSystemModelCatalogEntries,
  upsertSystemModelCatalogEntries,
  type SystemModelCatalogRepoInput,
} from "libs/database/system";
import { SYSTEM_MODEL_CATALOG_MODALITY_TYPES, type SystemModelCatalogModalityType } from "models/system";
import { canSelectSystemModel, resolveSystemModelAccessActor } from "libs/server-utils/ai/systemModelAccess";


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
  catalogSource: "policy" | "db";
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
 * G-MCG-02 — 정책값과 DB override가 다른 가변 필드를 표기한다.
 * - DB 전용 행(catalogSource="db")은 정책 기준선이 없으므로 빈 목록이다.
 * - capability(supportsImageInput·supportsAudioInput·supportsAudioUnderstanding·supportsReasoningEffort)는
 *   override 대상이 아니다.
 * - enabled/adminOnly는 launchState 한 축으로 통합 표기한다(계약 §4.3).
 */
function computeOverrides(item: SystemModelCatalogItem): string[] {
  if (item.catalogSource === "db") return [];
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

function listBootstrapModelCatalog(): SystemModelCatalogItem[] {
  const image = (IMAGE_PROVIDER_TYPES as readonly (keyof typeof IMAGE_SELECTABLE_MODEL_MAP)[]).flatMap((provider) =>
    (IMAGE_SELECTABLE_MODEL_MAP[provider] as readonly string[]).map((modelName) => ({
      key: modelKey(provider, modelName, "image"),
      provider,
      modelName,
      modality: "image" as const,
      displayName: resolveDefaultDisplayName(provider, modelName, "image"),
      upstreamModelName: resolveUpstreamModelName(provider, modelName),
      ...launchStateToEnabledAdminOnly(getModelLaunchState(provider, modelName, "image")),
      launchState: getModelLaunchState(provider, modelName, "image"),
      policyLaunchState: getModelLaunchState(provider, modelName, "image"),
      defaultModel: String(DEFAULT_IMAGE_MODEL_BY_PROVIDER[provider] || "").trim() === modelName,
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
      policyDefaultModel: String(DEFAULT_IMAGE_MODEL_BY_PROVIDER[provider] || "").trim() === modelName,
      overrides: [],
    })),
  );

  const qwenImage = QWEN_IMAGE_MODEL_CATALOG.map((modelName) => ({
    key: modelKey("qwen", modelName, "image"),
    provider: "qwen",
    modelName,
    modality: "image" as const,
    displayName: resolveDefaultDisplayName("qwen", modelName, "image"),
    upstreamModelName: resolveUpstreamModelName("qwen", modelName),
    ...launchStateToEnabledAdminOnly(getModelLaunchState("qwen", modelName, "image")),
    launchState: getModelLaunchState("qwen", modelName, "image"),
    policyLaunchState: getModelLaunchState("qwen", modelName, "image"),
    defaultModel: DEFAULT_IMAGE_MODEL_BY_PROVIDER.qwen === modelName,
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
    policyDefaultModel: DEFAULT_IMAGE_MODEL_BY_PROVIDER.qwen === modelName,
    overrides: [],
  }));

  const text = (TEXT_PROVIDER_TYPES as readonly (keyof typeof TEXT_MODEL_MAP)[]).flatMap((provider) =>
    (TEXT_MODEL_MAP[provider] as readonly string[]).map((modelName) => ({
        key: modelKey(provider, modelName, "text"),
        provider,
        modelName,
        modality: "text" as const,
        displayName: resolveDefaultDisplayName(provider, modelName, "text"),
        upstreamModelName: resolveUpstreamModelName(provider, modelName),
        ...launchStateToEnabledAdminOnly(getModelLaunchState(provider, modelName, "text")),
        launchState: getModelLaunchState(provider, modelName, "text"),
        policyLaunchState: getModelLaunchState(provider, modelName, "text"),
        defaultModel: String(DEFAULT_TEXT_MODEL_BY_PROVIDER[provider] || "").trim() === modelName,
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
        policyDefaultModel: String(DEFAULT_TEXT_MODEL_BY_PROVIDER[provider] || "").trim() === modelName,
        overrides: [],
      })),
  );

  const deprecatedXaiText = DEPRECATED_XAI_TEXT_MODELS.map((modelName) => {
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

  const qwenText = QWEN_TEXT_MODEL_CATALOG.map((modelName) => ({
    key: modelKey("qwen", modelName, "text"),
    provider: "qwen",
    modelName,
    modality: "text" as const,
    displayName: resolveDefaultDisplayName("qwen", modelName, "text"),
    upstreamModelName: resolveUpstreamModelName("qwen", modelName),
    ...launchStateToEnabledAdminOnly(getModelLaunchState("qwen", modelName, "text")),
    launchState: getModelLaunchState("qwen", modelName, "text"),
    policyLaunchState: getModelLaunchState("qwen", modelName, "text"),
    defaultModel: DEFAULT_TEXT_MODEL_BY_PROVIDER.qwen === modelName,
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
    policyDefaultModel: DEFAULT_TEXT_MODEL_BY_PROVIDER.qwen === modelName,
    overrides: [],
  }));

  const video = (VIDEO_PROVIDER_TYPES as readonly (keyof typeof VIDEO_MODEL_MAP)[]).flatMap((provider) =>
    VIDEO_MODEL_MAP[provider].map((modelName) => ({
      key: modelKey(provider, modelName, "video"),
      provider,
      modelName,
      modality: "video" as const,
      displayName: resolveDefaultDisplayName(provider, modelName, "video"),
      upstreamModelName: resolveUpstreamModelName(provider, modelName),
      ...launchStateToEnabledAdminOnly(getModelLaunchState(provider, modelName, "video")),
      launchState: getModelLaunchState(provider, modelName, "video"),
      policyLaunchState: getModelLaunchState(provider, modelName, "video"),
      defaultModel: String(DEFAULT_VIDEO_MODEL_BY_PROVIDER[provider] || "").trim() === modelName,
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
      policyDefaultModel: String(DEFAULT_VIDEO_MODEL_BY_PROVIDER[provider] || "").trim() === modelName,
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

function toCatalogRepoInput(item: SystemModelCatalogItem): SystemModelCatalogRepoInput {
  return {
    provider: item.provider,
    modelName: item.modelName,
    modality: item.modality,
    displayName: item.displayName,
    upstreamModelName: item.upstreamModelName,
    enabled: item.enabled,
    adminOnly: item.adminOnly,
    defaultModel: item.modality === "audio" ? false : item.defaultModel,
    recommendedModel: item.recommendedModel,
    supportsImageInput: item.supportsImageInput,
    supportsAudioInput: item.supportsAudioInput,
    supportsAudioUnderstanding: item.supportsAudioUnderstanding,
    reasoningEffort: item.reasoningEffort,
    status: item.status,
  };
}

async function loadCatalogDocuments() {
  const docs = await listSystemModelCatalogEntries();
  if (docs.length > 0) return docs;

  const bootstrap = listBootstrapModelCatalog();

  await upsertSystemModelCatalogEntries(bootstrap.map(toCatalogRepoInput));
  return await listSystemModelCatalogEntries();
}

export async function listSystemModelCatalog() {
  const bootstrap = listBootstrapModelCatalog();
  const docs = await loadCatalogDocuments();
  const docMap = new Map(
    docs.map((doc) => [modelKey(doc.provider, doc.modelName, doc.modality), doc] as const),
  );

  const merged: SystemModelCatalogItem[] = bootstrap.map((item) => {
    const doc = docMap.get(item.key);
    const deprecated = item.deprecated || doc?.status === "deprecated";
    const status: SystemModelCatalogStatusType = deprecated ? "deprecated" : "active";
    return {
      ...item,
      displayName: String(doc?.displayName || item.displayName || item.modelName).trim(),
      upstreamModelName: String(doc?.upstreamModelName || item.upstreamModelName || item.modelName).trim(),
      enabled: deprecated ? false : typeof doc?.enabled === "boolean" ? doc.enabled : item.enabled,
      adminOnly: item.deprecated ? item.adminOnly : typeof doc?.adminOnly === "boolean" ? doc.adminOnly : item.adminOnly,
      defaultModel:
        deprecated || item.modality === "audio"
          ? false
          : typeof doc?.defaultModel === "boolean"
            ? doc.defaultModel
            : item.defaultModel,
      recommendedModel: deprecated
        ? false
        : typeof doc?.recommendedModel === "boolean"
          ? doc.recommendedModel
          : item.recommendedModel,
      // DB는 capability를 끌 수만 있고 코드 정책이 지원하지 않는 capability를 승격할 수 없다.
      supportsImageInput:
        item.supportsImageInput &&
        (typeof doc?.supportsImageInput === "boolean" ? doc.supportsImageInput : true),
      // TUTORS-193 D2 — 같은 해석 규칙. 코드 capability(TEXT_MODEL_CAPABILITIES)가 false면
      // DB override로 true가 될 수 없다.
      supportsAudioInput:
        item.supportsAudioInput &&
        (typeof doc?.supportsAudioInput === "boolean" ? doc.supportsAudioInput : true),
      supportsAudioUnderstanding:
        item.supportsAudioUnderstanding &&
        (typeof doc?.supportsAudioUnderstanding === "boolean" ? doc.supportsAudioUnderstanding : true),
      // 코드가 capability를 소유한다. 미지원 모델은 DB에 값이 있어도 빈 문자열로 고정한다.
      supportsReasoningEffort: item.supportsReasoningEffort,
      reasoningEffort: item.supportsReasoningEffort
        ? normalizeReasoningEffort({
            provider: item.provider,
            modelName: item.modelName,
            modality: item.modality,
            value: doc?.reasoningEffort,
          })
        : "",
      policyReasoningEffort: item.policyReasoningEffort,
      status,
      deprecated,
      catalogSource: "policy" as const,
      policyDefaultModel: item.policyDefaultModel,
    };
  });

  for (const doc of docs) {
    const key = modelKey(doc.provider, doc.modelName, doc.modality);
    if (merged.some((item) => item.key === key)) continue;
    const status: SystemModelCatalogStatusType = doc.status === "deprecated" ? "deprecated" : "active";
    merged.push({
      key,
      provider: doc.provider,
      modelName: doc.modelName,
      modality: doc.modality,
      displayName: String(doc.displayName || doc.modelName).trim(),
      upstreamModelName: String(doc.upstreamModelName || resolveUpstreamModelName(doc.provider, doc.modelName)).trim(),
      enabled: typeof doc.enabled === "boolean" ? doc.enabled : true,
      adminOnly: Boolean(doc.adminOnly),
      defaultModel: doc.modality === "audio" ? false : Boolean(doc.defaultModel),
      recommendedModel: Boolean(doc.recommendedModel),
      supportsImageInput: Boolean(doc.supportsImageInput),
      supportsAudioInput: Boolean(doc.supportsAudioInput),
      supportsAudioUnderstanding: Boolean(doc.supportsAudioUnderstanding),
      supportsReasoningEffort: supportsReasoningEffort(doc.provider, doc.modelName, doc.modality),
      reasoningEffort: normalizeReasoningEffort({
        provider: doc.provider,
        modelName: doc.modelName,
        modality: doc.modality,
        value: doc.reasoningEffort,
      }),
      policyReasoningEffort: getPolicyReasoningEffort(doc.provider, doc.modelName, doc.modality),
      reasoningEffortLevels: [...getReasoningEffortLevels(doc.provider, doc.modelName, doc.modality)],
      status,
      deprecated: status === "deprecated",
      catalogSource: "db" as const,
      policyDefaultModel: false,
      launchState: enabledAdminOnlyToLaunchState(
        typeof doc.enabled === "boolean" ? doc.enabled : true,
        Boolean(doc.adminOnly),
      ),
      policyLaunchState: undefined,
      overrides: [],
    });
  }

  return merged
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

export function pickSystemModelControlSnapshotByKeys(
  models: Awaited<ReturnType<typeof listSystemModelControls>>,
  keys: string[],
) {
  const allow = new Set(keys.map((key) => String(key || "").trim()).filter(Boolean));
  return models.filter((item) => allow.has(item.key));
}

export function pickSystemModelControlSnapshotByGroup(
  models: Awaited<ReturnType<typeof listSystemModelControls>>,
  provider: string,
  modality: SystemModelControlModalityType,
) {
  const normalizedProvider = String(provider || "").trim().toLowerCase();
  return models.filter((item) => item.provider === normalizedProvider && item.modality === modality);
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
      (DEFAULT_IMAGE_MODEL_BY_PROVIDER as Record<string, string>)[provider] ||
        DEFAULT_IMAGE_MODEL_BY_PROVIDER.google ||
        "",
    ).trim();
  }
  if (args.modality === "video") {
    return String(
      (DEFAULT_VIDEO_MODEL_BY_PROVIDER as Record<string, string>)[provider] ||
        DEFAULT_VIDEO_MODEL_BY_PROVIDER.google ||
        "",
    ).trim();
  }
  return String(
    (DEFAULT_TEXT_MODEL_BY_PROVIDER as Record<string, string>)[provider] ||
      DEFAULT_TEXT_MODEL_BY_PROVIDER.google ||
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

export async function updateSystemModelControls(args: {
  patches: Array<{
    key: string;
    enabled?: boolean;
    adminOnly?: boolean;
    status?: "active" | "deprecated";
    recommendedModel?: boolean;
    reasoningEffort?: string;
  }>;
  updatedBy?: string;
}) {
  const catalog = await listSystemModelCatalog();
  const catalogMap = new Map(catalog.map((item) => [item.key, item]));
  const updates: SystemModelCatalogRepoInput[] = [];

  for (const patch of args.patches) {
    const current = catalogMap.get(patch.key);
    if (!current) {
      const err = new Error("invalid_model_control_key") as Error & { errorCode: string; status: number };
      err.errorCode = "INVALID_INPUT";
      err.status = 400;
      throw err;
    }
    if (typeof patch.reasoningEffort === "string") {
      assertReasoningEffortValueOrThrow({
        provider: current.provider,
        modelName: current.modelName,
        modality: current.modality,
        value: patch.reasoningEffort,
      });
    }

    updates.push(
      toCatalogRepoInput({
        ...current,
        enabled: typeof patch.enabled === "boolean" ? patch.enabled : current.enabled,
        adminOnly: typeof patch.adminOnly === "boolean" ? patch.adminOnly : current.adminOnly,
        status:
          patch.status === "deprecated" ? "deprecated" : patch.status === "active" ? "active" : current.status,
        recommendedModel:
          typeof patch.recommendedModel === "boolean" ? patch.recommendedModel : current.recommendedModel,
        reasoningEffort:
          typeof patch.reasoningEffort === "string"
            ? normalizeReasoningEffort({
                provider: current.provider,
                modelName: current.modelName,
                modality: current.modality,
                value: patch.reasoningEffort,
              })
            : current.reasoningEffort,
      }),
    );
  }

  await upsertSystemModelCatalogEntries(updates);

  return await listSystemModelControls();
}

/**
 * G-MCG-03 — reasoning effort 값 검증. 모델이 선언한 허용값 안에서만 허용한다.
 * 미지원 모델·허용값 밖 값은 거부한다(admin API·MCP/agent 경로 공통).
 */
function assertReasoningEffortValueOrThrow(args: {
  provider: string;
  modelName: string;
  modality: string;
  value: string;
}) {
  if (!supportsReasoningEffort(args.provider, args.modelName, args.modality)) {
    const err = new Error("model_reasoning_effort_unsupported") as Error & {
      errorCode: string;
      status: number;
      detail?: unknown;
    };
    err.errorCode = "INVALID_INPUT";
    err.status = 400;
    err.detail = { provider: args.provider, modelName: args.modelName, modality: args.modality };
    throw err;
  }
  const levels = getReasoningEffortLevels(args.provider, args.modelName, args.modality);
  const raw = String(args.value).trim().toLowerCase();
  if (!(levels as readonly string[]).includes(raw)) {
    const err = new Error("model_reasoning_effort_invalid") as Error & {
      errorCode: string;
      status: number;
      detail?: unknown;
    };
    err.errorCode = "INVALID_INPUT";
    err.status = 400;
    err.detail = { provider: args.provider, modelName: args.modelName, modality: args.modality, allowed: [...levels] };
    throw err;
  }
}

export async function upsertSystemModelCatalogItems(args: {
  items: Array<{
    provider: string;
    modelName: string;
    modality: SystemModelControlModalityType;
    displayName?: string;
    upstreamModelName?: string;
    enabled?: boolean;
    adminOnly?: boolean;
    defaultModel?: boolean;
    recommendedModel?: boolean;
    supportsImageInput?: boolean;
    supportsAudioInput?: boolean;
    supportsAudioUnderstanding?: boolean;
    reasoningEffort?: string;
    status?: SystemModelCatalogStatusType;
  }>;
}) {
  const rows = args.items.reduce<SystemModelCatalogRepoInput[]>((acc, item) => {
    const provider = String(item.provider || "").trim().toLowerCase();
    const modelName = String(item.modelName || "").trim();
    const modality = item.modality;
    if (!provider || !modelName || !(SYSTEM_MODEL_CATALOG_MODALITY_TYPES as readonly string[]).includes(modality)) {
      return acc;
    }
    if (typeof item.reasoningEffort === "string") {
      assertReasoningEffortValueOrThrow({ provider, modelName, modality, value: item.reasoningEffort });
    }
    const preApprovalLocked = isPreApprovalLockedModel(provider, modelName, modality);
    acc.push({
      provider,
      modelName,
      modality,
      displayName: String(item.displayName || resolveDefaultDisplayName(provider, modelName, modality)).trim(),
      upstreamModelName: String(item.upstreamModelName || resolveUpstreamModelName(provider, modelName)).trim(),
      enabled: preApprovalLocked ? false : typeof item.enabled === "boolean" ? item.enabled : true,
      adminOnly: preApprovalLocked || Boolean(item.adminOnly),
      defaultModel: preApprovalLocked || modality === "audio" ? false : Boolean(item.defaultModel),
      recommendedModel: preApprovalLocked ? false : Boolean(item.recommendedModel),
      supportsImageInput:
        modality === "text"
          ? typeof item.supportsImageInput === "boolean"
            ? item.supportsImageInput
            : false
          : false,
      // TUTORS-193 D2 — image capability와 같은 게이트: text modality 행에만 이 경로로 설정을 허용한다.
      // TEXT_MODEL_CAPABILITIES가 false인 모델은 listSystemModelCatalog의 AND 결합이 최종적으로 다시 막는다.
      supportsAudioInput:
        modality === "text"
          ? typeof item.supportsAudioInput === "boolean"
            ? item.supportsAudioInput
            : false
          : false,
      supportsAudioUnderstanding:
        modality === "text"
          ? typeof item.supportsAudioUnderstanding === "boolean"
            ? item.supportsAudioUnderstanding
            : false
          : false,
      reasoningEffort: normalizeReasoningEffort({ provider, modelName, modality, value: item.reasoningEffort }),
      status: item.status === "deprecated" ? "deprecated" : "active",
    });
    return acc;
  }, []);

  if (!rows.length) return await listSystemModelControls();

  await upsertSystemModelCatalogEntries(rows);

  for (const row of rows) {
    if (!row.defaultModel) continue;
    // 동기화는 scope 안 defaultModel 배타성만 맞춘다. enabled는 호출자(승인 manifest)가 소유한다.
    await updateSystemDefaultModel({
      key: modelKey(row.provider, row.modelName, row.modality),
      forceEnable: false,
    });
  }

  return await listSystemModelControls();
}

export async function deleteSystemModelCatalogItems(args: {
  keys?: string[];
  targets?: Array<{ provider: string; modelName: string; modality: SystemModelControlModalityType }>;
  hardDelete?: boolean;
}) {
  const catalog = await listSystemModelCatalog();
  const keySet = new Set((args.keys || []).map((key) => String(key || "").trim()).filter(Boolean));
  const directTargets = (args.targets || [])
    .map((target) => ({
      provider: String(target.provider || "").trim().toLowerCase(),
      modelName: String(target.modelName || "").trim(),
      modality: target.modality,
    }))
    .filter(
      (target) =>
        target.provider &&
        target.modelName &&
        (SYSTEM_MODEL_CATALOG_MODALITY_TYPES as readonly string[]).includes(target.modality),
    );

  const targetMap = new Map<string, { provider: string; modelName: string; modality: SystemModelControlModalityType }>();
  for (const item of catalog) {
    if (!keySet.has(item.key)) continue;
    targetMap.set(item.key, {
      provider: item.provider,
      modelName: item.modelName,
      modality: item.modality,
    });
  }
  for (const target of directTargets) {
    targetMap.set(modelKey(target.provider, target.modelName, target.modality), target);
  }

  const targets = Array.from(targetMap.values());
  if (!targets.length) return { models: await listSystemModelControls(), deletedCount: 0, targetKeys: [] };

  if (args.hardDelete) {
    const result = await deleteSystemModelCatalogEntries(targets);
    return {
      models: await listSystemModelControls(),
      deletedCount: result.deletedCount,
      targetKeys: targets.map((target) => modelKey(target.provider, target.modelName, target.modality)),
    };
  }

  await upsertSystemModelCatalogEntries(
    targets.map((target) => {
      const current = catalog.find((item) => item.key === modelKey(target.provider, target.modelName, target.modality));
      return {
        provider: target.provider,
        modelName: target.modelName,
        modality: target.modality,
        displayName: current?.displayName || target.modelName,
        upstreamModelName: current?.upstreamModelName || resolveUpstreamModelName(target.provider, target.modelName),
        enabled: false,
        adminOnly: Boolean(current?.adminOnly),
        defaultModel: false,
        recommendedModel: false,
        supportsImageInput: Boolean(current?.supportsImageInput),
        supportsAudioInput: Boolean(current?.supportsAudioInput),
        supportsAudioUnderstanding: Boolean(current?.supportsAudioUnderstanding),
        status: "deprecated",
      };
    }),
  );

  return {
    models: await listSystemModelControls(),
    deletedCount: targets.length,
    targetKeys: targets.map((target) => modelKey(target.provider, target.modelName, target.modality)),
  };
}

/**
 * 기본 모델 지정. 관리자 UI 경로는 "선택 불가능한 모델을 기본으로 두지 않는다"는 불변식을 지키려고
 * 대상 모델을 강제로 활성화한다(forceEnable 기본 true).
 *
 * 다만 catalog 동기화는 승인 manifest가 `enabled`를 이미 확정한 상태로 호출하므로 강제 활성화를 끈다.
 * manifest는 scope마다 defaultModel을 정확히 1개 요구하는데(tracker `core/manifest_export.validate_manifest`),
 * scope 전체가 internal인 경우(video 전 scope·zai:image) 그 1개는 필연적으로 `enabled:false`인 모델이 된다.
 * 여기서 강제로 켜면 apply가 manifest 값을 되돌려 plan이 영원히 수렴하지 않고
 * `verify_model_catalog_parity`가 상시 false가 된다.
 */
export async function updateSystemDefaultModel(args: {
  key: string;
  updatedBy?: string;
  forceEnable?: boolean;
}) {
  const catalog = await listSystemModelCatalog();
  const target = catalog.find((item) => item.key === args.key);

  if (!target) {
    const err = new Error("invalid_default_model_key") as Error & { errorCode: string; status: number };
    err.errorCode = "INVALID_INPUT";
    err.status = 400;
    throw err;
  }

  if (target.modality === "audio") {
    const err = new Error("audio_role_defaults_only") as Error & { errorCode: string; status: number };
    err.errorCode = "INVALID_INPUT";
    err.status = 400;
    throw err;
  }

  const updates = catalog
    .filter((item) => item.provider === target.provider && item.modality === target.modality)
    .map((item) =>
      toCatalogRepoInput({
        ...item,
        enabled: item.key === target.key && args.forceEnable !== false ? true : item.enabled,
        defaultModel: item.key === target.key,
      }),
    );

  await upsertSystemModelCatalogEntries(updates);
  return await listSystemModelControls();
}

export async function restoreSystemModelControlSnapshot(
  snapshot: Array<
    Pick<
      SystemModelCatalogItem,
      | "provider"
      | "modelName"
      | "modality"
      | "displayName"
      | "upstreamModelName"
      | "enabled"
      | "adminOnly"
      | "defaultModel"
      | "recommendedModel"
      | "supportsImageInput"
      | "supportsAudioInput"
      | "supportsAudioUnderstanding"
      | "status"
    > & { reasoningEffort?: string }
  >,
) {
  const rows = Array.isArray(snapshot) ? snapshot : [];
  if (!rows.length) return await listSystemModelControls();

  await upsertSystemModelCatalogEntries(
    rows.map((item) => ({
      provider: item.provider,
      modelName: item.modelName,
      modality: item.modality,
      displayName: item.displayName,
      upstreamModelName: item.upstreamModelName,
      enabled: Boolean(item.enabled),
      adminOnly: Boolean(item.adminOnly),
      defaultModel: item.modality === "audio" ? false : Boolean(item.defaultModel),
      recommendedModel: Boolean(item.recommendedModel),
      supportsImageInput:
        typeof item.supportsImageInput === "boolean"
          ? item.supportsImageInput
          : item.modality === "text"
            ? supportsTextModelImageInput(item.modelName)
            : false,
      supportsAudioInput:
        typeof item.supportsAudioInput === "boolean"
          ? item.supportsAudioInput
          : item.modality === "text"
            ? supportsTextModelAudioInput(item.modelName)
            : false,
      supportsAudioUnderstanding:
        typeof item.supportsAudioUnderstanding === "boolean"
          ? item.supportsAudioUnderstanding
          : item.modality === "text"
            ? supportsTextModelAudioUnderstanding(item.modelName)
            : false,
      // 이 필드가 없던 시점의 스냅샷은 정규화가 정책 기본값으로 채운다.
      reasoningEffort: normalizeReasoningEffort({
        provider: item.provider,
        modelName: item.modelName,
        modality: item.modality,
        value: item.reasoningEffort,
      }),
      status: item.status,
    })),
  );

  return await listSystemModelControls();
}
