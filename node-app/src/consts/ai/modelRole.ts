import { hasAudioUnderstandingEvidence } from "./audioUnderstandingEvidence";
import {
  AI_DEFAULT_IMAGE_MODEL,
  AI_DEFAULT_TEXT_MODEL,
  AI_DEPRECATED_XAI_TEXT_MODELS,
  AI_GOOGLE_IMAGE_ASPECT_RATIOS_BY_MODEL,
  AI_GOOGLE_IMAGE_MODEL_ALIAS_BY_MODEL,
  AI_GOOGLE_IMAGE_SIZES_BY_MODEL,
  AI_IMAGE_MODELS,
  AI_IMAGE_MODEL_MAP,
  AI_IMAGE_REF_LIMIT_BY_PROVIDER,
  AI_OPENAI_FLEXIBLE_SIZE_IMAGE_MODELS,
  AI_OPENAI_IMAGE_MODEL_ALIAS_BY_MODEL,
  AI_TEXT_MODELS,
  AI_TEXT_MODEL_CAPABILITIES,
  AI_UPSTREAM_MODEL_ALIAS,
} from "./generated/modelCatalog.generated";
import type { AssertAssignable } from "./catalogShapeAssertion";


// ===== AI 타입 관련 =====
export const AI_MODALITY_TYPES = ["text", "audio", "image", "video"] as const;
export const AI_MESSAGE_BASE_TYPES = ["user", "assistant"] as const;
export const USER_SCOPE_TYPES = ["user", "universe"] as const;

// 채팅 시스템 코드 반환 타입 - mood-* 코드는 별도 규칙으로 처리(예: "mood-cheerful")
export const SYSTEM_CODES = ["positive", "negative", "good", "end-chat", "end-force", "request-image"] as const;

// ===== AI 프로바이더 관련 =====
export const UTILITY_PROVIDER_TYPES = ["photoroom", "pixian"] as const;
export const IMAGE_PROVIDER_TYPES = ["google", "openai", "xai", "zai"] as const;
export const VIDEO_PROVIDER_TYPES = ["google", "xai", "zai"] as const;
export const TEXT_PROVIDER_TYPES = [...IMAGE_PROVIDER_TYPES, "claude", "deepseek"] as const;
export const AI_PROVIDER_TYPES = [...TEXT_PROVIDER_TYPES, ...UTILITY_PROVIDER_TYPES] as const;

// OpenAI 이미지 모델 (2026-09-09 gpt-image-2.5 교체)
// - flare: 빠른 일상 생성. OpenAI 공식 기본 권장
// - sunburst: 편집 정밀도 우선. 지연시간이 길다
// - gpt-image-1-mini / gpt-image-1.5 / gpt-image-2는 deprecated
export const OPENAI_GPT_IMAGE_FLARE_MODEL = "gpt-image-2.5-flare";
export const OPENAI_GPT_IMAGE_SUNBURST_MODEL = "gpt-image-2.5-sunburst";

// 커스텀 해상도를 지원하는 OpenAI 이미지 모델
// - WIDTHxHEIGHT, 각 변은 16의 배수, 비율 1:3~3:1, 총 픽셀 655,360~8,294,400
//   https://developers.openai.com/api/docs/guides/image-generation (Size and quality options)
const _OPENAI_FLEXIBLE_SIZE_IMAGE_MODEL_SET = new Set<string>(
  AI_OPENAI_FLEXIBLE_SIZE_IMAGE_MODELS as readonly string[],
);

export function supportsOpenAIFlexibleImageSize(modelName?: string) {
  return _OPENAI_FLEXIBLE_SIZE_IMAGE_MODEL_SET.has(String(modelName || "").trim());
}

// quality를 보내지 않으면 auto가 되고, 2.5 계열은 auto에서 xhigh/max까지 선택할 수 있어
// 장당 출력 토큰이 예측 불가로 커진다. 고정 최소요금 + 토큰 초과분 hybrid 과금의 분산을 줄이기 위해
// 플랫폼 호출은 high로 고정한다.
export const OPENAI_IMAGE_QUALITY_LOCK = "high";

// alias 단일 키 정책 업스트림용 맵
// - "내부 표준명 -> 고정 버전명"을 강제 필요 시
export function resolveUpstreamModelName(provider: string, modelName: string) {
  const p = String(provider || "")
    .trim()
    .toLowerCase();
  const m = String(modelName || "").trim();
  const hit = (AI_UPSTREAM_MODEL_ALIAS as Record<string, Record<string, string>>)?.[p]?.[m];
  return hit ? String(hit) : m;
}

