import { NextRequest, NextResponse } from "next/server";
import type { AiProviderType } from "types/ai";
import type { ImagePromptCustomType, ImagePromptInputPolicyType } from "types/app";
import { GEN_STUDIO_CUSTOM_PROMPT_TEMPLATE_KEY, IMAGE_STUDIO_NAMESPACE_KEY } from "consts/app";
import { resolveImageProvider, generateSaveAndBillImages } from "libs/server-utils/api/imagePipeline";
import {
  createSystemPricingSnapshotRevision,
  getSystemPricingMaps,
  type SystemPricingMaps,
} from "libs/server-utils/api/systemPricingControl";
import { assertSystemModelSelectableOrThrow } from "libs/server-utils/api/systemModelControl";
import { validateAgentKey } from "libs/server-utils/auth/agentKeyAuth";
import { getUserFromDB } from "libs/server-utils/auth/userRoleUtils";
import {
  AGENT_IMAGE_POLICY,
  commitAgentImageUsage,
  enforceAgentDailyImageLimit,
  enforceAgentRequestRateLimit,
} from "libs/server-utils/auth/agentRateLimit";
import { logger } from "utils/log";
import { getImagePromptByKey } from "libs/database/lab";
import { countImageReferenceInputs, resolveImageReferencePolicy } from "utils/lab";
import { toUnknownRecord } from "utils/common";
import {
  applyAgentImageTextPolicy,
  isAgentImageCandidateAllowed,
  isAgentImageRoutingProfile,
  isAgentImageTextPolicy,
  resolveAgentImageRoutingMeta,
  resolveAgentImageRoutingPlan,
  selectFirstAvailableAgentImageCandidate,
  shouldApplyAgentImageTextPolicy,
  type AgentImageRoutingCandidateType,
  type AgentImageRoutingProfileType,
  type AgentImageTextPolicyType,
} from "utils/ai/agentImageRoutingPolicy";
import {
  isCapabilityRouterCostTier,
  isCapabilityRouterLatency,
  isCapabilityRouterQuality,
  resolveCapabilityRoute,
  type CapabilityRouterCandidateType,
  type CapabilityRouterCostTierType,
  type CapabilityRouterDecisionType,
  type CapabilityRouterLatencyType,
  type CapabilityRouterQualityType,
} from "utils/ai/capabilityRouter";
import { estimateImageGenerationCoins } from "utils/ai/imageCostEstimate";

import { extractCodedError } from "utils/common";
export const runtime = "nodejs";

const AGENT_IMAGE_ENDPOINT = "ai/generate/agent-image";

type AgentImageRequestBody = ImagePromptCustomType & {
  routingProfile?: AgentImageRoutingProfileType;
  textPolicy?: AgentImageTextPolicyType;
  quality?: CapabilityRouterQualityType;
  costTier?: CapabilityRouterCostTierType;
  latency?: CapabilityRouterLatencyType;
  language?: string;
  maxEstimatedCoins?: number;
};

type ImageCapabilityHint = {
  quality: CapabilityRouterQualityType;
  costTier: CapabilityRouterCostTierType;
  latency: CapabilityRouterLatencyType;
  supportsReferenceImages: boolean;
};

const IMAGE_CAPABILITY_HINTS: Record<string, ImageCapabilityHint> = {
  "zai:glm-image": {
    quality: "standard",
    costTier: "economy",
    latency: "fast",
    supportsReferenceImages: false,
  },
  "google:gemini-2.5-flash-image": {
    quality: "standard",
    costTier: "balanced",
    latency: "balanced",
    supportsReferenceImages: true,
  },
  "google:gemini-3.1-flash-image-preview": {
    quality: "premium",
    costTier: "premium",
    latency: "balanced",
    supportsReferenceImages: true,
  },
  "google:gemini-3-pro-image-preview": {
    quality: "premium",
    costTier: "premium",
    latency: "quality",
    supportsReferenceImages: true,
  },
  "openai:gpt-image-2.5-flare": {
    quality: "premium",
    costTier: "premium",
    latency: "balanced",
    supportsReferenceImages: true,
  },
  "openai:gpt-image-2.5-sunburst": {
    quality: "premium",
    costTier: "premium",
    latency: "quality",
    supportsReferenceImages: true,
  },
  "xai:grok-imagine-image": {
    quality: "standard",
    costTier: "economy",
    latency: "fast",
    supportsReferenceImages: true,
  },
  "xai:grok-imagine-image-2.0": {
    quality: "premium",
    costTier: "balanced",
    latency: "balanced",
    supportsReferenceImages: false,
  },
};

