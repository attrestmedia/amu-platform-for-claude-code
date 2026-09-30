import type { AiProviderType, TextProviderType, ImageProviderType } from "types/ai";
import {
  TEXT_PROVIDER_TYPES,
  IMAGE_PROVIDER_TYPES,
  AI_PROVIDER_TYPES,
  IMAGE_MODEL_MAP,
  TEXT_MODEL_MAP,
} from "consts/ai";

/**
 * @docHint
 * @purpose providerHelper 유틸 기능 제공
 * @process 입력 정규화  변환  보조 처리 제공
 * @domain ai
 * @scope shared
 */

export function isTextProvider(v: unknown): v is TextProviderType {
  return inConstArray(TEXT_PROVIDER_TYPES as readonly TextProviderType[], v);
}

export function isImageProvider(v: unknown): v is ImageProviderType {
  return inConstArray(IMAGE_PROVIDER_TYPES as readonly ImageProviderType[], v);
}

export function normalizeAiProvider(raw: unknown): AiProviderType | "" {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return inConstArray(AI_PROVIDER_TYPES as readonly AiProviderType[], s) ? s : "";
}

export function normalizeTextProvider(raw: unknown): TextProviderType | "" {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return isTextProvider(s) ? s : "";
}

export function normalizeImageProvider(raw: unknown): ImageProviderType | "" {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return isImageProvider(s) ? s : "";
}

// 모델 세대 변경 대비를 위한 판별 규칙 통일
export function isGoogleProTextModel(modelName?: string) {
  const m = String(modelName || "")
    .trim()
    .toLowerCase();
  return m.startsWith("gemini-3.1-pro");
}

export function isXaiLongContextTieredTextModel(modelName?: string) {
  const model = String(modelName || "")
    .trim()
    .toLowerCase();
  return model === "grok-4.7" || model === "grok-4.6";
}

export function isOpenAIGpt6TextModel(modelName?: string) {
  return /^gpt-6-(?:astra|sol|luna)$/.test(
    String(modelName || "")
      .trim()
      .toLowerCase(),
  );
}

/** GPT-6 장문 요율은 입력이 272K를 초과할 때 적용된다. */
export function pickOpenAIGpt6PricingVariantByInputTokens(inputTokens: number) {
  return Number(inputTokens) > 272_000 ? "long" : "short";
}

export function pickXaiPricingVariantByInputTokens(inputTokens: number) {
  return Number(inputTokens) >= 200_000 ? "long" : "short";
}

export function hasValidXaiInputTokenCount(modelName: string | undefined, inputTokens: unknown) {
  if (!isXaiLongContextTieredTextModel(modelName)) return true;
  return typeof inputTokens === "number" && Number.isSafeInteger(inputTokens) && inputTokens > 0;
}

// GPT-5.6·GPT-6 Chat Completions 후보는 custom temperature를 쓰지 않는다.
export function supportsCustomOpenAITemperature(modelName?: string) {
  const m = String(modelName || "")
    .trim()
    .toLowerCase();
  return !m.startsWith("gpt-5.6") && !isOpenAIGpt6TextModel(m);
}

// Claude 5 계열은 adaptive thinking이 기본이며 커스텀 sampling 파라미터를 거부한다.
const ANTHROPIC_ADAPTIVE_THINKING_PATTERN = /^claude-(?:fable|opus|sonnet)-5(?:$|-)/;
const ANTHROPIC_ALWAYS_ON_THINKING_MODELS = new Set(["claude-opus-5-5", "claude-fable-5-1"]);

// adaptive thinking이 기본으로 켜진 모델. max_tokens가 작으면 thinking이 예산을 전부 소진해
// text 블록이 없는 응답이 온다. thinking 토글 판단은 이 함수 하나로만 한다.
export function isAnthropicAdaptiveThinkingModel(modelName?: string) {
  return ANTHROPIC_ADAPTIVE_THINKING_PATTERN.test(
    String(modelName || "")
      .trim()
      .toLowerCase(),
  );
}