// 이미지 생성

export const IMAGE_TOOL_PROVIDERS = UTILITY_PROVIDER_TYPES; // 이미지 “툴” 전용 provider 분리

// TUTORS-193 D2 — audioInput/audioUnderstanding 축 신설.
// 단순 multimodal 표시나 STT 지원은 audioUnderstanding 증거가 아니다. 실호출 증거가
// 카탈로그(TUTORS-GATE-VOICE-MODEL.criteria[0])에 등록된 뒤에만 개별 모델을 true로 바꾼다.
// 2026-10-13 MU-20261013-gpt-audio-mini-BUILD: gpt-audio-mini가 카탈로그에서 제거됐고, speech_analysis 기본값은 gpt-audio-1.5다.
// 나머지 모델은 여전히 false이며, 플래그만 true로 바꿔도 증거가 없으면 열리지 않는다.
type TextModelAudioUnderstandingCapabilities = Record<
  string,
  { supportsAudioUnderstanding: boolean }
>;

export function supportsTextModelImageInput(modelName: string) {
  return Boolean((AI_TEXT_MODEL_CAPABILITIES as Record<string, { supportsImageInput: boolean }>)[modelName]?.supportsImageInput);
}

export function supportsTextModelAudioInput(modelName: string) {
  return Boolean(
    (AI_TEXT_MODEL_CAPABILITIES as Record<string, { supportsAudioInput: boolean }>)[modelName]?.supportsAudioInput,
  );
}

export function supportsTextModelAudioUnderstanding(
  modelName: string,
  capabilities: TextModelAudioUnderstandingCapabilities = AI_TEXT_MODEL_CAPABILITIES,
) {
  const flag = Boolean(
    capabilities[modelName]?.supportsAudioUnderstanding,
  );
  return flag && hasAudioUnderstandingEvidence(modelName);
}

export type TextModelGuide = {
  note: { ko: string; en: string };
};

export const TEXT_MODEL_GUIDE_BY_MODEL = {
  "claude-fable-5-1": {
    note: {
      ko: "장시간 에이전트 작업을 위한 Claude 최고 성능 모델(관리자 전용)",
      en: "Claude's highest-capability model for long-running agent work (admin only)",
    },
  },
  "claude-opus-5-5": {
    note: {
      ko: "복잡한 추론과 멀티모달 작업을 위한 Claude 최고 성능 모델",
      en: "Claude's highest-capability model for complex reasoning and multimodal work",
    },
  },
  "deepseek-v4-flash": {
    note: {
      ko: "대량 텍스트 작업을 위한 경제형 모델(이미지 입력 미지원)",
      en: "Efficient model for high-volume text tasks (no image input)",
    },
  },
  "deepseek-v4-pro": {
    note: {
      ko: "고난도 추론을 위한 DeepSeek 상위 텍스트 전용 모델(이미지 입력 미지원)",
      en: "Advanced text-only DeepSeek model for complex reasoning (no image input)",
    },
  },
  "grok-4.7": {
    note: {
      ko: "코딩·에이전트·지식 작업을 위한 xAI 최신 프론티어 모델",
      en: "Latest xAI frontier model for coding, agents, and knowledge work",
    },
  },
  "glm-5.3": {
    note: {
      ko: "Z.ai GLM 5.3 고성능 텍스트 모델(이미지 입력 미지원)",
      en: "Z.ai GLM 5.3 text model (image input unsupported)",
    },
  },
  "glm-5.3-flash": {
    note: {
      ko: "일반 대화와 이미지 입력을 지원하는 GLM 5.3 Flash",
      en: "GLM 5.3 Flash for everyday conversations with image input support",
    },
  },
} as const satisfies Partial<
  Record<(typeof AI_TEXT_MODELS)[number] | (typeof AI_DEPRECATED_XAI_TEXT_MODELS)[number], TextModelGuide>
>;

// UI/관리자에서 실제 노출되는 이미지 모델 목록
export function getImageModelsForAccess(): readonly string[] {
  return AI_IMAGE_MODELS;
}

type KnownImageModelName =
  | (typeof AI_IMAGE_MODEL_MAP.google)[number]
  | (typeof AI_IMAGE_MODEL_MAP.openai)[number]
  | (typeof AI_IMAGE_MODEL_MAP.xai)[number]
  | (typeof AI_IMAGE_MODEL_MAP.zai)[number];
