import "server-only";
import { buildAmuChatFallbackChain, TEXT_MODEL_GUIDE_BY_MODEL, TEXT_PROVIDER_TYPES } from "consts/ai";
import { MONGODB_USER_MODEL_PREFIX } from "consts/db";
import { MONGODB_USERS_URL } from "consts/env/server";
import {
  deleteUserAiChatPreference,
  findUserAiChatPreference,
  upsertUserAiChatPreference,
} from "libs/database/user";
import { getModel } from "libs/database/modelCache";
import { getUniverseById, getUniverseDetail } from "libs/database/universe";
import { listSystemModelCatalog, type SystemModelCatalogItem } from "libs/server-utils/api/systemModelControl";
import { resolvePlatformCredential } from "libs/server-utils/secure/platformCredentialResolver";
import { normalizeTutorsState } from "libs/services/tutors/tutorsState";
import {
  isAudioCapableChatModel,
  normalizeChatInputModality,
  resolveTutorsAudioTurnPolicy,
} from "libs/server-utils/audio";
import { getSpeechRuntimeControls } from "libs/server-utils/system/speechRuntimeControls";
import { UserSchema, type IUserDocument } from "models/user";
import { filterSelectableSystemModels, resolveSystemModelAccessActor } from "libs/server-utils/ai/systemModelAccess";
import type { PlatformCredentialKey } from "consts/secure/platformCredentials";
import type {
  ChatInputModalityType,
  ChatModelScopeType,
  ChatModelServiceType,
  IChatModelReference,
  IChatModelOption,
  IChatModelPolicyResult,
  TextProviderType,
} from "types/ai";
import type { ITutorsState } from "types/app";
import { pickString, toUnknownRecord } from "utils/common/typeUtils";
import { logger } from "utils/log";

type CodedError = Error & { errorCode: string; status: number; detail?: unknown };

export type ResolveChatModelPolicyArgs = {
  uid: string;
  service: ChatModelServiceType;
  /** Authenticated server user supplied by API middleware; never populated from request body. */
  actor?: { user?: unknown };
  universeId?: string;
  personaId?: string;
  requestedProvider?: unknown;
  requestedModelName?: unknown;
  tutorsState?: ITutorsState;
  allowUnselectedTutor?: boolean;
  /** TUTORS-193 D1 — 신뢰하지 않는 클라이언트 값. 서버가 normalizeChatInputModality로 확정한다. */
  inputModality?: unknown;
};

const PLATFORM_CREDENTIAL_KEY_BY_PROVIDER: Record<TextProviderType, PlatformCredentialKey> = {
  openai: "ai.openai.default",
  claude: "ai.anthropic.default",
  google: "ai.google.gemini",
  xai: "ai.xai.default",
  deepseek: "ai.deepseek.default",
  zai: "ai.zai.default",
};

const MAX_SCOPE_ID_LENGTH = 128;

function codedError(message: string, errorCode: string, status: number, detail?: unknown): CodedError {
  const error = new Error(message) as CodedError;
  error.errorCode = errorCode;
  error.status = status;
  error.detail = detail;
  return error;
}

function requireScopeId(value: unknown, label: string) {
  const id = pickString(value);
  if (!id || id.length > MAX_SCOPE_ID_LENGTH || id.startsWith("$") || id.includes(".")) {
    throw codedError(`${label}가 유효하지 않습니다.`, "INVALID_CHAT_MODEL_SCOPE", 400);
  }
  return id;
}

function toTextProvider(value: unknown): TextProviderType | "" {
  const provider = pickString(value).toLowerCase();
  return (TEXT_PROVIDER_TYPES as readonly string[]).includes(provider) ? (provider as TextProviderType) : "";
}

function chatModelKey(provider: string, modelName: string) {
  return `${provider}:${modelName}`;
}

export function toSelectableTextCatalog(items: SystemModelCatalogItem[], actor?: { user?: unknown }) {
  return filterSelectableSystemModels(items, resolveSystemModelAccessActor(actor?.user)).filter(
    (item) => item.modality === "text" && Boolean(toTextProvider(item.provider)),
  );
}

function selectPolicyDefault(items: SystemModelCatalogItem[], configured?: { provider?: string; modelName?: string }) {
  const configuredKey =
    configured?.provider && configured?.modelName ? chatModelKey(configured.provider, configured.modelName) : "";
  return (
    items.find((item) => item.key.startsWith(`${configuredKey}:`)) ||
    items.find((item) => item.provider === "zai" && item.defaultModel) ||
    items.find((item) => item.defaultModel) ||
    items.find((item) => item.recommendedModel) ||
    items[0]
  );
}

