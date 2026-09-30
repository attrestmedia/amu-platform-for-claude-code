export const CAPABILITY_ROUTER_MODALITIES = ["text", "image"] as const;
export const CAPABILITY_ROUTER_QUALITY_LEVELS = ["standard", "premium"] as const;
export const CAPABILITY_ROUTER_COST_TIERS = ["economy", "balanced", "premium"] as const;
export const CAPABILITY_ROUTER_LATENCY_TIERS = ["fast", "balanced", "quality"] as const;

export type CapabilityRouterModalityType = (typeof CAPABILITY_ROUTER_MODALITIES)[number];
export type CapabilityRouterQualityType = (typeof CAPABILITY_ROUTER_QUALITY_LEVELS)[number];
export type CapabilityRouterCostTierType = (typeof CAPABILITY_ROUTER_COST_TIERS)[number];
export type CapabilityRouterLatencyType = (typeof CAPABILITY_ROUTER_LATENCY_TIERS)[number];

export type CapabilityRouterRejectionReasonType =
  | "modality_unsupported"
  | "task_unsupported"
  | "quality_unsupported"
  | "cost_tier_exceeded"
  | "latency_unsupported"
  | "language_unsupported"
  | "reference_unsupported"
  | "price_unavailable"
  | "price_cap_exceeded"
  | "provider_unavailable"
  | "provider_rate_limited"
  | "provider_credential_unavailable";

export type CapabilityRouterCandidateType = {
  key?: string;
  provider: string;
  modelName: string;
  modality: CapabilityRouterModalityType;
  tasks: readonly string[];
  quality: CapabilityRouterQualityType;
  costTier: CapabilityRouterCostTierType;
  latency: CapabilityRouterLatencyType;
  languages?: readonly string[];
  supportsReferenceImages?: boolean;
  /** 요청 전체의 예상 코인. 가격 snapshot에서 계산한 서버 권위 값이어야 한다. */
  estimatedCoins: number;
  /** false이면 provider 장애·자격증명·rate limit 등 runtime 상태로 제외한다. */
  available?: boolean;
  unavailableReason?: Extract<
    CapabilityRouterRejectionReasonType,
    "provider_unavailable" | "provider_rate_limited" | "provider_credential_unavailable"
  >;
};

export type CapabilityRouterSignalsType = {
  task: string;
  modality: CapabilityRouterModalityType;
  quality?: CapabilityRouterQualityType;
  costTier?: CapabilityRouterCostTierType;
  latency?: CapabilityRouterLatencyType;
  language?: string;
  hasReferenceImages?: boolean;
  maxEstimatedCoins?: number;
};

export function isCapabilityRouterQuality(value: unknown): value is CapabilityRouterQualityType {
  return (CAPABILITY_ROUTER_QUALITY_LEVELS as readonly unknown[]).includes(value);
}

export function isCapabilityRouterCostTier(value: unknown): value is CapabilityRouterCostTierType {
  return (CAPABILITY_ROUTER_COST_TIERS as readonly unknown[]).includes(value);
}

export function isCapabilityRouterLatency(value: unknown): value is CapabilityRouterLatencyType {
  return (CAPABILITY_ROUTER_LATENCY_TIERS as readonly unknown[]).includes(value);
}

export type CapabilityRouterModelReferenceType = {
  key: string;
  provider: string;
  modelName: string;
  estimatedCoins: number;
};

export type CapabilityRouterRejectionType = CapabilityRouterModelReferenceType & {
  reason: CapabilityRouterRejectionReasonType;
};

export type CapabilityRouterReasonCodeType =
  | "task_policy"
  | "quality_requirement"
  | "cost_constraint"
  | "latency_requirement"
  | "language_capability"
  | "reference_capability"
  | "fallback_after_provider_failure"
  | "fallback_after_price_cap"
  | "fallback_after_capability_filter";

export type CapabilityRouterDecisionType = {
  task: string;
  modality: CapabilityRouterModalityType;
  quality?: CapabilityRouterQualityType;
  costTier?: CapabilityRouterCostTierType;
  latency?: CapabilityRouterLatencyType;
  language: string;
  hasReferenceImages: boolean;
  maxEstimatedCoins?: number;
  selected: CapabilityRouterModelReferenceType;
  fallbackChain: CapabilityRouterModelReferenceType[];
  /** 1순위 후보가 선택되지 못했을 때만 true. 후순위 후보가 걸러진 것은 폴백이 아니다. */
  fallbackApplied: boolean;
  reasonCode: CapabilityRouterReasonCodeType;
  priceSnapshotRevision: string;
  decisionKey: string;
  rejected: CapabilityRouterRejectionType[];
};