// 신규 모델(가격표에만 추가된 케이스)도 컴파일 에러 없이 허용
export type ImageModelNameType = KnownImageModelName | (string & {});

// ===== AI 이미지 생성 관리 =====

// 이미지 생성 제한
export const AI_GEN_IMAGE_LIMIT = 4;
export const AI_GEN_CONTENT_LIMIT = 4;

// Aspect Ratio 화이트리스트
export const SUPPORTED_ASPECT_RATIOS = [
  "1:1",
  "1:2",
  "1:3",
  "1:4",
  "1:8",
  "2:1",
  "2:3",
  "3:2",
  "3:1",
  "3:4",
  "4:1",
  "4:3",
  "4:5",
  "5:4",
  "8:1",
  "9:16",
  "16:9",
  "21:9",
] as const;
export type SupportedAspectRatio = (typeof SUPPORTED_ASPECT_RATIOS)[number];
export const DEFAULT_IMAGE_ASPECT = "9:16" satisfies SupportedAspectRatio;

export const GOOGLE_IMAGE_SIZE_TYPES = ["512", "1K", "2K", "4K"] as const;
export type GoogleImageSizeType = (typeof GOOGLE_IMAGE_SIZE_TYPES)[number];

export function getImageModelAliasLabel(provider?: string, modelName?: string) {
  const prov = String(provider || "")
    .trim()
    .toLowerCase();
  const key = String(modelName || "").trim();
  if (prov === "google")
    return AI_GOOGLE_IMAGE_MODEL_ALIAS_BY_MODEL[key as keyof typeof AI_GOOGLE_IMAGE_MODEL_ALIAS_BY_MODEL] || "";
  if (prov === "openai")
    return AI_OPENAI_IMAGE_MODEL_ALIAS_BY_MODEL[key as keyof typeof AI_OPENAI_IMAGE_MODEL_ALIAS_BY_MODEL] || "";
  return "";
}

export function getSupportedGoogleAspectRatios(modelName?: string): readonly SupportedAspectRatio[] {
  const key = String(modelName || "").trim() as keyof typeof AI_GOOGLE_IMAGE_ASPECT_RATIOS_BY_MODEL;
  return (
    AI_GOOGLE_IMAGE_ASPECT_RATIOS_BY_MODEL[key] || AI_GOOGLE_IMAGE_ASPECT_RATIOS_BY_MODEL["gemini-3.1-flash-image-preview"]
  );
}

export function getSupportedGoogleImageSizes(modelName?: string): readonly GoogleImageSizeType[] {
  const key = String(modelName || "").trim() as keyof typeof AI_GOOGLE_IMAGE_SIZES_BY_MODEL;
  return AI_GOOGLE_IMAGE_SIZES_BY_MODEL[key] || AI_GOOGLE_IMAGE_SIZES_BY_MODEL["gemini-3.1-flash-image-preview"];
}

export function getDefaultGoogleImageSize(modelName?: string): GoogleImageSizeType {
  const supported = getSupportedGoogleImageSizes(modelName);
  if (supported.includes("1K")) return "1K";
  return supported[0] || "1K";
}

// OpenAI-compatible(Image) size 정책 (OpenAI / xAI 공통)
// - 다양한 aspectRatio를 받더라도 upstream에 안전한 size 3종으로만 내려보내기
export const OPENAI_COMPAT_UI_RATIOS = ["1:1", "9:16", "16:9"] as const;
export const OPENAI_COMPAT_IMAGE_SIZES = ["1024x1024", "1024x1536", "1536x1024", "auto"] as const;
export type OpenAICompatImageSize = (typeof OPENAI_COMPAT_IMAGE_SIZES)[number];

// 2.5 계열 커스텀 해상도 제약(16 배수 · 1:3~3:1 · 655,360~8,294,400px)을 모두 만족하는 조합만 둔다.
export const OPENAI_FLEXIBLE_IMAGE_ASPECT_RATIOS = [
  "1:3",
  "1:2",
  "9:16",
  "2:3",
  "3:4",
  "4:5",
  "1:1",
  "5:4",
  "4:3",
  "3:2",
  "16:9",
  "2:1",
  "21:9",
  "3:1",
] as const satisfies readonly SupportedAspectRatio[];

