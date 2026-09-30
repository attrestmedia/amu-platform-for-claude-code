import type { ImageProviderType } from "types/ai";
import type { SupportedAspectRatio, OpenAICompatImageSize, GoogleImageSizeType } from "consts/ai";
import {
  DEFAULT_IMAGE_ASPECT,
  SUPPORTED_ASPECT_RATIOS,
  OPENAI_COMPAT_IMAGE_SIZES,
  ASPECT_TO_OPENAI_COMPAT_SIZE,
  getOpenAIImageSizeForAspect,
  getDefaultGoogleImageSize,
  getSupportedGoogleAspectRatios,
  getSupportedGoogleImageSizes,
  getSupportedOpenAIAspectRatios,
} from "consts/ai";

/**
 * @docHint
 * @purpose imageOptions 유틸 기능 제공
 * @process 입력 정규화  변환  보조 처리 제공
 * @domain ai
 * @scope shared
 */

// 순환참조를 피하기 위해 자체 normalize 사용
export function normalizeSupportedAspectRatio(
  raw: unknown,
  allowedRatios: readonly SupportedAspectRatio[] = SUPPORTED_ASPECT_RATIOS,
): SupportedAspectRatio {
  const s = typeof raw === "string" ? raw.trim() : "";
  if ((allowedRatios as readonly string[]).includes(s)) return s as SupportedAspectRatio;
  return DEFAULT_IMAGE_ASPECT;
}

export function normalizeGoogleImageSize(raw: unknown, modelName?: string): GoogleImageSizeType {
  const s = typeof raw === "string" ? raw.trim() : "";
  const allowed = getSupportedGoogleImageSizes(modelName);
  if ((allowed as readonly string[]).includes(s)) return s as GoogleImageSizeType;
  return getDefaultGoogleImageSize(modelName);
}

export function normalizeOpenAICompatSize(raw: unknown): OpenAICompatImageSize | "" {
  const s = typeof raw === "string" ? raw.trim() : "";
  if ((OPENAI_COMPAT_IMAGE_SIZES as readonly string[]).includes(s)) return s as OpenAICompatImageSize;
  return "";
}

export function inferAspectFromOpenAICompatSize(size: OpenAICompatImageSize): SupportedAspectRatio {
  if (size === "1024x1024") return "1:1";
  if (size === "1536x1024") return "16:9";
  return "9:16"; // "1024x1792"
}

// aspectRatio → size 매핑 정책
// - google: aspectRatio만 확정(사이즈는 메타/UX용으로만 유지 가능)
// - openai/xai: aspectRatio가 있으면 무조건 매핑된 size 사용 (size는 aspect에 종속)
export function resolveImageGenOptions(args: {
  provider: ImageProviderType | string;
  modelName?: string;
  aspectRatio?: unknown;
  size?: unknown;
}): {
  aspectRatio: SupportedAspectRatio;
  size?: string;
} {
  const p = String(args.provider || "")
    .trim()
    .toLowerCase();
  const hasAspect = typeof args.aspectRatio === "string" && args.aspectRatio.trim().length > 0;

  const allowedRatios =
    p === "google"
      ? getSupportedGoogleAspectRatios(args.modelName)
      : p === "openai"
        ? getSupportedOpenAIAspectRatios(args.modelName)
        : SUPPORTED_ASPECT_RATIOS;
  const aspect = normalizeSupportedAspectRatio(args.aspectRatio, allowedRatios);

  // OpenAI-compatible 계열은 size 강제 정책 적용
  if (p === "openai" || p === "xai" || p === "zai") {
    // aspect가 있으면 무조건 aspect 기준으로 size 결정 (클라/어드민 size는 무시)
    if (hasAspect) {
      return { aspectRatio: aspect, size: getOpenAIImageSizeForAspect(args.modelName, aspect) };
    }

    // aspect가 없으면 size가 유효한지 먼저 보고, 유효하면 그걸 사용
    const size = normalizeOpenAICompatSize(args.size);
    if (size) {
      return { aspectRatio: inferAspectFromOpenAICompatSize(size), size };
    }

    // 둘 다 애매하면 DEFAULT_IMAGE_ASPECT 기준으로 매핑
    return { aspectRatio: aspect, size: ASPECT_TO_OPENAI_COMPAT_SIZE[aspect] };
  }

  // google: upstream에선 aspectRatio만 의미. size는 호출엔 영향 없게 두되, 메타/UX 용으로만 유지
  return {
    aspectRatio: aspect,
    size: normalizeGoogleImageSize(args.size, args.modelName),
  };
}