export function supportsCustomAnthropicTemperature(modelName?: string) {
  return !isAnthropicAdaptiveThinkingModel(modelName);
}

// 긴 콘텐츠 템플릿(조건 블록 다수 + 항목 반복 출력)이 요구하는 출력 예산.
// Anthropic만 max_tokens가 필수라 예산 미지정 시의 기본값으로도 쓴다.
export const TEXT_LONG_OUTPUT_BUDGET_TOKENS = 16_384;
// thinking과 본문을 한 예산에 함께 담기 어려운 하한
const ANTHROPIC_THINKING_MIN_MAX_TOKENS = 16_000;
const REASONING_TEXT_OUTPUT_MIN_TOKENS = 8_192;
const REASONING_TEXT_TIMEOUT_MIN_MS = 150_000;
const TEXT_TIMEOUT_MS_PER_1K_TOKENS = 20_000;
const TEXT_UPSTREAM_TIMEOUT_MIN_MS = 60_000;
const TEXT_UPSTREAM_TIMEOUT_MAX_MS = 300_000;

function toPositiveTokenBudget(maxOutputTokens?: number) {
  return typeof maxOutputTokens === "number" && Number.isFinite(maxOutputTokens) && maxOutputTokens > 0
    ? Math.floor(maxOutputTokens)
    : 0;
}

// Anthropic 요청의 max_tokens. 지정이 없을 때 작은 값을 쓰면 adaptive thinking이 예산을
// 전부 소진해 text 블록이 없는 200 응답이 온다.
export function resolveAnthropicMaxTokens(maxOutputTokens?: number) {
  return toPositiveTokenBudget(maxOutputTokens) || TEXT_LONG_OUTPUT_BUDGET_TOKENS;
}

function isAnthropicAlwaysOnThinkingModel(modelName?: string) {
  return ANTHROPIC_ALWAYS_ON_THINKING_MODELS.has(
    String(modelName || "")
      .trim()
      .toLowerCase(),
  );
}

// Grok 4.7/4.6은 기존 tier 판정을 재사용하고, reasoning 접미사가 붙은 xAI 모델도 포함한다.
export function isXaiReasoningTextModel(modelName?: string) {
  const model = String(modelName || "")
    .trim()
    .toLowerCase();
  return isXaiLongContextTieredTextModel(model) || /(?:^|-)reasoning(?:-|$)/.test(model);
}

function resolveReasoningTextOutputFloor(provider: TextProviderType, modelName: string) {
  if (provider === "openai" && isOpenAIGpt6TextModel(modelName)) return REASONING_TEXT_OUTPUT_MIN_TOKENS;
  if (provider === "google" && !supportsGeminiThinkingBudget(modelName)) return REASONING_TEXT_OUTPUT_MIN_TOKENS;
  if (provider === "xai" && isXaiReasoningTextModel(modelName)) return REASONING_TEXT_OUTPUT_MIN_TOKENS;
  if (provider === "claude" && isAnthropicAlwaysOnThinkingModel(modelName)) {
    return ANTHROPIC_THINKING_MIN_MAX_TOKENS;
  }
  return 0;
}

// Reasoning/thinking 토큰이 본문 예산을 모두 소진하지 않도록 모델 capability별 최소 예산을 적용한다.
// 일반 모델은 요청값을 그대로 반환하고, Anthropic 미지정 값은 기존 기본 예산을 보존한다.
export function resolveTextOutputBudget(
  provider: TextProviderType,
  modelName: string,
  maxOutputTokens?: number,
) {
  const requested =
    typeof maxOutputTokens === "number" && Number.isFinite(maxOutputTokens) && maxOutputTokens > 0
      ? maxOutputTokens
      : undefined;
  const floor = resolveReasoningTextOutputFloor(provider, modelName);
  if (!floor) return typeof maxOutputTokens === "number" ? maxOutputTokens : undefined;
  if (provider === "claude" && requested === undefined) return TEXT_LONG_OUTPUT_BUDGET_TOKENS;
  return Math.max(requested || 0, floor);
}

