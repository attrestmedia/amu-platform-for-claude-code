import "server-only";
import { NextResponse } from "next/server";
import { estimateTokens, resolveImageBillingModelName } from "utils/ai";
import { PROMPT_LIMITS } from "consts/auth";
import { normalizeHistory } from "utils/normalize";
import type { RouteHintType } from "types/ai";
import { PROMPT_OPTION_CHAR_CAPS, IMAGE_REF_LIMIT_BY_PROVIDER } from "consts/ai";
import {
  isTextProvider,
  isImageProvider,
  inferImageProviderFromModelNameRaw,
  inferTextProviderFromModelNameRaw,
  isXaiLongContextTieredTextModel,
  isGoogleProTextModel,
  isOpenAIGpt6TextModel,
  normalizeAiProvider,
} from "utils/ai/providerHelper";
import { resolveImageGenOptions } from "utils/ai/imageOptions";
import type { AiProviderType, AiModalityType, ImageProviderType } from "types/ai";
import { assertPricingPreflightOrThrow } from "libs/services/aiUsageBilling";
import { getSystemPricingMaps } from "libs/server-utils/api/systemPricingControl";
import {
  assertSystemModelEnabledOrThrow,
  inferSystemProviderFromModelName,
  resolveSystemDefaultModelName,
  resolveSystemModelNameOrThrow,
} from "libs/server-utils/api/systemModelControl";
import { resolveMediaBillingStrategy } from "utils/payment";
import { toUnknownRecord, toErrorLike, isUnknownRecord, type UnknownRecord } from "utils/common";

/**
 * @docHint
 * @purpose 서버 유틸/핸들러 핵심 처리
 * @process isImageGenEndpoint 중심 처리  입력 검증  핵심 로직  결과 포맷팅  이미지 파이프라인 호출 포함
 * @domain ai-guard
 * @scope global
 */

const PER_MESSAGE_CHAR_CAP = PROMPT_LIMITS.maxInputMessageLength;

// endpoint가 AI 계열인지 판별
function isAiLikeEndpoint(endpoint: string) {
  return endpoint.startsWith("ai/") || endpoint.startsWith("tutors/") || endpoint.startsWith("commerce/");
}

// endpoint prefix로 routeHint를 서버 권위로 강제
function forceRouteHintFromEndpoint(endpoint: string): RouteHintType | "" {
  if (endpoint.startsWith("commerce/")) return "commerce";
  if (endpoint.startsWith("tutors/")) return "tutors";
  if (endpoint.startsWith("ai/")) return "ai";
  return "";
}

function parseAndNormalizeModelName(raw: unknown): {
  modelName: string;
  invalid?: boolean;
} {
  if (typeof raw !== "string") return { modelName: "" };
  const s = raw.trim();
  if (!s) return { modelName: "" };

  // modelName에 ":" 금지
  if (s.includes(":")) return { modelName: "", invalid: true };
  return { modelName: s };
}

function normalizeProvider(raw: unknown): AiProviderType | "" {
  return normalizeAiProvider(raw);
}

function readProviderFromData(data: UnknownRecord): AiProviderType | "" {
  // root/provider 우선, 없으면 options.provider도 허용(호환)
  const p1 = normalizeProvider(data.provider);
  if (p1) return p1;
  const options = toUnknownRecord(data.options);
  const p2 = normalizeProvider(options.provider);
  if (p2) return p2;
  return "";
}

// 이미지 생성 계열 endpoint인지 판별
export function isImageGenEndpoint(endpoint: string) {
  return /-image(?::|$)/.test(String(endpoint || ""));
}

// 텍스트 콘텐츠 생성 계열 endpoint인지 판별
export function isContentGenEndpoint(endpoint: string) {
  return /-content(?::|$)/.test(String(endpoint || ""));
}

function inferProviderFromEndpoint(endpoint: string): AiProviderType | "" {
  const e = (endpoint || "").toLowerCase();
  if (e.endsWith("-content")) return "";

  // provider가 endpoint에 없으면 body.provider를 존중, provider 명시 "endpoint"는 토큰 파싱에서 자동 인식
  const tokens = e.split(/[^a-z0-9]+/g).filter(Boolean);

  if (tokens.includes("openai")) return "openai";
  if (tokens.includes("claude") || tokens.includes("anthropic")) return "claude";
  if (tokens.includes("google") || tokens.includes("gemini")) return "google";
  if (tokens.includes("xai") || tokens.includes("grok")) return "xai";

  return "";
}