type CapabilityRouterError = Error & {
  errorCode: "CAPABILITY_INVALID_INPUT" | "CAPABILITY_MISMATCH" | "CAPABILITY_PRICE_CAP_EXCEEDED" | "CAPABILITY_ROUTE_UNAVAILABLE";
  status: number;
  detail?: { rejected: CapabilityRouterRejectionType[] };
};

const QUALITY_RANK: Record<CapabilityRouterQualityType, number> = {
  standard: 1,
  premium: 2,
};

const COST_RANK: Record<CapabilityRouterCostTierType, number> = {
  economy: 1,
  balanced: 2,
  premium: 3,
};

const LATENCY_RANK: Record<CapabilityRouterLatencyType, number> = {
  fast: 1,
  balanced: 2,
  quality: 3,
};

function codedError(
  message: string,
  errorCode: CapabilityRouterError["errorCode"],
  status: number,
  rejected: CapabilityRouterRejectionType[],
): CapabilityRouterError {
  const error = new Error(message) as CapabilityRouterError;
  error.errorCode = errorCode;
  error.status = status;
  error.detail = { rejected };
  return error;
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeLanguage(value: unknown) {
  return normalizeString(value).replace(/_/g, "-");
}

function candidateKey(candidate: CapabilityRouterCandidateType) {
  return candidate.key?.trim() || `${normalizeString(candidate.provider)}:${candidate.modelName.trim()}`;
}

function toReference(candidate: CapabilityRouterCandidateType): CapabilityRouterModelReferenceType {
  return {
    key: candidateKey(candidate),
    provider: normalizeString(candidate.provider),
    modelName: candidate.modelName.trim(),
    estimatedCoins: candidate.estimatedCoins,
  };
}

function languageMatches(candidate: CapabilityRouterCandidateType, requestedLanguage: string) {
  if (!requestedLanguage) return true;
  if (!candidate.languages?.length) return false;
  return candidate.languages.some((language) => {
    const normalized = normalizeLanguage(language);
    return normalized === "*" || normalized === requestedLanguage || requestedLanguage.startsWith(`${normalized}-`);
  });
}

function capabilityBaseReason(signals: CapabilityRouterSignalsType): CapabilityRouterReasonCodeType {
  if (signals.hasReferenceImages) return "reference_capability";
  if (signals.quality) return "quality_requirement";
  if (signals.costTier) return "cost_constraint";
  if (signals.latency) return "latency_requirement";
  if (signals.language) return "language_capability";
  return "task_policy";
}

function stableDecisionKey(
  signals: Required<Pick<CapabilityRouterSignalsType, "task" | "modality" | "hasReferenceImages">> &
    Omit<CapabilityRouterSignalsType, "task" | "modality" | "hasReferenceImages">,
  priceSnapshotRevision: string,
  candidates: readonly CapabilityRouterCandidateType[],
) {
  const signalKey = [
    signals.task,
    signals.modality,
    signals.quality || "",
    signals.costTier || "",
    signals.latency || "",
    signals.language || "",
    signals.hasReferenceImages ? "reference" : "no-reference",
    signals.maxEstimatedCoins ?? "",
  ].join("|");
  const candidateKeyValue = candidates
    .map((candidate) =>
      [
        candidateKey(candidate),
        candidate.estimatedCoins,
        candidate.available === false ? candidate.unavailableReason || "unavailable" : "available",
      ].join("~"),
    )
    .join(";");
  return `capability-router:v1|${priceSnapshotRevision}|${signalKey}|${candidateKeyValue}`;
}

function isCapabilityOnlyReason(reason: CapabilityRouterRejectionReasonType) {
  return [
    "modality_unsupported",
    "task_unsupported",
    "quality_unsupported",
    "cost_tier_exceeded",
    "latency_unsupported",
    "language_unsupported",
    "reference_unsupported",
  ].includes(reason);
}

export function resolveCapabilityRoute(args: {
  signals: CapabilityRouterSignalsType;
  candidates: readonly CapabilityRouterCandidateType[];
  priceSnapshotRevision: string;
}): CapabilityRouterDecisionType {
  const task = normalizeString(args.signals.task);
  const priceSnapshotRevision = normalizeString(args.priceSnapshotRevision);
  const maxEstimatedCoins = args.signals.maxEstimatedCoins;

  if (!task || !CAPABILITY_ROUTER_MODALITIES.includes(args.signals.modality) || !priceSnapshotRevision) {
    throw codedError("capability router input is invalid", "CAPABILITY_INVALID_INPUT", 400, []);
  }
  if (maxEstimatedCoins !== undefined && (!Number.isFinite(maxEstimatedCoins) || maxEstimatedCoins < 0)) {
    throw codedError("maxEstimatedCoins is invalid", "CAPABILITY_INVALID_INPUT", 400, []);
  }

  const signals = {
    ...args.signals,
    task,
    language: normalizeLanguage(args.signals.language),
    hasReferenceImages: Boolean(args.signals.hasReferenceImages),
  };
  const rejected: CapabilityRouterRejectionType[] = [];
  const eligible: CapabilityRouterCandidateType[] = [];

  for (const candidate of args.candidates) {
    const reference = toReference(candidate);
    let reason: CapabilityRouterRejectionReasonType | undefined;
    if (candidate.modality !== signals.modality) reason = "modality_unsupported";
    else if (!candidate.tasks.some((item) => normalizeString(item) === task)) reason = "task_unsupported";
    else if (signals.quality && QUALITY_RANK[candidate.quality] < QUALITY_RANK[signals.quality]) {
      reason = "quality_unsupported";
    } else if (signals.costTier && COST_RANK[candidate.costTier] > COST_RANK[signals.costTier]) {
      reason = "cost_tier_exceeded";
    } else if (signals.latency && LATENCY_RANK[candidate.latency] > LATENCY_RANK[signals.latency]) {
      reason = "latency_unsupported";
    } else if (!languageMatches(candidate, signals.language)) reason = "language_unsupported";
    else if (signals.hasReferenceImages && candidate.supportsReferenceImages !== true) reason = "reference_unsupported";
    else if (!Number.isFinite(candidate.estimatedCoins) || candidate.estimatedCoins < 0) reason = "price_unavailable";
    else if (maxEstimatedCoins !== undefined && candidate.estimatedCoins > maxEstimatedCoins) reason = "price_cap_exceeded";
    else if (candidate.available === false) reason = candidate.unavailableReason || "provider_unavailable";

    if (reason) rejected.push({ ...reference, reason });
    else eligible.push(candidate);
  }

  if (!eligible.length) {
    const reasons = rejected.map((item) => item.reason);
    const allCapabilityMismatch = reasons.length > 0 && reasons.every(isCapabilityOnlyReason);
    const allPriceCap = reasons.length > 0 && reasons.every((reason) => reason === "price_cap_exceeded");
    if (allCapabilityMismatch) {
      throw codedError("no candidate satisfies the requested capabilities", "CAPABILITY_MISMATCH", 400, rejected);
    }
    if (allPriceCap) {
      throw codedError("no candidate satisfies the price cap", "CAPABILITY_PRICE_CAP_EXCEEDED", 422, rejected);
    }
    throw codedError("no runtime-ready capability route is available", "CAPABILITY_ROUTE_UNAVAILABLE", 503, rejected);
  }

  const selected = eligible[0];
  const selectedReference = toReference(selected);
  // 폴백은 "1순위가 밀려났다"는 뜻이다. 선택된 후보보다 뒤에 있던 후보가 걸러진 것은
  // 폴백이 아니므로 fallbackApplied에 넣지 않는다. 이 값은 ImageAsset.routingMeta로 영속된다.
  const selectedIndex = args.candidates.indexOf(selected);
  const fallbackApplied = selectedIndex > 0;
  const precedingReasons = rejected
    .slice(0, Math.max(0, selectedIndex))
    .map((item) => item.reason);
  let reasonCode = capabilityBaseReason(signals);
  if (fallbackApplied) {
    if (precedingReasons.some((reason) => reason === "provider_unavailable" || reason === "provider_rate_limited" || reason === "provider_credential_unavailable")) {
      reasonCode = "fallback_after_provider_failure";
    } else if (precedingReasons.some((reason) => reason === "price_cap_exceeded")) {
      reasonCode = "fallback_after_price_cap";
    } else {
      reasonCode = "fallback_after_capability_filter";
    }
  }

  return {
    task,
    modality: signals.modality,
    quality: signals.quality,
    costTier: signals.costTier,
    latency: signals.latency,
    language: signals.language,
    hasReferenceImages: signals.hasReferenceImages,
    maxEstimatedCoins,
    selected: selectedReference,
    fallbackChain: eligible.map(toReference),
    fallbackApplied,
    reasonCode,
    priceSnapshotRevision,
    decisionKey: stableDecisionKey(signals, priceSnapshotRevision, args.candidates),
    rejected,
  };
}