async function loadTextProviderAvailability(items: SystemModelCatalogItem[]) {
  const providers = [...new Set(items.map((item) => toTextProvider(item.provider)).filter(Boolean))] as TextProviderType[];
  const results = await Promise.all(
    providers.map(async (provider) => {
      try {
        await resolvePlatformCredential(PLATFORM_CREDENTIAL_KEY_BY_PROVIDER[provider]);
        return [provider, true] as const;
      } catch (error) {
        const errorCode = String(toUnknownRecord(error).errorCode || "PLATFORM_CREDENTIAL_UNAVAILABLE");
        logger.warn("[chatModelPolicy] provider is not runtime-ready", { provider, errorCode });
        return [provider, false] as const;
      }
    }),
  );
  return new Map(results);
}

async function loadTutorsState(uid: string) {
  const modelName = `${MONGODB_USER_MODEL_PREFIX}${uid}`;
  const UserModel = await getModel<IUserDocument>(MONGODB_USERS_URL, modelName, UserSchema, modelName);
  const doc = await UserModel.findOne({ uid }).lean<IUserDocument>();
  if (!doc) throw codedError("유저 데이터를 찾을 수 없습니다.", "USER_NOT_FOUND", 404);
  const selectedPersonas = toUnknownRecord(doc.selectedPersonas);
  return normalizeTutorsState(selectedPersonas.tutors);
}

function buildPreferenceScopes(args: { service: ChatModelServiceType; universeId: string; personaId: string }) {
  if (args.service === "amu") {
    return [{ scopeType: "service" as const, scopeId: "default" }];
  }
  if (args.service === "tutors") {
    return [
      { scopeType: "persona" as const, scopeId: args.personaId },
      { scopeType: "service" as const, scopeId: "default" },
    ];
  }
  return [
    { scopeType: "persona" as const, scopeId: `${args.universeId}:${args.personaId}` },
    { scopeType: "universe" as const, scopeId: args.universeId },
    { scopeType: "service" as const, scopeId: "default" },
  ];
}

export function toModelOption(
  item: SystemModelCatalogItem,
  availability: {
    available: boolean;
    reason?: "provider_credential_unavailable";
  },
): IChatModelOption {
  const guide = TEXT_MODEL_GUIDE_BY_MODEL[item.modelName as keyof typeof TEXT_MODEL_GUIDE_BY_MODEL];
  return {
    key: chatModelKey(item.provider, item.modelName),
    provider: item.provider as TextProviderType,
    modelName: item.modelName,
    displayName: item.displayName || item.modelName,
    state: availability.available ? "available" : "locked",
    defaultModel: item.defaultModel,
    recommendedModel: item.recommendedModel,
    ...(item.adminOnly === true ? { adminOnly: true } : {}),
    supportsImageInput: item.supportsImageInput,
    supportsAudioInput: item.supportsAudioInput,
    supportsAudioUnderstanding: item.supportsAudioUnderstanding,
    audioEligible: isAudioCapableChatModel(item),
    note: guide?.note,
    availabilityReason: availability.reason,
  };
}

function toModelReference(item: Pick<SystemModelCatalogItem, "provider" | "modelName" | "displayName">): IChatModelReference {
  const provider = toTextProvider(item.provider);
  if (!provider) throw codedError("텍스트 모델 provider가 유효하지 않습니다.", "CHAT_MODEL_PROVIDER_INVALID", 500);
  return {
    key: chatModelKey(provider, item.modelName),
    provider,
    modelName: item.modelName,
    displayName: item.displayName || item.modelName,
  };
}

