import { FIXED_COSTS } from "../payment/pricingRoles";
import { hasAudioUnderstandingEvidence } from "./audioUnderstandingEvidence";
import { isUnknownRecord } from "utils/common/typeUtils";

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
export const OPENAI_FLEXIBLE_SIZE_IMAGE_MODELS = [
  OPENAI_GPT_IMAGE_FLARE_MODEL,
  OPENAI_GPT_IMAGE_SUNBURST_MODEL,
] as const;
const _OPENAI_FLEXIBLE_SIZE_IMAGE_MODEL_SET = new Set<string>(
  OPENAI_FLEXIBLE_SIZE_IMAGE_MODELS as readonly string[],
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
export const _UPSTREAM_MODEL_ALIAS: Record<string, Record<string, string>> = {
  openai: {
    "gpt-5.6-sol": "gpt-5.6-sol",
    "gpt-5.6-terra": "gpt-5.6-terra",
    "gpt-5.6-luna": "gpt-5.6-luna",
  },
  claude: {
    "claude-haiku-4-5": "claude-haiku-4-5-20251001",
    "claude-sonnet-5": "claude-sonnet-5",
    "claude-opus-5": "claude-opus-5",
    "claude-fable-5": "claude-fable-5",
  },
  deepseek: {
    "deepseek-v4-flash": "deepseek-v4-flash",
    "deepseek-v4-pro": "deepseek-v4-pro",
  },
  xai: {},
  zai: {},
};

export function resolveUpstreamModelName(provider: string, modelName: string) {
  const p = String(provider || "")
    .trim()
    .toLowerCase();
  const m = String(modelName || "").trim();
  const hit = _UPSTREAM_MODEL_ALIAS?.[p]?.[m];
  return hit ? String(hit) : m;
}

// FIXED_COSTS(perImage) 기반 모델 자동 주입 (이미지 유틸 provider 제외)
// - Gen Studio 모델 셀렉터/서버 allowlist를 pricing과 동기화
// - perSecond(영상) 모델은 "이미지 모델" 셀렉터에 포함하지 않음
const _MODALITY_SUFFIX_SET = new Set<string>(AI_MODALITY_TYPES as readonly string[]);
const _IMAGE_PRICING_PROVIDER_SET = new Set<string>(IMAGE_PROVIDER_TYPES as readonly string[]);

// 참고 이미지 최대 개수(프로바이더별)
export const IMAGE_REF_LIMIT_BY_PROVIDER: Record<(typeof IMAGE_PROVIDER_TYPES)[number], number> = {
  google: 14, // Google native 이미지 생성 참고 이미지 상한
  openai: 16,
  xai: 3,
  zai: 0, // GLM Image는 baseImages/edit를 지원하지 않음
};

function _uniqStrings(list: readonly string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of list) {
    const s = String(v || "").trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function _extractFixedCostPerImageModels() {
  const out: Record<string, string[]> = { google: [], openai: [], xai: [], zai: [] };

  for (const [rawKey, cost] of Object.entries(FIXED_COSTS as Record<string, unknown>)) {
    // perImage만 포함
    if (!isUnknownRecord(cost)) continue;
    const perImage = cost.perImage;
    if (typeof perImage !== "number" || perImage <= 0) continue;

    const parts = String(rawKey)
      .split(":")
      .map((s) => s.trim())
      .filter(Boolean);

    const provider = String(parts[0] || "").toLowerCase();
    if ((UTILITY_PROVIDER_TYPES as readonly string[]).includes(provider)) continue;
    if (!_IMAGE_PRICING_PROVIDER_SET.has(provider)) continue;

    let rest = parts.slice(1);
    const last = rest[rest.length - 1];
    if (_MODALITY_SUFFIX_SET.has(last)) rest = rest.slice(0, -1);
    if (rest.length !== 1) continue;

    const modelName = rest.join(":").trim();
    if (!modelName) continue;

    out[provider].push(modelName);
  }

  return out as { google: string[]; openai: string[]; xai: string[]; zai: string[] };
}

const _fixedPerImage = _extractFixedCostPerImageModels();

// 텍스트
export const TEXT_MODEL_MAP = {
  google: ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.1-pro-preview", "gemini-3.5-flash-lite"],
  openai: [
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    "gpt-5.6-luna",
    // MB-20260928 ACTIVATE — approved GPT-6 models; gpt-6-luna is the provider default.
    "gpt-6-astra",
    "gpt-6-sol",
    "gpt-6-luna",
    // TUTORS-196 — 원음 이해(audio in → text out) 전용 후보. 실호출 증거는
    // AUDIO_UNDERSTANDING_EVIDENCE가 소유하고, 노출은 launchState admin_only로 닫혀 있다.
    "gpt-audio-mini",
  ],
  claude: [
    "claude-fable-5-1",
    "claude-fable-5",
    "claude-opus-5-5",
    "claude-opus-5",
    "claude-sonnet-5",
    "claude-haiku-4-5",
  ],
  deepseek: ["deepseek-v4-flash", "deepseek-v4-pro"],
  xai: ["grok-4.7"],
  zai: ["glm-5.3", "glm-5.3-flash"],
} as const;

/** xAI text models kept in the catalog for migration/history but no longer selectable. */
export const DEPRECATED_XAI_TEXT_MODELS = [
  "grok-4.6",
  "grok-4.3",
  "grok-4.20-0309-reasoning",
  "grok-build-0.1",
] as const;

/** Qwen policy rows shown in System Model Catalog only; they are not selectable provider-map entries. */
export const QWEN_TEXT_MODEL_CATALOG = ["qwen3.8-omni-flash"] as const;
export const QWEN_IMAGE_MODEL_CATALOG = ["qwen-image-3.0-pro"] as const;

// 이미지 생성
export const IMAGE_MODEL_MAP = {
  google: ["gemini-2.5-flash-image", "gemini-3.1-flash-image-preview", "gemini-3-pro-image-preview"] as const,
  openai: [OPENAI_GPT_IMAGE_FLARE_MODEL, OPENAI_GPT_IMAGE_SUNBURST_MODEL] as const,
  xai: ["grok-imagine-image-2.0", "grok-imagine-image"] as const,
  zai: ["glm-image"] as const,
} as const;

// 실행 job은 아직 구현하지 않고 System Model Catalog에서만 노출한다.
export const VIDEO_MODEL_MAP = {
  google: ["veo-3.1-generate-preview", "veo-3.1-fast-generate-preview", "veo-3.1-lite-generate-preview"] as const,
  xai: ["grok-imagine-video-1.5"] as const,
  zai: ["cogvideox-3"] as const,
} as const;

export const IMAGE_TOOL_PROVIDERS = UTILITY_PROVIDER_TYPES; // 이미지 “툴” 전용 provider 분리

// Gen Studio에서 "선택 가능한" 모델 목록
export const IMAGE_SELECTABLE_MODEL_MAP = {
  google: _uniqStrings([...IMAGE_MODEL_MAP.google, ..._fixedPerImage.google]),
  openai: _uniqStrings([...IMAGE_MODEL_MAP.openai, ..._fixedPerImage.openai]),
  xai: _uniqStrings([...IMAGE_MODEL_MAP.xai, ..._fixedPerImage.xai]),
  zai: _uniqStrings([...IMAGE_MODEL_MAP.zai, ..._fixedPerImage.zai]),
} as const;

// 기본 텍스트 모델 프로바이더
export const DEFAULT_TEXT_MODEL_BY_PROVIDER = {
  google: "gemini-3.8-flash",
  openai: "gpt-6-luna",
  claude: "claude-haiku-4-5",
  deepseek: "deepseek-v4-flash",
  qwen: "qwen3.8-omni-flash",
  xai: "grok-4.7",
  zai: "glm-5.3-flash",
} as const;

export const DEFAULT_VIDEO_MODEL_BY_PROVIDER = {
  google: "veo-3.1-fast-generate-preview",
  xai: "grok-imagine-video-1.5",
  zai: "cogvideox-3",
} as const;

export const TEXT_MODELS = [
  ...TEXT_MODEL_MAP.google,
  ...TEXT_MODEL_MAP.openai,
  ...TEXT_MODEL_MAP.claude,
  ...TEXT_MODEL_MAP.deepseek,
  ...TEXT_MODEL_MAP.xai,
  ...TEXT_MODEL_MAP.zai,
] as const;

// TUTORS-193 D2 — audioInput/audioUnderstanding 축 신설.
// 단순 multimodal 표시나 STT 지원은 audioUnderstanding 증거가 아니다. 실호출 증거가
// 카탈로그(TUTORS-GATE-VOICE-MODEL.criteria[0])에 등록된 뒤에만 개별 모델을 true로 바꾼다.
// 2026-09-15 TUTORS-196: gpt-audio-mini가 실호출 증거와 함께 처음 등록됐다.
// 나머지 모델은 여전히 false이며, 플래그만 true로 바꿔도 증거가 없으면 열리지 않는다.
export const TEXT_MODEL_CAPABILITIES = {
  "gemini-3.8-flash": { supportsImageInput: true, supportsAudioInput: false, supportsAudioUnderstanding: false },
  "gemini-3.6-flash": { supportsImageInput: true, supportsAudioInput: false, supportsAudioUnderstanding: false },
  "gemini-3.1-pro-preview": {
    supportsImageInput: true,
    supportsAudioInput: false,
    supportsAudioUnderstanding: false,
  },
  "gemini-3.5-flash-lite": {
    supportsImageInput: true,
    supportsAudioInput: false,
    supportsAudioUnderstanding: false,
  },
  "gpt-5.6-sol": { supportsImageInput: true, supportsAudioInput: false, supportsAudioUnderstanding: false },
  "gpt-5.6-terra": { supportsImageInput: true, supportsAudioInput: false, supportsAudioUnderstanding: false },
  "gpt-5.6-luna": { supportsImageInput: true, supportsAudioInput: false, supportsAudioUnderstanding: false },
  "gpt-6-astra": { supportsImageInput: true, supportsAudioInput: false, supportsAudioUnderstanding: false },
  "gpt-6-sol": { supportsImageInput: true, supportsAudioInput: false, supportsAudioUnderstanding: false },
  "gpt-6-luna": { supportsImageInput: true, supportsAudioInput: false, supportsAudioUnderstanding: false },
  // TUTORS-196 2026-09-15 실호출 검증 — /v1/chat/completions audio in → text out.
  // supportsAudioUnderstanding true는 AUDIO_UNDERSTANDING_EVIDENCE 항목과 AND 결합될 때만 유효하다.
  "gpt-audio-mini": { supportsImageInput: false, supportsAudioInput: true, supportsAudioUnderstanding: true },
  "claude-fable-5-1": { supportsImageInput: true, supportsAudioInput: false, supportsAudioUnderstanding: false },
  "claude-fable-5": { supportsImageInput: true, supportsAudioInput: false, supportsAudioUnderstanding: false },
  "claude-opus-5-5": { supportsImageInput: true, supportsAudioInput: false, supportsAudioUnderstanding: false },
  "claude-opus-5": { supportsImageInput: true, supportsAudioInput: false, supportsAudioUnderstanding: false },
  "claude-sonnet-5": { supportsImageInput: true, supportsAudioInput: false, supportsAudioUnderstanding: false },
  "claude-haiku-4-5": { supportsImageInput: true, supportsAudioInput: false, supportsAudioUnderstanding: false },
  "deepseek-v4-flash": { supportsImageInput: false, supportsAudioInput: false, supportsAudioUnderstanding: false },
  "deepseek-v4-pro": { supportsImageInput: false, supportsAudioInput: false, supportsAudioUnderstanding: false },
  "grok-4.7": { supportsImageInput: true, supportsAudioInput: false, supportsAudioUnderstanding: false },
  "grok-4.6": { supportsImageInput: true, supportsAudioInput: false, supportsAudioUnderstanding: false },
  "grok-4.3": { supportsImageInput: true, supportsAudioInput: false, supportsAudioUnderstanding: false },
  "grok-build-0.1": { supportsImageInput: false, supportsAudioInput: false, supportsAudioUnderstanding: false },
  "grok-4.20-0309-reasoning": {
    supportsImageInput: true,
    supportsAudioInput: false,
    supportsAudioUnderstanding: false,
  },
  "glm-5.3": { supportsImageInput: false, supportsAudioInput: false, supportsAudioUnderstanding: false },
  "glm-5.3-flash": { supportsImageInput: true, supportsAudioInput: false, supportsAudioUnderstanding: false },
} as const satisfies Record<
  (typeof TEXT_MODELS)[number] | (typeof DEPRECATED_XAI_TEXT_MODELS)[number],
  { supportsImageInput: boolean; supportsAudioInput: boolean; supportsAudioUnderstanding: boolean }
>;

type TextModelAudioUnderstandingCapabilities = Record<
  string,
  { supportsAudioUnderstanding: boolean }
>;

export function supportsTextModelImageInput(modelName: string) {
  return Boolean((TEXT_MODEL_CAPABILITIES as Record<string, { supportsImageInput: boolean }>)[modelName]?.supportsImageInput);
}

export function supportsTextModelAudioInput(modelName: string) {
  return Boolean(
    (TEXT_MODEL_CAPABILITIES as Record<string, { supportsAudioInput: boolean }>)[modelName]?.supportsAudioInput,
  );
}

export function supportsTextModelAudioUnderstanding(
  modelName: string,
  capabilities: TextModelAudioUnderstandingCapabilities = TEXT_MODEL_CAPABILITIES,
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
  "gpt-5.6-sol": {
    note: {
      ko: "복잡한 전문 작업을 위한 GPT-5.6 프론티어 모델",
      en: "GPT-5.6 frontier model for complex professional work",
    },
  },
  "gpt-5.6-terra": {
    note: {
      ko: "성능과 비용의 균형을 위한 GPT-5.6 기본 모델",
      en: "Default GPT-5.6 model balancing intelligence and cost",
    },
  },
  "gpt-5.6-luna": {
    note: {
      ko: "대량·비용 민감 작업을 위한 GPT-5.6 경제형 모델",
      en: "Efficient GPT-5.6 model for high-volume, cost-sensitive workloads",
    },
  },
  "claude-fable-5": {
    note: {
      ko: "장시간 에이전트 작업을 위한 최고 성능 모델(관리자 전용)",
      en: "Highest-capability model for long-running agents (admin only)",
    },
  },
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
  "claude-opus-5": {
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
  "grok-4.6": {
    note: {
      ko: "Grok 4.7 검증 전 유지하는 xAI 프론티어 모델",
      en: "xAI frontier model retained alongside Grok 4.7",
    },
  },
  "grok-build-0.1": {
    note: {
      ko: "코드 작성·수정 등의 개발 작업에 적합한 코딩 특화 모델",
      en: "Best for coding, debugging, and software development",
    },
  },
  "grok-4.20-0309-reasoning": {
    note: {
      ko: "복잡한 분석·계획·고난도 추론 작업에 적합한 프론티어 모델",
      en: "Best for complex analysis, planning, and advanced reasoning",
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
  Record<(typeof TEXT_MODELS)[number] | (typeof DEPRECATED_XAI_TEXT_MODELS)[number], TextModelGuide>
>;

export const DEFAULT_TEXT_MODEL = DEFAULT_TEXT_MODEL_BY_PROVIDER.zai;

export const DEFAULT_IMAGE_MODEL_BY_PROVIDER = {
  google: "gemini-3.1-flash-image-preview",
  openai: OPENAI_GPT_IMAGE_FLARE_MODEL,
  qwen: "qwen-image-3.0-pro",
  xai: "grok-imagine-image",
  zai: "glm-image",
} as const;

// UI/관리자에서 실제 노출되는 이미지 모델 목록
export const IMAGE_MODELS = _uniqStrings([
  ...IMAGE_SELECTABLE_MODEL_MAP.google,
  ...IMAGE_SELECTABLE_MODEL_MAP.openai,
  ...IMAGE_SELECTABLE_MODEL_MAP.xai,
  ...IMAGE_SELECTABLE_MODEL_MAP.zai,
]) as readonly string[];

export function getImageModelsForAccess() {
  return IMAGE_MODELS;
}

type KnownImageModelName =
  | (typeof IMAGE_MODEL_MAP.google)[number]
  | (typeof IMAGE_MODEL_MAP.openai)[number]
  | (typeof IMAGE_MODEL_MAP.xai)[number]
  | (typeof IMAGE_MODEL_MAP.zai)[number];
// 신규 모델(가격표에만 추가된 케이스)도 컴파일 에러 없이 허용
export type ImageModelNameType = KnownImageModelName | (string & {});
export const DEFAULT_IMAGE_MODEL = DEFAULT_IMAGE_MODEL_BY_PROVIDER.google;

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

const GOOGLE_IMAGE_BASE_RATIOS = [
  "1:1",
  "2:3",
  "3:2",
  "3:4",
  "4:3",
  "4:5",
  "5:4",
  "9:16",
  "16:9",
  "21:9",
] as const satisfies readonly SupportedAspectRatio[];

const GOOGLE_IMAGE_FLASH31_EXTRA_RATIOS = [
  "1:4",
  "1:8",
  "4:1",
  "8:1",
] as const satisfies readonly SupportedAspectRatio[];

export const GOOGLE_IMAGE_ASPECT_RATIOS_BY_MODEL = {
  "gemini-2.5-flash-image": GOOGLE_IMAGE_BASE_RATIOS,
  "gemini-3.1-flash-image-preview": [...GOOGLE_IMAGE_FLASH31_EXTRA_RATIOS, ...GOOGLE_IMAGE_BASE_RATIOS],
  "gemini-3-pro-image-preview": GOOGLE_IMAGE_BASE_RATIOS,
} as const satisfies Record<(typeof IMAGE_MODEL_MAP.google)[number], readonly SupportedAspectRatio[]>;

export const GOOGLE_IMAGE_SIZES_BY_MODEL = {
  "gemini-2.5-flash-image": ["1K"],
  "gemini-3.1-flash-image-preview": ["512", "1K", "2K", "4K"],
  "gemini-3-pro-image-preview": ["1K", "2K", "4K"],
} as const satisfies Record<(typeof IMAGE_MODEL_MAP.google)[number], readonly GoogleImageSizeType[]>;

export const GOOGLE_IMAGE_MODEL_ALIAS_BY_MODEL = {
  "gemini-2.5-flash-image": "Nano Banana",
  "gemini-3.1-flash-image-preview": "Nano Banana 2",
  "gemini-3-pro-image-preview": "Nano Banana Pro",
} as const satisfies Partial<Record<(typeof IMAGE_MODEL_MAP.google)[number], string>>;

export const OPENAI_IMAGE_MODEL_ALIAS_BY_MODEL = {
  [OPENAI_GPT_IMAGE_FLARE_MODEL]: "Flare",
  [OPENAI_GPT_IMAGE_SUNBURST_MODEL]: "Sunburst",
} as const satisfies Partial<Record<(typeof IMAGE_MODEL_MAP.openai)[number], string>>;

export function getImageModelAliasLabel(provider?: string, modelName?: string) {
  const prov = String(provider || "")
    .trim()
    .toLowerCase();
  const key = String(modelName || "").trim();
  if (prov === "google")
    return GOOGLE_IMAGE_MODEL_ALIAS_BY_MODEL[key as keyof typeof GOOGLE_IMAGE_MODEL_ALIAS_BY_MODEL] || "";
  if (prov === "openai")
    return OPENAI_IMAGE_MODEL_ALIAS_BY_MODEL[key as keyof typeof OPENAI_IMAGE_MODEL_ALIAS_BY_MODEL] || "";
  return "";
}

export function getSupportedGoogleAspectRatios(modelName?: string): readonly SupportedAspectRatio[] {
  const key = String(modelName || "").trim() as keyof typeof GOOGLE_IMAGE_ASPECT_RATIOS_BY_MODEL;
  return (
    GOOGLE_IMAGE_ASPECT_RATIOS_BY_MODEL[key] || GOOGLE_IMAGE_ASPECT_RATIOS_BY_MODEL["gemini-3.1-flash-image-preview"]
  );
}

export function getSupportedGoogleImageSizes(modelName?: string): readonly GoogleImageSizeType[] {
  const key = String(modelName || "").trim() as keyof typeof GOOGLE_IMAGE_SIZES_BY_MODEL;
  return GOOGLE_IMAGE_SIZES_BY_MODEL[key] || GOOGLE_IMAGE_SIZES_BY_MODEL["gemini-3.1-flash-image-preview"];
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