export const ASPECT_TO_OPENAI_FLEXIBLE_IMAGE_SIZE = {
  "1:3": "512x1536",
  "1:2": "768x1536",
  "9:16": "864x1536",
  "2:3": "1024x1536",
  "3:4": "1152x1536",
  "4:5": "1280x1600",
  "1:1": "1024x1024",
  "5:4": "1600x1280",
  "4:3": "1536x1152",
  "3:2": "1536x1024",
  "16:9": "1536x864",
  "2:1": "1536x768",
  "21:9": "1792x768",
  "3:1": "1536x512",
} as const satisfies Record<(typeof OPENAI_FLEXIBLE_IMAGE_ASPECT_RATIOS)[number], string>;

export function getSupportedOpenAIAspectRatios(modelName?: string): readonly SupportedAspectRatio[] {
  return supportsOpenAIFlexibleImageSize(modelName) ? OPENAI_FLEXIBLE_IMAGE_ASPECT_RATIOS : OPENAI_COMPAT_UI_RATIOS;
}

// aspectRatio -> size 매핑 (orientation 중심)
export const ASPECT_TO_OPENAI_COMPAT_SIZE: Record<SupportedAspectRatio, OpenAICompatImageSize> = {
  "1:1": "1024x1024",

  // portrait-ish
  "1:2": "1024x1536",
  "1:3": "1024x1536",
  "1:4": "1024x1536",
  "1:8": "1024x1536",
  "2:3": "1024x1536",
  "3:4": "1024x1536",
  "4:5": "1024x1536",
  "9:16": "1024x1536",

  // landscape-ish
  "2:1": "1536x1024",
  "3:2": "1536x1024",
  "3:1": "1536x1024",
  "4:1": "1536x1024",
  "4:3": "1536x1024",
  "5:4": "1536x1024",
  "8:1": "1536x1024",
  "16:9": "1536x1024",
  "21:9": "1536x1024",
} as const;
export const DEFAULT_IMAGE_SIZE = ASPECT_TO_OPENAI_COMPAT_SIZE[DEFAULT_IMAGE_ASPECT];

export function getOpenAIImageSizeForAspect(modelName: string | undefined, aspect: SupportedAspectRatio) {
  if (supportsOpenAIFlexibleImageSize(modelName)) {
    return (
      ASPECT_TO_OPENAI_FLEXIBLE_IMAGE_SIZE[aspect as keyof typeof ASPECT_TO_OPENAI_FLEXIBLE_IMAGE_SIZE] ||
      ASPECT_TO_OPENAI_COMPAT_SIZE[aspect]
    );
  }
  return ASPECT_TO_OPENAI_COMPAT_SIZE[aspect];
}

export type ModelRoleCanonicalShape = [
  AssertAssignable<typeof AI_DEFAULT_IMAGE_MODEL, "gemini-3.1-flash-image-preview">,
  AssertAssignable<typeof AI_DEFAULT_TEXT_MODEL, "glm-5.3-flash">,
  AssertAssignable<typeof AI_GOOGLE_IMAGE_ASPECT_RATIOS_BY_MODEL,
    Record<(typeof AI_IMAGE_MODEL_MAP.google)[number], readonly SupportedAspectRatio[]>
  >,
  AssertAssignable<typeof AI_GOOGLE_IMAGE_MODEL_ALIAS_BY_MODEL,
    Partial<Record<(typeof AI_IMAGE_MODEL_MAP.google)[number], string>>
  >,
  AssertAssignable<typeof AI_GOOGLE_IMAGE_SIZES_BY_MODEL,
    Record<(typeof AI_IMAGE_MODEL_MAP.google)[number], readonly GoogleImageSizeType[]>
  >,
  AssertAssignable<typeof AI_IMAGE_MODELS, readonly string[]>,
  AssertAssignable<typeof AI_IMAGE_REF_LIMIT_BY_PROVIDER,
    Record<(typeof IMAGE_PROVIDER_TYPES)[number], number>
  >,
  AssertAssignable<typeof AI_OPENAI_IMAGE_MODEL_ALIAS_BY_MODEL,
    Partial<Record<(typeof AI_IMAGE_MODEL_MAP.openai)[number], string>>
  >,
  AssertAssignable<typeof AI_TEXT_MODEL_CAPABILITIES,
    Record<
      (typeof AI_TEXT_MODELS)[number] | (typeof AI_DEPRECATED_XAI_TEXT_MODELS)[number],
      { supportsImageInput: boolean; supportsAudioInput: boolean; supportsAudioUnderstanding: boolean }
    >
  >,
  AssertAssignable<typeof AI_UPSTREAM_MODEL_ALIAS, Record<string, Record<string, string>>>,
];