// 예산이 thinking을 담기에 부족하면 모델 종류와 무관하게 thinking을 끄고 전량을 본문에 쓴다.
export function shouldDisableAnthropicThinking(modelName: string, maxTokens: number) {
  const normalizedModel = String(modelName || "").trim().toLowerCase();
  return (
    isAnthropicAdaptiveThinkingModel(normalizedModel) &&
    !ANTHROPIC_ALWAYS_ON_THINKING_MODELS.has(normalizedModel) &&
    maxTokens < ANTHROPIC_THINKING_MIN_MAX_TOKENS
  );
}

// 비스트리밍 텍스트 응답은 생성이 전부 끝난 뒤에야 반환된다. 출력 예산에 비례해 상한을 늘리고,
// reasoning/thinking 모델에는 별도 150초 하한을 둔다. 전체 timeout은 guard TTL 300초 안에 둔다.
export function resolveTextUpstreamTimeoutMs(
  maxOutputTokens?: number,
  provider?: TextProviderType,
  modelName?: string,
) {
  const budget = toPositiveTokenBudget(maxOutputTokens) || TEXT_LONG_OUTPUT_BUDGET_TOKENS;
  const scaled = Math.ceil(budget / 1_000) * TEXT_TIMEOUT_MS_PER_1K_TOKENS;
  const modelFloor = provider && modelName ? resolveReasoningTextOutputFloor(provider, modelName) : 0;
  const timeoutFloor = modelFloor > 0 ? REASONING_TEXT_TIMEOUT_MIN_MS : TEXT_UPSTREAM_TIMEOUT_MIN_MS;
  return Math.min(TEXT_UPSTREAM_TIMEOUT_MAX_MS, Math.max(timeoutFloor, scaled));
}

// Gemini 3.8/3.6 Flash와 3.5 Flash-Lite는 sampling 파라미터를 받지 않는다.
export function supportsCustomGeminiTemperature(modelName?: string) {
  const m = String(modelName || "")
    .trim()
    .toLowerCase();
  return m !== "gemini-3.8-flash" && m !== "gemini-3.6-flash" && m !== "gemini-3.5-flash-lite";
}

export function supportsGeminiThinkingBudget(modelName?: string) {
  const m = String(modelName || "")
    .trim()
    .toLowerCase();
  return m !== "gemini-3.8-flash";
}

// modelName이 allowlist에 있으면 provider를 반환
export function inferImageProviderFromModelNameRaw(modelName?: string): ImageProviderType | "" {
  const m = String(modelName || "").trim();
  const imageModelMap = IMAGE_MODEL_MAP as Partial<Record<ImageProviderType, readonly string[]>>;

  if (!m) return "";
  if (imageModelMap.openai?.includes(m)) return "openai";
  if (imageModelMap.xai?.includes(m)) return "xai";
  if (imageModelMap.google?.includes(m)) return "google";
  if (imageModelMap.zai?.includes(m)) return "zai";
  return "";
}

export function inferTextProviderFromModelNameRaw(modelName?: string): TextProviderType | "" {
  const m = String(modelName || "").trim();
  const textModelMap = TEXT_MODEL_MAP as Partial<Record<TextProviderType, readonly string[]>>;

  if (!m) return "";
  if (textModelMap.openai?.includes(m)) return "openai";
  if (textModelMap.claude?.includes(m)) return "claude";
  if (textModelMap.deepseek?.includes(m)) return "deepseek";
  if (textModelMap.xai?.includes(m)) return "xai";
  if (textModelMap.google?.includes(m)) return "google";
  if (textModelMap.zai?.includes(m)) return "zai";
  return "";
}

// 튜플 타입 가드
export function inConstArray<const T extends readonly string[]>(arr: T, value: unknown): value is T[number] {
  return typeof value === "string" && (arr as readonly string[]).includes(value);
}
