export const AGENT_IMAGE_ROUTING_PROFILES = [
  "supporting_visual",
  "graphic_no_text",
  "premium_template_sample",
] as const;

export const AGENT_IMAGE_PERSISTED_ROUTING_PROFILES = [
  ...AGENT_IMAGE_ROUTING_PROFILES,
  "explicit_override",
] as const;

export const AGENT_IMAGE_TEXT_POLICIES = ["none", "overlay_later", "embedded_required"] as const;

export type AgentImageRoutingProfileType = (typeof AGENT_IMAGE_ROUTING_PROFILES)[number];
export type AgentImagePersistedRoutingProfileType = (typeof AGENT_IMAGE_PERSISTED_ROUTING_PROFILES)[number];
export type AgentImageTextPolicyType = (typeof AGENT_IMAGE_TEXT_POLICIES)[number];

export type AgentImageRoutingCandidateType = {
  provider: "google" | "openai" | "xai" | "zai";
  modelName: string;
};

export const AGENT_IMAGE_ROUTING_META_KEYS = [
  "routingProfile",
  "effectiveRoutingProfile",
  "textPolicy",
  "textPolicyApplied",
  "routingReason",
  "fallbackApplied",
] as const;

export type AgentImageRoutingMetaType = {
  routingProfile: AgentImagePersistedRoutingProfileType;
  effectiveRoutingProfile: AgentImagePersistedRoutingProfileType;
  textPolicy: AgentImageTextPolicyType;
  textPolicyApplied: boolean;
  routingReason: string;
  fallbackApplied: boolean;
};

const AGENT_IMAGE_ROUTING_REASONS = [
  "embedded_text_requires_premium",
  "reference_image_requires_non_zai_fallback",
  "profile_supporting_visual",
  "profile_graphic_no_text",
  "profile_premium_template_sample",
  "explicit_model_override",
] as const;

/**
 * 라우팅 증거를 자산·과금 메타에 저장할 단일 정규화 형태로 만든다.
 * 응답/로그와 동일한 필드가 ImageAsset에도 영속되도록 route→pipeline→repo 경로에서 공용으로 사용한다.
 */
export function resolveAgentImageRoutingMeta(args: {
  routingProfile: AgentImagePersistedRoutingProfileType;
  effectiveRoutingProfile: AgentImagePersistedRoutingProfileType;
  textPolicy: AgentImageTextPolicyType;
  textPolicyApplied: boolean;
  routingReason?: string;
  fallbackApplied?: boolean;
}): AgentImageRoutingMetaType {
  return {
    routingProfile: args.routingProfile,
    effectiveRoutingProfile: args.effectiveRoutingProfile,
    textPolicy: args.textPolicy,
    textPolicyApplied: Boolean(args.textPolicyApplied),
    routingReason: isAgentImageRoutingReason(args.routingReason) ? args.routingReason : "",
    fallbackApplied: Boolean(args.fallbackApplied),
  };
}

const ROUTING_CANDIDATES: Record<AgentImageRoutingProfileType, readonly AgentImageRoutingCandidateType[]> = {
  supporting_visual: [
    { provider: "zai", modelName: "glm-image" },
    { provider: "google", modelName: "gemini-2.5-flash-image" },
  ],
  graphic_no_text: [
    { provider: "google", modelName: "gemini-2.5-flash-image" },
    { provider: "xai", modelName: "grok-imagine-image" },
  ],
  premium_template_sample: [
    { provider: "google", modelName: "gemini-3.1-flash-image-preview" },
    { provider: "xai", modelName: "grok-imagine-image-2.0" },
    { provider: "openai", modelName: "gpt-image-2.5-flare" },
  ],
};

function defaultTextPolicy(profile: AgentImageRoutingProfileType): AgentImageTextPolicyType {
  if (profile === "graphic_no_text") return "none";
  if (profile === "premium_template_sample") return "embedded_required";
  return "overlay_later";
}

export function isAgentImageRoutingProfile(value: unknown): value is AgentImageRoutingProfileType {
  return (AGENT_IMAGE_ROUTING_PROFILES as readonly unknown[]).includes(value);
}

export function isAgentImagePersistedRoutingProfile(value: unknown): value is AgentImagePersistedRoutingProfileType {
  return (AGENT_IMAGE_PERSISTED_ROUTING_PROFILES as readonly unknown[]).includes(value);
}

export function isAgentImageTextPolicy(value: unknown): value is AgentImageTextPolicyType {
  return (AGENT_IMAGE_TEXT_POLICIES as readonly unknown[]).includes(value);
}

function isAgentImageRoutingReason(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value === "") return true;
  const [reason, ...suffixes] = value.split(":");
  return (
    (AGENT_IMAGE_ROUTING_REASONS as readonly string[]).includes(reason) &&
    suffixes.every((suffix) => suffix === "fallback")
  );
}

/**
 * Agent 이미지 라우팅 증거의 저장·응답 경계 sanitizer.
 * 허용된 여섯 필드만 새 객체로 복사해 provider 원본 응답이나 자격증명 같은 임의 메타가
 * ImageAsset, 생성 응답, evidence bundle로 흘러가지 않게 한다.
 */