function codedError(message: string, errorCode: string, status = 400) {
  const err = new Error(message) as Error & { errorCode: string; status: number };
  err.errorCode = errorCode;
  err.status = status;
  return err;
}

function toSafeString(value: unknown) {
  return String(value || "").trim();
}

function resolveAgentTemplateKey(rawTemplateKey: unknown) {
  return toSafeString(rawTemplateKey) || GEN_STUDIO_CUSTOM_PROMPT_TEMPLATE_KEY;
}

function resolveAgentProvider(body: AgentImageRequestBody) {
  const provider = resolveImageProvider({
    bodyProvider: body?.provider,
    modelName: body?.modelName,
  });

  if (!(AGENT_IMAGE_POLICY.allowedProviders as readonly string[]).includes(provider)) {
    throw codedError("agent_provider_not_allowed", "INVALID_PROVIDER", 400);
  }

  return provider as (typeof AGENT_IMAGE_POLICY.allowedProviders)[number];
}

function resolveAgentModelName(
  provider: keyof typeof AGENT_IMAGE_POLICY.defaultModelByProvider,
  body: AgentImageRequestBody,
) {
  const modelName = String(body?.modelName || AGENT_IMAGE_POLICY.defaultModelByProvider[provider]).trim();
  const allowedModels = AGENT_IMAGE_POLICY.allowedModelsByProvider[provider] as readonly string[];

  if (!allowedModels.includes(modelName)) {
    throw codedError("agent_model_not_allowed", "INVALID_MODEL", 400);
  }

  return modelName;
}

function toImageCapabilityCandidate(args: {
  candidate: { provider: string; modelName: string };
  task: string;
  pricingMaps: SystemPricingMaps;
  aspectRatio?: unknown;
  size?: unknown;
  promptChars: number;
  requestedImages: number;
  referenceImageCount: number;
}) {
  const key = `${args.candidate.provider}:${args.candidate.modelName}`;
  const hint = IMAGE_CAPABILITY_HINTS[key];
  // 견적은 과금과 같은 공식을 쓴다. hybrid 모델(fixed 하한 + 토큰 초과분)의 토큰 성분이
  // 상한 판정에서 누락되지 않도록 perImage 곱셈을 쓰지 않는다.
  const estimate = hint
    ? estimateImageGenerationCoins({
        provider: args.candidate.provider as AiProviderType,
        modelName: args.candidate.modelName,
        promptChars: args.promptChars,
        inputImageCount: args.referenceImageCount,
        outputImageCount: args.requestedImages,
        aspectRatio: args.aspectRatio,
        size: args.size,
        pricing: args.pricingMaps,
      })
    : null;

  return {
    key,
    provider: args.candidate.provider,
    modelName: args.candidate.modelName,
    modality: "image" as const,
    tasks: [args.task],
    quality: hint?.quality || ("premium" as const),
    costTier: hint?.costTier || ("premium" as const),
    latency: hint?.latency || ("quality" as const),
    languages: ["*"],
    supportsReferenceImages: hint?.supportsReferenceImages === true,
    estimatedCoins: estimate ? estimate.coins : Number.NaN,
  } satisfies CapabilityRouterCandidateType;
}

