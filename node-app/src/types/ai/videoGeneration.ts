import { DEFAULT_VIDEO_MODEL_BY_PROVIDER, VIDEO_MODEL_MAP } from "consts/ai";
import { FIXED_COSTS } from "consts/payment";

export const VIDEO_GENERATION_MODES = [
  "text-to-video",
  "image-to-video",
  "reference-to-video",
  "edit",
  "extend",
] as const;
export type VideoGenerationModeType = (typeof VIDEO_GENERATION_MODES)[number];

export const VIDEO_JOB_STATUSES = [
  "queued",
  "running",
  "success",
  "partial",
  "failed",
  "expired",
  "cancelled",
] as const;
export type VideoJobStatusType = (typeof VIDEO_JOB_STATUSES)[number];

export type VideoAssetRef = {
  assetId?: string;
  url?: string;
  mimeType?: string;
  width?: number;
  height?: number;
};

export type VideoAudioOption = { enabled: boolean };

export type VideoGenerationRequest = {
  modality: "video";
  prompt: string;
  provider?: "google" | "xai" | "zai";
  modelName?: string;
  mode: VideoGenerationModeType;
  inputImages?: VideoAssetRef[];
  inputVideo?: VideoAssetRef;
  aspectRatio?: string;
  durationSeconds?: number;
  resolution?: string;
  audio?: VideoAudioOption;
  visibility: "private" | "public";
  clientRequestId: string;
  confirmedPromptHash?: string;
  pricingRevision?: string;
};

export type VideoAsset = VideoAssetRef & {
  assetId: string;
  url: string;
  mimeType: "video/mp4" | "video/webm";
  durationSeconds?: number;
  alt?: string;
};

export type VideoGenJob = {
  jobId: string;
  scope?: "user" | "universe";
  uid?: string;
  providerRequestId?: string;
  status: VideoJobStatusType;
  requestedDurationSeconds?: number;
  actualDurationSeconds?: number;
  provider: string;
  modelName: string;
  assets?: VideoAsset[];
  estimatedCoins?: number;
  actualCoins?: number;
  pricingRevision?: string;
  reserveOperationId?: string;
  settlementOperationId?: string;
  errorCode?: string;
  errorMessage?: string;
};

export type VideoCapability = {
  provider: "google" | "xai" | "zai";
  modelName: string;
  modes: readonly VideoGenerationModeType[];
  durations: readonly number[];
  resolutions: readonly string[];
  aspectRatios: readonly string[];
  audio: boolean;
  maxReferenceImages: number;
  pricingVariant?: string;
};

const COMMON_ASPECT_RATIOS = ["16:9", "9:16", "1:1"] as const;

/**
 * S4-01의 UI·서버 공통 capability fixture.
 * 운영 catalog가 capability를 제공하기 전까지는 안전한 최소 조합만 허용한다.
 */
export const VIDEO_CAPABILITY_MATRIX: readonly VideoCapability[] = [
  {
    provider: "google",
    modelName: DEFAULT_VIDEO_MODEL_BY_PROVIDER.google,
    modes: ["text-to-video", "image-to-video", "reference-to-video"],
    durations: [4, 6, 8],
    resolutions: ["720p", "1080p"],
    aspectRatios: COMMON_ASPECT_RATIOS,
    audio: true,
    maxReferenceImages: 1,
    pricingVariant: "720p",
  },
  {
    provider: "google",
    modelName: VIDEO_MODEL_MAP.google[0],
    modes: ["text-to-video", "image-to-video"],
    durations: [4, 6, 8],
    resolutions: ["720p", "1080p", "4K"],
    aspectRatios: ["16:9", "9:16"],
    audio: true,
    maxReferenceImages: 1,
    pricingVariant: "720p",
  },
  {
    provider: "google",
    modelName: VIDEO_MODEL_MAP.google[2],
    modes: ["text-to-video", "image-to-video"],
    durations: [4, 6, 8],
    resolutions: ["720p", "1080p"],
    aspectRatios: ["16:9", "9:16"],
    audio: false,
    maxReferenceImages: 1,
    pricingVariant: "720p",
  },
  {
    provider: "xai",
    modelName: DEFAULT_VIDEO_MODEL_BY_PROVIDER.xai,
    modes: ["text-to-video", "image-to-video", "reference-to-video", "extend"],
    durations: [5, 10],
    resolutions: ["480p", "720p", "1080p"],
    aspectRatios: COMMON_ASPECT_RATIOS,
    audio: false,
    maxReferenceImages: 3,
    pricingVariant: "720p",
  },
  {
    provider: "zai",
    modelName: DEFAULT_VIDEO_MODEL_BY_PROVIDER.zai,
    modes: ["text-to-video", "image-to-video"],
    durations: [5, 10],
    resolutions: ["720p"],
    aspectRatios: ["16:9"],
    audio: false,
    maxReferenceImages: 1,
  },
] as const;