export async function resolveChatModelPolicy(args: ResolveChatModelPolicyArgs): Promise<IChatModelPolicyResult> {
  const uid = requireScopeId(args.uid, "uid");
  const requestedProvider = toTextProvider(args.requestedProvider);
  const requestedModelName = pickString(args.requestedModelName);
  const inputModality: ChatInputModalityType = normalizeChatInputModality(args.inputModality);

  if (Boolean(requestedProvider) !== Boolean(requestedModelName)) {
    throw codedError("provider와 modelName을 함께 입력해야 합니다.", "CHAT_MODEL_REQUEST_INVALID", 400);
  }

  const fullCatalog = await listSystemModelCatalog();
  const textCatalog = fullCatalog.filter(
    (item) => item.modality === "text" && Boolean(toTextProvider(item.provider)),
  );

  // TUTORS-193 D5 — inputModality === "audio"여도 options·selected·fallbackChain은 바꾸지 않는다.
  // 필터링은 클라이언트 표시와 라우트 거부로 처리한다. 여기서 카탈로그를 필터하면 audio 요청 하나가
  // 사용자의 저장된 텍스트 모델 선호를 덮어쓰는 side effect가 생긴다
  // (saveChatModelPreference가 이 함수를 그대로 재사용한다).
  const speechRuntimeControls = await getSpeechRuntimeControls();
  const audioTurnPolicy = resolveTutorsAudioTurnPolicy(speechRuntimeControls.tutorsAudioTurn);

  if (args.service === "amu") {
    const catalog = toSelectableTextCatalog(textCatalog, args.actor);
    const providerAvailability = await loadTextProviderAvailability(catalog);
    const availableProviders = new Set(
      [...providerAvailability.entries()].filter(([, available]) => available).map(([provider]) => provider),
    );
    const approvedChain = buildAmuChatFallbackChain(catalog, availableProviders);
    if (!approvedChain.length) {
      throw codedError("일반 AMU 대화를 위한 AI 모델이 현재 준비되지 않았습니다.", "AMU_CHAT_FALLBACK_UNAVAILABLE", 503, {
        reasonCode: "NO_APPROVED_RUNTIME_MODEL",
      });
    }

    const options = catalog.map((item) => {
      const provider = toTextProvider(item.provider);
      const available = Boolean(provider && providerAvailability.get(provider));
      return toModelOption(item, {
        available,
        reason: available ? undefined : "provider_credential_unavailable",
      });
    });
    const availableByKey = new Map(
      options.filter((option) => option.state === "available").map((option) => [option.key, option]),
    );
    const requestedKey =
      requestedProvider && requestedModelName ? chatModelKey(requestedProvider, requestedModelName) : "";
    if (requestedKey && !availableByKey.has(requestedKey)) {
      throw codedError("현재 선택할 수 없는 AI 모델입니다.", "CHAT_MODEL_NOT_AVAILABLE", 403, {
        service: args.service,
        provider: requestedProvider,
        modelName: requestedModelName,
        reasonCode: "PROVIDER_NOT_RUNTIME_READY",
      });
    }

    const recommendedItem = catalog.find(
      (item) => item.provider === approvedChain[0].provider && item.modelName === approvedChain[0].modelName,
    );
    if (!recommendedItem) {
      throw codedError("일반 AMU 추천 모델을 찾을 수 없습니다.", "AMU_CHAT_RECOMMENDED_MODEL_UNAVAILABLE", 503);
    }
    const recommended = toModelReference(recommendedItem);
    const recommendationFallbackReason =
      recommended.provider === "zai"
        ? undefined
        : providerAvailability.get("zai") === false
          ? "provider_credential_unavailable"
          : "provider_unavailable";
    const scopes = buildPreferenceScopes({ service: args.service, universeId: "", personaId: "" });
    const preference = requestedKey || uid.startsWith("guest:")
      ? null
      : await findUserAiChatPreference({ uid, service: args.service, scopes });
    const preferenceKey = preference ? chatModelKey(preference.provider, preference.modelName) : "";
    const savedOption = preferenceKey ? availableByKey.get(preferenceKey) : undefined;
    const selectedOption = (requestedKey && availableByKey.get(requestedKey)) || savedOption || availableByKey.get(recommended.key);
    if (!selectedOption) {
      throw codedError("일반 AMU 대화에 사용할 수 있는 AI 모델이 없습니다.", "AMU_CHAT_FALLBACK_UNAVAILABLE", 503);
    }

    const selectedReference: IChatModelReference = {
      key: selectedOption.key,
      provider: selectedOption.provider,
      modelName: selectedOption.modelName,
      displayName: selectedOption.displayName,
    };
    const chainByKey = new Map(catalog.map((item) => [chatModelKey(item.provider, item.modelName), item]));
    const fallbackChain = [
      selectedReference,
      ...approvedChain
        .filter((candidate) => candidate.key !== selectedReference.key)
        .map((candidate) => chainByKey.get(candidate.key))
        .filter((item): item is SystemModelCatalogItem => Boolean(item))
        .map(toModelReference),
    ];
    const savedUnavailable = Boolean(preferenceKey && !savedOption);
    const selectionSource: IChatModelPolicyResult["selected"]["source"] = requestedKey
      ? "request"
      : savedOption
        ? "preference"
        : savedUnavailable
          ? "fallback"
          : "policy_default";

    const hasAudioCapableAvailableOption = options.some((option) => option.audioEligible && option.state === "available");
    const audioTurnAvailable = audioTurnPolicy.gateOpen && hasAudioCapableAvailableOption;
    const audioTurnReasonCode: IChatModelPolicyResult["audioTurnReasonCode"] = !audioTurnPolicy.gateOpen
      ? "gate_closed"
      : !hasAudioCapableAvailableOption
        ? "no_audio_capable_model"
        : undefined;

    return {
      service: args.service,
      scopeType: "service",
      scopeId: "default",
      selectionMode: "free",
      preferenceMode: requestedKey || savedOption ? "preference" : "recommended",
      recommended,
      fallbackChain,
      options,
      inputModality,
      audioTurnAvailable,
      audioTurnReasonCode,
      selected: {
        ...selectedReference,
        source: selectionSource,
        fallbackReason:
          savedUnavailable
            ? "saved_model_unavailable"
            : !requestedKey && !savedOption
              ? recommendationFallbackReason
              : undefined,
      },
      recommendationFallbackReason,
    };
  }

  const universeId = requireScopeId(args.universeId, "universeId");
  const personaId = requireScopeId(args.personaId, "personaId");
  let catalog = toSelectableTextCatalog(textCatalog, args.actor);
  let selectionMode: IChatModelPolicyResult["selectionMode"] = "free";
  let configuredDefault: { provider?: string; modelName?: string } | undefined;

  if (args.service === "game") {
    const universe = await getUniverseById(universeId);
    if (!universe || universe.type !== "game") {
      throw codedError("게임 유니버스를 찾을 수 없습니다.", "GAME_UNIVERSE_NOT_FOUND", 404);
    }

    const detail = await getUniverseDetail(universeId).catch(() => null);
    const policy = detail?.metadata?.chatModelPolicy;
    configuredDefault = {
      provider: pickString(policy?.defaultProvider).toLowerCase(),
      modelName: pickString(policy?.defaultModelName),
    };
    const allowedKeys = new Set(
      (policy?.allowedModels || []).flatMap((item) => {
        const provider = toTextProvider(item.provider);
        const modelName = pickString(item.modelName);
        return provider && modelName ? [chatModelKey(provider, modelName)] : [];
      }),
    );
    if (allowedKeys.size > 0) {
      catalog = catalog.filter((item) => allowedKeys.has(chatModelKey(item.provider, item.modelName)));
    }
    if (policy?.selectionMode === "locked") selectionMode = "locked";
  }

  const policyDefault = selectPolicyDefault(catalog, configuredDefault);
  if (!policyDefault) {
    throw codedError("사용 가능한 채팅 모델이 없습니다.", "CHAT_MODEL_UNAVAILABLE", 503);
  }

  // G-MCG-01: 정책 기본이 선택 불가능한지 판별하기 위해 전체 카탈로그(선택 불가 포함)에서 의도 기본값을 찾는다.
  const intendedDefault = selectPolicyDefault(textCatalog, configuredDefault);

  let tutorsState = args.tutorsState;
  if (args.service === "tutors") {
    tutorsState = tutorsState || (await loadTutorsState(uid));
    const selected = tutorsState.selected.find((item) => item.personaId === personaId);
    if (!selected && !args.allowUnselectedTutor) {
      throw codedError("선택되지 않은 선생님입니다.", "TUTORS_PERSONA_NOT_SELECTED", 400);
    }
  }

  const defaultKey = chatModelKey(policyDefault.provider, policyDefault.modelName);
  const options = catalog.map((item) => {
    const key = chatModelKey(item.provider, item.modelName);
    if (selectionMode === "locked") {
      return toModelOption(item, {
        available: key === defaultKey,
      });
    }
    return toModelOption(item, { available: true });
  });

  const availableByKey = new Map(
    options.filter((option) => option.state === "available").map((option) => [option.key, option]),
  );
  const requestedKey =
    requestedProvider && requestedModelName ? chatModelKey(requestedProvider, requestedModelName) : "";

  if (requestedKey && !availableByKey.has(requestedKey)) {
    throw codedError("현재 선택할 수 없는 AI 모델입니다.", "CHAT_MODEL_NOT_AVAILABLE", 403, {
      service: args.service,
      provider: requestedProvider,
      modelName: requestedModelName,
    });
  }

  const scopes = buildPreferenceScopes({ service: args.service, universeId, personaId });
  const preference = requestedKey ? null : await findUserAiChatPreference({ uid, service: args.service, scopes });
  const preferenceKey = preference ? chatModelKey(preference.provider, preference.modelName) : "";

  // G-MCG-01: 정책 기본이 선택 불가능하면 조용히 다른 모델로 폴백하지 않고 명시적으로 실패한다.
  const intendedDefaultKey = intendedDefault ? chatModelKey(intendedDefault.provider, intendedDefault.modelName) : "";
  const intendedDefaultUnselectable = Boolean(intendedDefault) && !availableByKey.has(intendedDefaultKey);
  // 이 경로는 text modality만 다룬다. audio 역할 기본값 위반(speech_role_default_unusable)은
  // 여기 도달하지 않지만, 도달하더라도 텍스트 정책의 reasonCode로 위장시키지 않는다.
  const intendedDefaultViolation =
    intendedDefault?.invariantViolation?.type === "default_unselectable"
      ? intendedDefault.invariantViolation
      : undefined;
  if (intendedDefaultUnselectable && !requestedKey && !(preferenceKey && availableByKey.has(preferenceKey))) {
    throw codedError("정책 기본 모델이 현재 선택 불가능합니다.", "POLICY_DEFAULT_UNSELECTABLE", 503, {
      service: args.service,
      provider: intendedDefault?.provider,
      modelName: intendedDefault?.modelName,
      reasonCode: intendedDefaultViolation?.reasonCode,
    });
  }

  const selectedOption =
    (requestedKey && availableByKey.get(requestedKey)) ||
    (preferenceKey && availableByKey.get(preferenceKey)) ||
    availableByKey.get(defaultKey) ||
    options.find((option) => option.state === "available");

  if (!selectedOption) {
    throw codedError("사용 가능한 채팅 모델이 없습니다.", "CHAT_MODEL_UNAVAILABLE", 503);
  }

  const scope = scopes[0];
  const selectedReference: IChatModelReference = {
    key: selectedOption.key,
    provider: selectedOption.provider,
    modelName: selectedOption.modelName,
    displayName: selectedOption.displayName,
  };
  const recommended = toModelReference(policyDefault);
  const hasAudioCapableAvailableOption = options.some((option) => option.audioEligible && option.state === "available");
  const audioTurnAvailable = audioTurnPolicy.gateOpen && hasAudioCapableAvailableOption;
  const audioTurnReasonCode: IChatModelPolicyResult["audioTurnReasonCode"] = !audioTurnPolicy.gateOpen
    ? "gate_closed"
    : !hasAudioCapableAvailableOption
      ? "no_audio_capable_model"
      : undefined;

  return {
    service: args.service,
    scopeType: scope.scopeType,
    scopeId: scope.scopeId,
    selectionMode,
    preferenceMode: Boolean(requestedKey) || preferenceKey === selectedOption.key ? "preference" : "recommended",
    recommended,
    fallbackChain: [
      selectedReference,
      ...(recommended.key === selectedReference.key ? [] : [recommended]),
    ],
    options,
    inputModality,
    audioTurnAvailable,
    audioTurnReasonCode,
    selected: {
      key: selectedOption.key,
      provider: selectedOption.provider,
      modelName: selectedOption.modelName,
      source: requestedKey
        ? "request"
        : preferenceKey && availableByKey.has(preferenceKey)
          ? "preference"
          : preferenceKey
            ? "fallback"
            : "policy_default",
      fallbackReason: preferenceKey && !availableByKey.has(preferenceKey) ? "saved_model_unavailable" : undefined,
      policyDefaultReasonCode: intendedDefaultUnselectable ? intendedDefaultViolation?.reasonCode : undefined,
    },
  };
}

export async function saveChatModelPreference(args: ResolveChatModelPolicyArgs): Promise<IChatModelPolicyResult> {
  const resolved = await resolveChatModelPolicy(args);
  const scopeType = resolved.scopeType as ChatModelScopeType;
  await upsertUserAiChatPreference({
    uid: args.uid,
    service: args.service,
    scopeType,
    scopeId: resolved.scopeId,
    provider: resolved.selected.provider,
    modelName: resolved.selected.modelName,
  });
  return {
    ...resolved,
    selected: { ...resolved.selected, source: "preference", fallbackReason: undefined },
  };
}

export async function resetAmuChatModelPreference(args: { uid: string; actor?: { user?: unknown } }): Promise<IChatModelPolicyResult> {
  const uid = requireScopeId(args.uid, "uid");
  await deleteUserAiChatPreference({
    uid,
    service: "amu",
    scopeType: "service",
    scopeId: "default",
  });
  return await resolveChatModelPolicy({ uid, service: "amu", actor: args.actor });
}