function validateCapabilitySignals(body: AgentImageRequestBody) {
  if (body.quality !== undefined && !isCapabilityRouterQuality(body.quality)) {
    throw codedError("invalid_capability_quality", "INVALID_INPUT", 400);
  }
  if (body.costTier !== undefined && !isCapabilityRouterCostTier(body.costTier)) {
    throw codedError("invalid_capability_cost_tier", "INVALID_INPUT", 400);
  }
  if (body.latency !== undefined && !isCapabilityRouterLatency(body.latency)) {
    throw codedError("invalid_capability_latency", "INVALID_INPUT", 400);
  }
  if (body.language !== undefined && (typeof body.language !== "string" || body.language.trim().length > 64)) {
    throw codedError("invalid_capability_language", "INVALID_INPUT", 400);
  }
}

function markUnavailableCapabilityCandidates(
  candidates: readonly CapabilityRouterCandidateType[],
  skipped: readonly { provider: string; modelName: string; errorCode: string }[],
) {
  const skippedByKey = new Map(skipped.map((item) => [`${item.provider}:${item.modelName}`, item.errorCode]));
  return candidates.map((candidate) => {
    const errorCode = skippedByKey.get(candidate.key || `${candidate.provider}:${candidate.modelName}`);
    return errorCode
      ? { ...candidate, available: false as const, unavailableReason: "provider_unavailable" as const }
      : candidate;
  });
}

function getErrorCode(error: unknown) {
  return typeof error === "object" && error && "errorCode" in error
    ? String((error as { errorCode?: unknown }).errorCode || "")
    : "";
}

/**
 * POST /api/ai/generate/agent-image
 *
 * Agent 전용 이미지 생성 엔드포인트
 * - withAuth 세션 인증 대신 X-Agent-Key 헤더로 API 키 인증
 * - 기존 이미지 파이프라인(generateSaveAndBillImages) 100% 재사용
 * - 과금: AGENT_UID 계정의 코인에서 차감
 *
 * Request Headers:
 *   X-Agent-Key: <AGENT_IMAGE_API_KEY>
 *
 * Request Body (JSON):
 *   { prompt, routingProfile?, textPolicy?, aspectRatio?, provider?, modelName?, n?, size?, visibility? }
 *
 * Response:
 *   { ok: true, data: { images: string[], coins, modelName, provider, ... } }
 */