export type VideoGenerationValidationResult =
  | { ok: true; capability: VideoCapability }
  | { ok: false; reason: VideoGenerationRejectionReasonType };

export const VIDEO_GENERATION_REJECTION_REASONS = [
  "prompt_required",
  "model_not_supported",
  "mode_not_supported",
  "duration_not_supported",
  "resolution_not_supported",
  "aspect_ratio_not_supported",
  "reference_required",
  "reference_not_supported",
  "audio_not_supported",
] as const;
export type VideoGenerationRejectionReasonType = (typeof VIDEO_GENERATION_REJECTION_REASONS)[number];

function findCapability(provider: string | undefined, modelName: string | undefined) {
  return VIDEO_CAPABILITY_MATRIX.find(
    (item) =>
      item.provider === String(provider || "").trim().toLowerCase() &&
      item.modelName === String(modelName || "").trim(),
  );
}

export function validateVideoGenerationRequest(
  request: Pick<VideoGenerationRequest, "prompt" | "provider" | "modelName" | "mode" | "inputImages" | "inputVideo" | "durationSeconds" | "resolution" | "aspectRatio" | "audio">,
): VideoGenerationValidationResult {
  if (!String(request.prompt || "").trim()) return { ok: false, reason: "prompt_required" };

  const capability = findCapability(request.provider, request.modelName);
  if (!capability) return { ok: false, reason: "model_not_supported" };
  if (!capability.modes.includes(request.mode)) return { ok: false, reason: "mode_not_supported" };
  if (request.durationSeconds != null && !capability.durations.includes(request.durationSeconds)) {
    return { ok: false, reason: "duration_not_supported" };
  }
  if (request.resolution && !capability.resolutions.includes(request.resolution)) {
    return { ok: false, reason: "resolution_not_supported" };
  }
  if (request.aspectRatio && !capability.aspectRatios.includes(request.aspectRatio)) {
    return { ok: false, reason: "aspect_ratio_not_supported" };
  }

  const referenceCount = (request.inputImages || []).length;
  if (request.mode === "image-to-video" && referenceCount < 1) return { ok: false, reason: "reference_required" };
  if (referenceCount > capability.maxReferenceImages) return { ok: false, reason: "reference_not_supported" };
  if (request.inputVideo && request.mode !== "edit" && request.mode !== "extend") {
    return { ok: false, reason: "mode_not_supported" };
  }
  if (request.audio?.enabled && !capability.audio) return { ok: false, reason: "audio_not_supported" };

  return { ok: true, capability };
}

export type VideoGenerationCoinEstimate = {
  coins: number;
  billingKey: string;
  pricingBasis: "per-second" | "per-video";
};

export function estimateVideoGenerationCoins(args: {
  provider: "google" | "xai" | "zai";
  modelName: string;
  durationSeconds: number;
  resolution: string;
  pricing?: Record<string, { perSecond?: number; perVideo?: number }>;
}): VideoGenerationCoinEstimate | null {
  const pricing = args.pricing || (FIXED_COSTS as Record<string, { perSecond?: number; perVideo?: number }>);
  const base = `${args.provider}:${args.modelName}`;
  const candidates = [`${base}:${args.resolution}`, base];
  const billingKey = candidates.find((key) => pricing[key]) || "";
  if (!billingKey) return null;

  const row = pricing[billingKey];
  if (typeof row.perSecond === "number" && row.perSecond > 0) {
    return {
      coins: Math.ceil(Math.max(1, args.durationSeconds)) * row.perSecond,
      billingKey,
      pricingBasis: "per-second",
    };
  }
  if (typeof row.perVideo === "number" && row.perVideo > 0) {
    return { coins: row.perVideo, billingKey, pricingBasis: "per-video" };
  }
  return null;
}

export function getDefaultVideoModel(provider: "google" | "xai" | "zai") {
  return DEFAULT_VIDEO_MODEL_BY_PROVIDER[provider];
}