// history(system 제외) 토큰 합산 계산
function computeHistoryTokens(history: unknown[]) {
  return (history || [])
    .filter((m) => {
      const item = toUnknownRecord(m);
      return item.role !== "system";
    })
    .reduce((sum: number, m) => {
      const item = toUnknownRecord(m);
      const raw = item.content;
      const content = typeof raw === "string" ? raw : raw == null ? "" : JSON.stringify(raw);
      return sum + estimateTokens(content);
    }, 0);
}

type RespondFn = (body: unknown, init: ResponseInit | undefined) => NextResponse;

// AI 요청 공통 방어(메시지 길이/토큰/옵션 길이/모델 강제 등)
export async function applyAiRequestGuards(params: {
  endpoint: string;
  data: UnknownRecord;
  respond: RespondFn;
  actorUser?: unknown;
}) {
  const { endpoint, data, respond } = params;

  if (!isAiLikeEndpoint(endpoint)) return null;

  // 서버 endpoint가 권위(클라 body의 routeHint 위조를 무조건 무력화)
  const forcedRouteHint = forceRouteHintFromEndpoint(endpoint);
  if (forcedRouteHint && data && typeof data === "object") {
    data.routeHint = forcedRouteHint;
  }

  // 입력 메시지 길이 최종 방어
  const tierCap = PROMPT_LIMITS.maxInputMessageLength;
  const messageCharCap = tierCap === Infinity ? PER_MESSAGE_CHAR_CAP : Math.min(PER_MESSAGE_CHAR_CAP, tierCap);

  const messageStr = typeof data?.message === "string" ? data.message : "";
  const messageTokens = messageStr ? estimateTokens(messageStr) : 0;

  // 0) message 폭주 방어
  if (messageStr) {
    if (messageStr.length > messageCharCap) {
      return respond(
        {
          error: `message가 너무 깁니다. (최대 ${messageCharCap}자)`,
          errorCode: "MESSAGE_TOO_LONG",
        },
        { status: 413 },
      );
    }

    if (messageTokens > PROMPT_LIMITS.conversationHistory) {
      return respond(
        {
          error: `message가 토큰 제한(${PROMPT_LIMITS.conversationHistory})을 초과했습니다. (현재: ${messageTokens})`,
          errorCode: "MESSAGE_TOKEN_EXCEEDED",
        },
        { status: 413 },
      );
    }
  }

  // 프롬프트 옵션 폭주 방어
  const options = toUnknownRecord(data.options);
  const promptOptions = toUnknownRecord(options.promptOptions);
  if (promptOptions && Object.keys(promptOptions).length) {
    const caps = PROMPT_OPTION_CHAR_CAPS;

    const addIns = typeof promptOptions.additionalInstructions === "string" ? promptOptions.additionalInstructions : "";
    if (addIns && addIns.length > caps.additionalInstructions) {
      return respond(
        {
          error: `additionalInstructions가 너무 깁니다. (최대 ${caps.additionalInstructions}자)`,
          errorCode: "PROMPT_OPTIONS_TOO_LONG",
        },
        { status: 413 },
      );
    }

    const know = typeof promptOptions.knowledgeContext === "string" ? promptOptions.knowledgeContext : "";
    if (know && know.length > caps.knowledgeContext) {
      return respond(
        {
          error: `knowledgeContext가 너무 깁니다. (최대 ${caps.knowledgeContext}자)`,
          errorCode: "PROMPT_OPTIONS_TOO_LONG",
        },
        { status: 413 },
      );
    }

    const tutorTargetLanguage =
      typeof promptOptions.tutorTargetLanguage === "string" ? promptOptions.tutorTargetLanguage : "";
    if (tutorTargetLanguage && tutorTargetLanguage.length > 40) {
      return respond(
        {
          error: "tutorTargetLanguage가 너무 깁니다. (최대 40자)",
          errorCode: "PROMPT_OPTIONS_TOO_LONG",
        },
        { status: 413 },
      );
    }

    const tutorConversationLevel =
      typeof promptOptions.tutorConversationLevel === "string" ? promptOptions.tutorConversationLevel : "";
    if (tutorConversationLevel && tutorConversationLevel.length > 24) {
      return respond(
        {
          error: "tutorConversationLevel이 너무 깁니다. (최대 24자)",
          errorCode: "PROMPT_OPTIONS_TOO_LONG",
        },
        { status: 413 },
      );
    }
  }

  // 1) 모델/프로바이더 정합성
  const endpointProvider = inferProviderFromEndpoint(endpoint);
  const bodyProvider = readProviderFromData(data);

  const parsed = parseAndNormalizeModelName(data.modelName || data.model);
  if (parsed.invalid) {
    return respond({ error: "invalid_model_format", errorCode: "INVALID_MODEL_FORMAT" }, { status: 400 });
  }

  // endpoint가 provider를 특정하는데 body.provider가 다르면 즉시 차단
  if (endpointProvider && bodyProvider && endpointProvider !== bodyProvider) {
    return respond(
      {
        error: "model_provider_mismatch",
        errorCode: "MODEL_PROVIDER_MISMATCH",
      },
      { status: 400 },
    );
  }

  // 최종 provider 결정: endpoint > body > modelPrefix / 모델 기반 추론이 가능한 경우 provider를 서버 권위로 보강 주입
  let effectiveProvider: AiProviderType | "" = endpointProvider || bodyProvider || "";

  // downstream 단일화를 위해 provider를 서버 권위로 주입
  if (effectiveProvider && data && typeof data === "object") {
    data.provider = effectiveProvider;
    if (!isUnknownRecord(data.options)) data.options = {};
    (data.options as UnknownRecord).provider = effectiveProvider;
  }

  const requestedModel = parsed.modelName;

  // 이미지 생성: allowlist + pricing preflight(fixed)
  if (isImageGenEndpoint(endpoint)) {
    const inferredFromModel =
      (await inferSystemProviderFromModelName({ modelName: requestedModel, modality: "image" })) ||
      inferImageProviderFromModelNameRaw(requestedModel);

    // modelName이 특정 provider로 추론되는데 body/endpoint provider가 다르면 즉시 차단
    if (effectiveProvider && inferredFromModel && effectiveProvider !== inferredFromModel) {
      return respond(
        {
          error: "model_provider_mismatch",
          errorCode: "MODEL_PROVIDER_MISMATCH",
        },
        { status: 400 },
      );
    }

    const prov = (effectiveProvider || inferredFromModel || "google") as AiProviderType;

    if (!isImageProvider(prov)) {
      return respond({ error: "unsupported_provider", errorCode: "UNSUPPORTED_PROVIDER" }, { status: 400 });
    }

    const fallback = await resolveSystemDefaultModelName({ provider: prov, modality: "image" });
    let effectiveModel = "";
    const baseImages = Array.isArray(data.baseImages)
      ? (data.baseImages as unknown[]).filter((v) => Boolean(toUnknownRecord(v).data))
      : [];
    const modelImages = Array.isArray(data.modelImages)
      ? (data.modelImages as unknown[]).filter((v) => Boolean(toUnknownRecord(v).data))
      : [];
    const allInputImages = [...modelImages, ...baseImages];

    try {
      effectiveModel = await resolveSystemModelNameOrThrow({
        provider: prov,
        modelName: requestedModel || fallback,
        modality: "image",
        actor: { user: params.actorUser },
      });
    } catch (error: unknown) {
      const meta = toErrorLike(error);
      const blocked = meta.errorCode === "MODEL_NOT_SELECTABLE";
      return respond(
        {
          error: blocked ? "model_not_selectable" : "unsupported_model",
          errorCode: blocked ? "MODEL_NOT_SELECTABLE" : "UNSUPPORTED_MODEL",
        },
        { status: blocked ? 403 : 400 },
      );
    }

    try {
      await assertSystemModelEnabledOrThrow({
        provider: prov,
        modelName: effectiveModel,
        modality: "image",
      });
    } catch (e: unknown) {
      const meta = toErrorLike(e);
      return respond(
        {
          error: (typeof meta.message === "string" && meta.message) || "model_disabled",
          errorCode: String(meta.errorCode || "MODEL_DISABLED"),
        },
        { status: typeof meta.status === "number" ? meta.status : 403 },
      );
    }

    // 참고 이미지 수 제한 — provider별 상한 통합 체크
    const refLimit = (IMAGE_REF_LIMIT_BY_PROVIDER as Record<string, number | undefined>)[prov];
    if (refLimit != null && allInputImages.length > refLimit) {
      return respond(
        {
          error: `${prov}_base_image_limit_exceeded`,
          errorCode: "BASE_IMAGE_LIMIT_EXCEEDED",
        },
        { status: 400 },
      );
    }

    data.modelName = effectiveModel;
    data.model = effectiveModel;
    data.provider = prov;

    const billingModelName = resolveImageBillingModelName({
      provider: prov as ImageProviderType,
      requestedModelName: effectiveModel,
      hasBaseImages: allInputImages.length > 0,
    });
    const resolvedImageOptions = resolveImageGenOptions({
      provider: prov,
      modelName: effectiveModel,
      aspectRatio: data.aspectRatio,
      size: data.size,
    });
    const billingVariant = prov === "google" ? resolvedImageOptions.size : undefined;
    const pricingMaps = await getSystemPricingMaps();
    const billingStrategy = resolveMediaBillingStrategy({
      provider: prov,
      modelName: billingModelName,
      modality: "image",
      variant: billingVariant,
      pricing: pricingMaps,
    });

    data.aspectRatio = resolvedImageOptions.aspectRatio;
    if (resolvedImageOptions.size) data.size = resolvedImageOptions.size;

    if (!isUnknownRecord(data.options)) data.options = {};
    (data.options as UnknownRecord).provider = prov;

    if (prov) {
      try {
        if (billingStrategy === "token" || billingStrategy === "hybrid") {
          await assertPricingPreflightOrThrow({
            provider: prov,
            modelName: billingModelName,
            modality: "image",
            kind: "token",
            variants: [billingVariant],
          });
        }
        if (billingStrategy === "fixed" || billingStrategy === "hybrid") {
          await assertPricingPreflightOrThrow({
            provider: prov,
            modelName: billingModelName,
            modality: "image",
            kind: "fixed",
            variants: [billingVariant],
          });
        }
      } catch (e: unknown) {
        const meta = toErrorLike(e);
        return respond(
          {
            error: (typeof meta.message === "string" && meta.message) || "pricing_preflight_failed",
            errorCode: String(meta.errorCode || "PRICING_PREFLIGHT_FAILED"),
          },
          { status: typeof meta.status === "number" ? meta.status : 400 },
        );
      }
    }

    return null;
  }

  // 콘텐츠 생성: allowlist + pricing preflight(token)
  if (isContentGenEndpoint(endpoint)) {
    const inferredFromModel =
      (await inferSystemProviderFromModelName({ modelName: requestedModel, modality: "text" })) ||
      inferTextProviderFromModelNameRaw(requestedModel);

    // modelName이 특정 provider로 추론되는데 body/endpoint provider가 다르면 즉시 차단
    if (effectiveProvider && inferredFromModel && effectiveProvider !== inferredFromModel) {
      return respond(
        {
          error: "model_provider_mismatch",
          errorCode: "MODEL_PROVIDER_MISMATCH",
        },
        { status: 400 },
      );
    }

    // provider 확정(서버 권위) + 주입
    const prov = (effectiveProvider || inferredFromModel || "google") as AiProviderType;
    if (!isTextProvider(prov)) {
      return respond({ error: "unsupported_provider", errorCode: "UNSUPPORTED_PROVIDER" }, { status: 400 });
    }

    const fallback = await resolveSystemDefaultModelName({ provider: prov, modality: "text" });
    let effectiveModel = "";
    try {
      effectiveModel = await resolveSystemModelNameOrThrow({
        provider: prov,
        modelName: requestedModel || fallback,
        modality: "text",
        actor: { user: params.actorUser },
      });
    } catch (error: unknown) {
      const meta = toErrorLike(error);
      const blocked = meta.errorCode === "MODEL_NOT_SELECTABLE";
      return respond(
        {
          error: blocked ? "model_not_selectable" : "unsupported_model",
          errorCode: blocked ? "MODEL_NOT_SELECTABLE" : "UNSUPPORTED_MODEL",
        },
        { status: blocked ? 403 : 400 },
      );
    }

    try {
      await assertSystemModelEnabledOrThrow({
        provider: prov,
        modelName: effectiveModel,
        modality: "text",
      });
    } catch (e: unknown) {
      const meta = toErrorLike(e);
      return respond(
        {
          error: (typeof meta.message === "string" && meta.message) || "model_disabled",
          errorCode: String(meta.errorCode || "MODEL_DISABLED"),
        },
        { status: typeof meta.status === "number" ? meta.status : 403 },
      );
    }

    data.modelName = effectiveModel;
    data.model = effectiveModel;
    data.provider = prov;
    if (!isUnknownRecord(data.options)) data.options = {};
    (data.options as UnknownRecord).provider = prov;

    const needsShortLongVariants =
      (prov === "google" && isGoogleProTextModel(effectiveModel)) ||
      (prov === "xai" && isXaiLongContextTieredTextModel(effectiveModel)) ||
      (prov === "openai" && isOpenAIGpt6TextModel(effectiveModel));
    try {
      await assertPricingPreflightOrThrow({
        provider: prov,
        modelName: effectiveModel,
        modality: "text",
        kind: "token",
        variants: needsShortLongVariants ? ["short", "long"] : [undefined],
      });
    } catch (e: unknown) {
      const meta = toErrorLike(e);
      return respond(
        {
          error: (typeof meta.message === "string" && meta.message) || "pricing_preflight_failed",
          errorCode: String(meta.errorCode || "PRICING_PREFLIGHT_FAILED"),
        },
        { status: typeof meta.status === "number" ? meta.status : 400 },
      );
    }

    return null;
  }

  // 일반 AI 라우트: modelName이 “텍스트/이미지 allowlist에 존재하는 경우”에 한해 provider 추론/불일치 체크 보강
  if (!effectiveProvider && requestedModel) {
    const inferred =
      (await inferSystemProviderFromModelName({ modelName: requestedModel, modality: "text" })) ||
      (await inferSystemProviderFromModelName({ modelName: requestedModel, modality: "image" })) ||
      inferTextProviderFromModelNameRaw(requestedModel) ||
      inferImageProviderFromModelNameRaw(requestedModel);
    if (inferred) effectiveProvider = inferred;
  }
  if (effectiveProvider && requestedModel) {
    const inferred =
      (await inferSystemProviderFromModelName({ modelName: requestedModel, modality: "text" })) ||
      (await inferSystemProviderFromModelName({ modelName: requestedModel, modality: "image" })) ||
      inferTextProviderFromModelNameRaw(requestedModel) ||
      inferImageProviderFromModelNameRaw(requestedModel);
    if (inferred && effectiveProvider !== inferred) {
      return respond(
        {
          error: "model_provider_mismatch",
          errorCode: "MODEL_PROVIDER_MISMATCH",
        },
        { status: 400 },
      );
    }
  }

  // 일반 AI 라우트: modelName 있으면 pricing preflight(token)
  const effectiveModel = (requestedModel || "").trim();
  if (effectiveModel) {
    data.modelName = effectiveModel;
    data.model = effectiveModel;

    if (effectiveProvider) {
      const modality: AiModalityType =
        data.modality === "audio" || data.modality === "image" || data.modality === "text"
          ? (data.modality as AiModalityType)
          : "text";

      try {
        if (modality === "image" || modality === "text") {
          await assertSystemModelEnabledOrThrow({
            provider: effectiveProvider,
            modelName: effectiveModel,
            modality,
          });
        }

        const needsShortLongVariants =
          (effectiveProvider === "google" && isGoogleProTextModel(effectiveModel)) ||
          (effectiveProvider === "xai" && isXaiLongContextTieredTextModel(effectiveModel)) ||
          (effectiveProvider === "openai" && isOpenAIGpt6TextModel(effectiveModel));
        await assertPricingPreflightOrThrow({
          provider: effectiveProvider,
          modelName: effectiveModel,
          modality,
          kind: "token",
          variants: needsShortLongVariants ? ["short", "long"] : [undefined],
        });
      } catch (e: unknown) {
        const meta = toErrorLike(e);
        return respond(
          {
            error: (typeof meta.message === "string" && meta.message) || "pricing_preflight_failed",
            errorCode: String(meta.errorCode || "PRICING_PREFLIGHT_FAILED"),
          },
          { status: typeof meta.status === "number" ? meta.status : 400 },
        );
      }
    }
  }

  // 2) history normalize + token 총량 제한
  let historyTokens = 0;

  if (Array.isArray(data.history)) {
    data.history = normalizeHistory(data.history, PROMPT_LIMITS.maxMessages, PER_MESSAGE_CHAR_CAP);

    // normalize 이후 "딱 1번"만 계산
    historyTokens = computeHistoryTokens(data.history as unknown[]);

    if (historyTokens > PROMPT_LIMITS.conversationHistory) {
      return respond(
        {
          error: `대화 기록이 토큰 제한(${PROMPT_LIMITS.conversationHistory})을 초과했습니다. (현재: ${historyTokens})`,
          errorCode: "CONVERSATION_HISTORY_TOKEN_EXCEEDED",
        },
        { status: 413 },
      );
    }
  }

  // message + history 합산 체크
  const total = messageTokens + historyTokens;
  if (total > PROMPT_LIMITS.conversationHistory) {
    return respond(
      {
        error: `message+history가 토큰 제한(${PROMPT_LIMITS.conversationHistory})을 초과했습니다. (현재: ${total})`,
        errorCode: "CONVERSATION_HISTORY_TOKEN_EXCEEDED",
      },
      { status: 413 },
    );
  }

  return null;
}