export async function POST(request: NextRequest) {
  try {
    /* 1. API 키 인증 */
    const auth = validateAgentKey(request, { scope: "genstudio:image:generate" });
    if (!auth.valid) {
      return NextResponse.json({ ok: false, error: auth.error, errorCode: "UNAUTHORIZED" }, { status: 401 });
    }
    const agentUser = await getUserFromDB(auth.uid);

    /* 2. 요청 바디 파싱 */
    let body: AgentImageRequestBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON body", errorCode: "INVALID_INPUT" }, { status: 400 });
    }

    /* 3. 프롬프트 검증 */
    const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
    const referenceImages = [...(body?.baseImages || []), ...(body?.modelImages || [])];
    const referenceImageCount = countImageReferenceInputs(referenceImages);
    const hasImg = referenceImageCount > 0;

    if (!prompt && !hasImg) {
      return NextResponse.json(
        { ok: false, error: "prompt_or_baseImage_required", errorCode: "INVALID_INPUT" },
        { status: 400 },
      );
    }

    const requestedImages = Math.max(1, Math.floor(Number(body?.n || 1)));
    if (requestedImages > AGENT_IMAGE_POLICY.maxImagesPerRequest) {
      throw codedError("agent_image_count_exceeded", "IMAGE_COUNT_LIMIT_EXCEEDED", 400);
    }

    const templateKey = resolveAgentTemplateKey(body?.templateKey);

    if (prompt.length > AGENT_IMAGE_POLICY.maxPromptChars) {
      throw codedError("agent_prompt_too_long", "PROMPT_TOO_LONG", 400);
    }

    if (body.routingProfile !== undefined && !isAgentImageRoutingProfile(body.routingProfile)) {
      throw codedError("invalid_image_routing_profile", "INVALID_INPUT", 400);
    }
    if (body.textPolicy !== undefined && !isAgentImageTextPolicy(body.textPolicy)) {
      throw codedError("invalid_image_text_policy", "INVALID_INPUT", 400);
    }
    validateCapabilitySignals(body);

    let routingPlan;
    try {
      routingPlan = resolveAgentImageRoutingPlan({
        routingProfile: body.routingProfile,
        textPolicy: body.textPolicy,
        hasReferenceImages: hasImg,
      });
    } catch (error) {
      throw codedError(
        error instanceof Error ? error.message : "invalid_image_routing_policy",
        getErrorCode(error) || "IMAGE_ROUTING_POLICY_CONFLICT",
        400,
      );
    }

    const hasExplicitSelection = Boolean(body.provider || body.modelName);
    const isLegacyExplicitSelection =
      hasExplicitSelection && body.routingProfile === undefined && body.textPolicy === undefined;
    const textPolicyApplied = shouldApplyAgentImageTextPolicy({
      hasExplicitSelection,
      routingProfile: body.routingProfile,
      textPolicy: body.textPolicy,
    });
    const effectivePrompt = textPolicyApplied
      ? applyAgentImageTextPolicy(prompt, routingPlan.textPolicy)
      : prompt;
    if (effectivePrompt.length > AGENT_IMAGE_POLICY.maxPromptChars) {
      throw codedError("agent_prompt_with_text_policy_too_long", "PROMPT_TOO_LONG", 400);
    }

    const pricingMaps = await getSystemPricingMaps();
    const priceSnapshotRevision = createSystemPricingSnapshotRevision(pricingMaps);
    const capabilitySignals = {
      task: routingPlan.effectiveProfile,
      modality: "image" as const,
      quality: body.quality,
      costTier: body.costTier,
      latency: body.latency,
      language: body.language,
      hasReferenceImages: hasImg,
      maxEstimatedCoins: body.maxEstimatedCoins,
    };

    let provider: keyof typeof AGENT_IMAGE_POLICY.defaultModelByProvider;
    let modelName: string;
    let fallbackApplied = false;
    let routingReason = routingPlan.reason;
    let capabilityRouting: CapabilityRouterDecisionType;

    if (hasExplicitSelection) {
      provider = resolveAgentProvider(body);
      modelName = resolveAgentModelName(provider, body);
      if (provider === "xai" && modelName === "grok-imagine-image-2.0" && hasImg) {
        throw codedError("model_image_input_unsupported", "MODEL_IMAGE_INPUT_UNSUPPORTED", 400);
      }
      if (
        (body.routingProfile || body.textPolicy) &&
        !isAgentImageCandidateAllowed(routingPlan.candidates, provider, modelName)
      ) {
        throw codedError("explicit_model_conflicts_with_routing_profile", "IMAGE_ROUTING_POLICY_CONFLICT", 400);
      }
      const providerPromptLimit =
        provider === "zai" ? AGENT_IMAGE_POLICY.maxPromptCharsByProvider.zai : AGENT_IMAGE_POLICY.maxPromptChars;
      if (effectivePrompt.length > providerPromptLimit) {
        throw codedError("agent_provider_prompt_too_long", "PROMPT_TOO_LONG", 400);
      }
      const explicitCandidate = toImageCapabilityCandidate({
        candidate: { provider, modelName },
        task: routingPlan.effectiveProfile,
        pricingMaps,
        aspectRatio: body.aspectRatio,
        size: body.size,
        promptChars: effectivePrompt.length,
        requestedImages,
        referenceImageCount,
      });
      capabilityRouting = resolveCapabilityRoute({
        signals: capabilitySignals,
        candidates: [explicitCandidate],
        priceSnapshotRevision,
      });
      await assertSystemModelSelectableOrThrow({ provider, modelName, modality: "image", actor: { user: agentUser || undefined } });
      routingReason = "explicit_model_override";
    } else {
      const capabilityCandidates = routingPlan.candidates.map((candidate) =>
        toImageCapabilityCandidate({
          candidate,
          task: routingPlan.effectiveProfile,
          pricingMaps,
          aspectRatio: body.aspectRatio,
          size: body.size,
          promptChars: effectivePrompt.length,
          requestedImages,
          referenceImageCount,
        }),
      );
      capabilityRouting = resolveCapabilityRoute({
        signals: capabilitySignals,
        candidates: capabilityCandidates,
        priceSnapshotRevision,
      });

      let selected;
      try {
        selected = await selectFirstAvailableAgentImageCandidate({
          candidates: capabilityRouting.fallbackChain.map(
            ({ provider: selectedProvider, modelName: selectedModelName }) => ({
              provider: selectedProvider as AgentImageRoutingCandidateType["provider"],
              modelName: selectedModelName,
            }),
          ),
          promptChars: effectivePrompt.length,
          maxZaiPromptChars: AGENT_IMAGE_POLICY.maxPromptCharsByProvider.zai,
          assertSelectable: (candidate) =>
            assertSystemModelSelectableOrThrow({
              ...candidate,
              modality: "image",
              actor: { user: agentUser || undefined },
            }),
        });
      } catch (error) {
        if (getErrorCode(error) === "IMAGE_ROUTE_UNAVAILABLE") {
          throw codedError("agent_image_route_unavailable", "CAPABILITY_ROUTE_UNAVAILABLE", 503);
        }
        throw error;
      }

      if (selected.skipped.length > 0) {
        capabilityRouting = resolveCapabilityRoute({
          signals: capabilitySignals,
          candidates: markUnavailableCapabilityCandidates(capabilityCandidates, selected.skipped),
          priceSnapshotRevision,
        });
      }
      provider = capabilityRouting.selected.provider as keyof typeof AGENT_IMAGE_POLICY.defaultModelByProvider;
      modelName = capabilityRouting.selected.modelName;
      fallbackApplied = capabilityRouting.fallbackApplied;
      if (fallbackApplied) routingReason = `${routingReason}:fallback`;
    }
    if (provider === "xai" && modelName === "grok-imagine-image-2.0" && hasImg) {
      throw codedError("model_image_input_unsupported", "MODEL_IMAGE_INPUT_UNSUPPORTED", 400);
    }
    const reportedRoutingProfile =
      isLegacyExplicitSelection ? "explicit_override" : routingPlan.requestedProfile;
    const reportedEffectiveRoutingProfile =
      isLegacyExplicitSelection ? "explicit_override" : routingPlan.effectiveProfile;
    const size = provider === "google" ? String(body?.size || AGENT_IMAGE_POLICY.defaultGoogleSize) : body?.size;
    const visibility = body?.visibility || AGENT_IMAGE_POLICY.defaultVisibility;

    if (templateKey !== GEN_STUDIO_CUSTOM_PROMPT_TEMPLATE_KEY) {
      const template = await getImagePromptByKey(templateKey);
      if (!template || template.enabled === false) {
        throw codedError("template_not_found", "TEMPLATE_NOT_FOUND", 400);
      }
      const inputPolicy = toUnknownRecord(template).inputPolicy as ImagePromptInputPolicyType | undefined;
      const referencePolicy = resolveImageReferencePolicy(inputPolicy, provider);
      if (
        referencePolicy.required &&
        referencePolicy.enforceInCustomMode &&
        referenceImageCount < referencePolicy.minCount
      ) {
        throw codedError("reference_image_required", "REFERENCE_IMAGE_REQUIRED", 400);
      }
      if (referencePolicy.maxCount > 0 && referenceImageCount > referencePolicy.maxCount) {
        throw codedError("reference_image_max_count_exceeded", "REFERENCE_IMAGE_MAX_COUNT_EXCEEDED", 400);
      }
    }

    await enforceAgentRequestRateLimit({
      uid: auth.uid,
      endpoint: AGENT_IMAGE_ENDPOINT,
      limitPerMinute: AGENT_IMAGE_POLICY.maxRequestsPerMinute,
      keyHash: auth.keyHash,
    });
    await enforceAgentDailyImageLimit({
      uid: auth.uid,
      endpoint: AGENT_IMAGE_ENDPOINT,
      requestedImages,
      keyHash: auth.keyHash,
    });

    logger.info("[agent-image] request accepted", {
      endpoint: AGENT_IMAGE_ENDPOINT,
      uid: auth.uid,
      keyHash: auth.keyHash,
      provider,
      modelName,
      n: requestedImages,
      aspectRatio: String(body?.aspectRatio || ""),
      size: String(size || ""),
      visibility,
      templateKey,
      routingProfile: reportedRoutingProfile,
      effectiveRoutingProfile: reportedEffectiveRoutingProfile,
      textPolicy: routingPlan.textPolicy,
      textPolicyApplied,
      routingReason,
      fallbackApplied,
      capabilityReasonCode: capabilityRouting.reasonCode,
      priceSnapshotRevision: capabilityRouting.priceSnapshotRevision,
      capabilityDecisionKey: capabilityRouting.decisionKey,
      promptBytes: Buffer.byteLength(effectivePrompt, "utf8"),
      hasBaseImages: hasImg,
      referenceImageCount,
    });

    /* 5. 이미지 생성 파이프라인 */
    const routingMeta = resolveAgentImageRoutingMeta({
      routingProfile: reportedRoutingProfile,
      effectiveRoutingProfile: reportedEffectiveRoutingProfile,
      textPolicy: routingPlan.textPolicy,
      textPolicyApplied,
      routingReason,
      fallbackApplied,
    });
    const result = await generateSaveAndBillImages({
      scope: "user",
      uid: auth.uid,
      user: auth,
      provider,
      modelName,
      prompt: effectivePrompt,
      baseImages: body?.baseImages,
      modelImages: body?.modelImages,
      referenceStrength: body?.referenceStrength,
      modelReferenceStrength: body?.modelReferenceStrength,
      n: requestedImages,
      size,
      aspectRatio: body?.aspectRatio,
      metaRoute: AGENT_IMAGE_ENDPOINT,
      appBillingKey: IMAGE_STUDIO_NAMESPACE_KEY,
      pricingMaps,
      metaExtra: {
        capabilityRouting,
      },
      templateKey,
      visibility,
      requestMeta: {
        extraPrompt: effectivePrompt,
        generationMode: "custom",
        source: { service: "agent", surface: "agent-api" },
      },
      routingMeta,
    });

    const generatedImages = Array.isArray(result?.data?.images) ? result.data.images.length : 0;
    await commitAgentImageUsage({
      uid: auth.uid,
      endpoint: AGENT_IMAGE_ENDPOINT,
      generatedImages,
      keyHash: auth.keyHash,
    });

    logger.info("[agent-image] request completed", {
      endpoint: AGENT_IMAGE_ENDPOINT,
      uid: auth.uid,
      keyHash: auth.keyHash,
      provider,
      modelName,
      requestedImages,
      generatedImages,
      templateKey,
      coins: Number(result?.data?.coins || 0),
      executedModelName: String(result?.data?.executedModelName || ""),
      routingProfile: reportedRoutingProfile,
      effectiveRoutingProfile: reportedEffectiveRoutingProfile,
      textPolicy: routingPlan.textPolicy,
      textPolicyApplied,
      routingReason,
      fallbackApplied,
      capabilityReasonCode: capabilityRouting.reasonCode,
      priceSnapshotRevision: capabilityRouting.priceSnapshotRevision,
      capabilityDecisionKey: capabilityRouting.decisionKey,
    });

    return NextResponse.json({
      ...result,
      data: {
        ...result.data,
        routingProfile: reportedRoutingProfile,
        effectiveRoutingProfile: reportedEffectiveRoutingProfile,
        textPolicy: routingPlan.textPolicy,
        textPolicyApplied,
        routingReason,
        fallbackApplied,
        capabilityRouting,
      },
    });
  } catch (err) {
    const { message, errorCode, status } = extractCodedError(err, {
      message: "Image generation failed",
    });
    logger.error("[agent-image] request failed", {
      endpoint: AGENT_IMAGE_ENDPOINT,
      error: message,
      errorCode,
      status,
    });
    return NextResponse.json({ ok: false, error: message, errorCode }, { status });
  }
}