export function sanitizeAgentImageRoutingMeta(value: unknown): AgentImageRoutingMetaType | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  if (
    !isAgentImagePersistedRoutingProfile(raw.routingProfile) ||
    !isAgentImagePersistedRoutingProfile(raw.effectiveRoutingProfile) ||
    !isAgentImageTextPolicy(raw.textPolicy) ||
    typeof raw.textPolicyApplied !== "boolean" ||
    !isAgentImageRoutingReason(raw.routingReason) ||
    typeof raw.fallbackApplied !== "boolean"
  ) {
    return undefined;
  }

  return {
    routingProfile: raw.routingProfile,
    effectiveRoutingProfile: raw.effectiveRoutingProfile,
    textPolicy: raw.textPolicy,
    textPolicyApplied: raw.textPolicyApplied,
    routingReason: raw.routingReason,
    fallbackApplied: raw.fallbackApplied,
  };
}

export function toAgentImageRoutingMetaResponse(value: unknown): { routingMeta?: AgentImageRoutingMetaType } {
  const routingMeta = sanitizeAgentImageRoutingMeta(value);
  return routingMeta ? { routingMeta } : {};
}

/**
 * 과금 원장의 부가 메타는 기존 호출자 정보를 보존하되, 라우팅 증거 여섯 필드는
 * 서버에서 확정한 값으로 마지막에 병합한다. 따라서 caller metaExtra는 라우팅 판단을 덮어쓸 수 없다.
 */
export function mergeAgentImageRoutingMetaForBilling(
  meta: Record<string, unknown>,
  routingMeta: unknown,
): Record<string, unknown> {
  return {
    ...meta,
    ...(sanitizeAgentImageRoutingMeta(routingMeta) || {}),
  };
}

export function resolveAgentImageRoutingPlan(args: {
  routingProfile?: unknown;
  textPolicy?: unknown;
  hasReferenceImages?: boolean;
}) {
  const requestedProfile = isAgentImageRoutingProfile(args.routingProfile)
    ? args.routingProfile
    : "supporting_visual";
  const textPolicy = isAgentImageTextPolicy(args.textPolicy)
    ? args.textPolicy
    : defaultTextPolicy(requestedProfile);

  if (requestedProfile === "graphic_no_text" && textPolicy !== "none") {
    const error = new Error("graphic_no_text_requires_text_policy_none") as Error & { errorCode: string };
    error.errorCode = "IMAGE_ROUTING_POLICY_CONFLICT";
    throw error;
  }

  const effectiveProfile =
    textPolicy === "embedded_required" ? "premium_template_sample" : requestedProfile;
  const candidates = ROUTING_CANDIDATES[effectiveProfile].filter(
    (candidate) =>
      !(args.hasReferenceImages && candidate.provider === "zai") &&
      !(args.hasReferenceImages && candidate.provider === "xai" && candidate.modelName === "grok-imagine-image-2.0"),
  );

  return {
    requestedProfile,
    effectiveProfile,
    textPolicy,
    reason:
      requestedProfile !== effectiveProfile
        ? "embedded_text_requires_premium"
        : args.hasReferenceImages && requestedProfile === "supporting_visual"
          ? "reference_image_requires_non_zai_fallback"
          : `profile_${effectiveProfile}`,
    candidates,
  } as const;
}

export function isAgentImageCandidateAllowed(
  candidates: readonly AgentImageRoutingCandidateType[],
  provider: string,
  modelName: string,
) {
  return candidates.some((candidate) => candidate.provider === provider && candidate.modelName === modelName);
}

export function applyAgentImageTextPolicy(prompt: string, textPolicy: AgentImageTextPolicyType) {
  const base = String(prompt || "").trim();
  if (textPolicy === "none") {
    return [base, "Do not include text, letters, numbers, typography, logos, captions, or watermarks."]
      .filter(Boolean)
      .join("\n\n");
  }
  if (textPolicy === "overlay_later") {
    return [
      base,
      "Do not render readable text. Leave clean, uncluttered areas for deterministic text overlays added later.",
    ]
      .filter(Boolean)
      .join("\n\n");
  }
  return base;
}

export function shouldApplyAgentImageTextPolicy(args: {
  hasExplicitSelection: boolean;
  routingProfile?: unknown;
  textPolicy?: unknown;
}) {
  return !args.hasExplicitSelection || args.routingProfile !== undefined || args.textPolicy !== undefined;
}

function codedRoutingError(message: string, errorCode: string, status: number) {
  const error = new Error(message) as Error & { errorCode: string; status: number };
  error.errorCode = errorCode;
  error.status = status;
  return error;
}

function getErrorCode(error: unknown) {
  return typeof error === "object" && error && "errorCode" in error
    ? String((error as { errorCode?: unknown }).errorCode || "")
    : "";
}

export async function selectFirstAvailableAgentImageCandidate(args: {
  candidates: readonly AgentImageRoutingCandidateType[];
  promptChars: number;
  maxZaiPromptChars: number;
  assertSelectable: (candidate: AgentImageRoutingCandidateType) => Promise<unknown>;
}) {
  const skipped: Array<AgentImageRoutingCandidateType & { errorCode: string }> = [];

  for (const candidate of args.candidates) {
    if (candidate.provider === "zai" && args.promptChars > args.maxZaiPromptChars) {
      skipped.push({ ...candidate, errorCode: "PROVIDER_PROMPT_TOO_LONG" });
      continue;
    }

    try {
      await args.assertSelectable(candidate);
      return { ...candidate, skipped };
    } catch (error) {
      const errorCode = getErrorCode(error);
      if (!["UNSUPPORTED_MODEL", "MODEL_NOT_SELECTABLE", "MODEL_DISABLED"].includes(errorCode)) {
        throw error;
      }
      skipped.push({ ...candidate, errorCode });
    }
  }

  throw codedRoutingError("agent_image_route_unavailable", "IMAGE_ROUTE_UNAVAILABLE", 503);
}
