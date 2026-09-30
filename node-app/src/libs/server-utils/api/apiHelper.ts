import "server-only";
import { GoogleGenAI, Modality } from "@google/genai";
import type { AiProviderType, ImageProviderType, TextProviderType } from "types/ai";
import type { BaseImageType } from "types/app";
import {
  AI_GEN_IMAGE_LIMIT,
  AI_GEN_CONTENT_LIMIT,
  OPENAI_IMAGE_QUALITY_LOCK,
} from "consts/ai";
import { resolveUpstreamModelName } from "consts/ai/modelRole";
import { resolveImageBillingModelName } from "utils/ai/imageBillingPolicy";
import {
  isTextProvider,
  isImageProvider,
  supportsCustomGeminiTemperature,
  supportsGeminiThinkingBudget,
  hasValidXaiInputTokenCount,
  isOpenAIGpt6TextModel,
  resolveAnthropicMaxTokens,
  resolveTextOutputBudget,
  resolveTextUpstreamTimeoutMs,
  shouldDisableAnthropicThinking,
  supportsCustomAnthropicTemperature,
  supportsCustomOpenAITemperature,
} from "utils/ai/providerHelper";
import { validateBase64Image } from "libs/server-utils/file/fileStorage";
import { resolveImageGenOptions } from "utils/ai/imageOptions";
import {
  assertSystemModelSupportsImageInputOrThrow,
  resolveSystemModelNameOrThrow,
  resolveSystemReasoningEffort,
} from "libs/server-utils/api/systemModelControl";
import { resolveSystemModelAccessActor } from "libs/server-utils/ai/systemModelAccess";
import { toUnknownRecord } from "utils/common/typeUtils";
import {
  OPENAI_BASE_URL,
  ANTHROPIC_BASE_URL,
  DEEPSEEK_BASE_URL,
  ZAI_BASE_URL,
  XAI_BASE_URL,
} from "consts/env/server";
import { logger } from "utils/log";
import { resolvePlatformCredential } from "libs/server-utils/secure/platformCredentialResolver";
import { getPlatformQwenOpenAIClient } from "libs/server-utils/secure/platformAiClients";
import {
  assertQwenProviderCallReady,
  buildQwenImageGenerationRequest,
  qwenOmniChat,
  QWEN_IMAGE_MODEL,
  QWEN_OMNI_MODEL,
} from "libs/server-utils/audio/providers/qwenSpeech";

/**
 * @docHint
 * @purpose 서버 유틸/핸들러 핵심 처리
 * @process resolveImageModelNameFor 중심 처리  입력 검증  핵심 로직  결과 포맷팅  프롬프트 렌더링/정책 적용 포함  이미지 파이프라인 호출 포함  대화 저장/후처리 포함
 * @domain ai-provider
 * @scope global
 */

type CodedError = Error & { errorCode?: string; status?: number };
type UsageTotal = {
  input?: number;
  output?: number;
  text?: { input: number; output: number };
  image?: { input: number; output: number };
  providerUsage?: Record<string, unknown>;
};
type GoogleInlinePart = { text?: unknown; inlineData?: { data?: unknown; mimeType?: unknown } };
type GoogleCandidate = { finishReason?: unknown; content?: { parts?: GoogleInlinePart[] } };
type GoogleResponseShape = {
  text?: unknown;
  candidates?: GoogleCandidate[];
  promptFeedback?: { blockReason?: unknown } | null;
  usageMetadata?: Record<string, unknown>;
  response?: {
    text?: () => string;
    candidates?: GoogleCandidate[];
    promptFeedback?: { blockReason?: unknown } | null;
    usageMetadata?: Record<string, unknown>;
  };
};
type TextGenerationOptions = {
  n?: number;
  temperature?: number;
  maxOutputTokens?: number;
  thinkingBudget?: number;
  responseMimeType?: "text/plain" | "application/json";
  baseImages?: BaseImageType[];
  /** Trusted server actor only; never populated from request payload options. */
  actorUser?: unknown;
};

function codedError(message: string, errorCode: string, status = 500): CodedError {
  return Object.assign(new Error(message), { errorCode, status });
}

function parseOpenAIGpt6TextUsage(usage: Record<string, unknown>) {
  const promptTokens = usage.prompt_tokens;
  const completionTokens = usage.completion_tokens;
  const totalTokens = usage.total_tokens;
  const promptDetails = toUnknownRecord(usage.prompt_tokens_details);
  const completionDetails = toUnknownRecord(usage.completion_tokens_details);
  const optionalCount = (record: Record<string, unknown>, key: string) => {
    const value = record[key];
    if (value === undefined || value === null) return undefined;
    return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null;
  };
  const promptCounts = {
    cachedTokens: optionalCount(promptDetails, "cached_tokens"),
    audioTokens: optionalCount(promptDetails, "audio_tokens"),
    cacheWriteTokens: optionalCount(promptDetails, "cache_write_tokens"),
  };
  const completionCounts = {
    reasoningTokens: optionalCount(completionDetails, "reasoning_tokens"),
    audioTokens: optionalCount(completionDetails, "audio_tokens"),
    acceptedPredictionTokens: optionalCount(completionDetails, "accepted_prediction_tokens"),
    rejectedPredictionTokens: optionalCount(completionDetails, "rejected_prediction_tokens"),
  };
  if (
    !Number.isSafeInteger(promptTokens) ||
    !Number.isSafeInteger(completionTokens) ||
    !Number.isSafeInteger(totalTokens) ||
    Number(promptTokens) <= 0 ||
    Number(completionTokens) <= 0 ||
    Number(totalTokens) !== Number(promptTokens) + Number(completionTokens) ||
    [...Object.values(promptCounts), ...Object.values(completionCounts)].includes(null) ||
    (typeof promptCounts.cachedTokens === "number" && promptCounts.cachedTokens > Number(promptTokens)) ||
    (typeof promptCounts.audioTokens === "number" && promptCounts.audioTokens > Number(promptTokens)) ||
    Object.values(completionCounts).some((count) => typeof count === "number" && count > Number(completionTokens))
  ) {
    throw codedError("openai_gpt6_usage_unavailable", "OPENAI_USAGE_UNAVAILABLE", 502);
  }
  return {
    contract: "openai.chat.completions.gpt6.v1",
    promptTokens: Number(promptTokens),
    completionTokens: Number(completionTokens),
    totalTokens: Number(totalTokens),
    promptTokensDetails: promptCounts,
    completionTokensDetails: completionCounts,
  };
}

function toErrorMessage(e: unknown) {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

function mapOpenAISafetyMessage(raw: string) {
  const msg = String(raw || "");
  if (!/safety_violations=/i.test(msg)) return msg;

  const reqId = (msg.match(/req_[a-zA-Z0-9]+/) || [""])[0];
  const violation = (msg.match(/safety_violations=\[([^\]]+)\]/i) || ["", "policy"])[1];

  return [
    "요청한 이미지가 안전 정책에 의해 차단되었습니다.",
    `감지된 분류: ${violation}`,
    "노출/신체 강조 표현을 완화하고, 장면/의상/구도를 더 중립적으로 수정한 뒤 다시 시도해주세요.",
    reqId ? `문제가 반복되면 요청 ID(${reqId})를 함께 전달해주세요.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function normalizeTextReferenceImages(baseImages?: BaseImageType[]) {
  return Array.isArray(baseImages)
    ? baseImages
        .filter((image) => Boolean(image?.data))
        .map((image) => ({
          mimeType: String(image.mimeType || "image/png").trim() || "image/png",
          data: String(image.data || "").trim(),
        }))
    : [];
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isFulfilled<T>(result: PromiseSettledResult<T>): result is PromiseFulfilledResult<T> {
  return result.status === "fulfilled";
}

function shouldRequestOpenAIImageResponseFormat(modelName: string) {
  // gpt-image 계열은 response_format을 받지 않고 항상 b64_json을 반환한다.
  return !/^gpt-image-/i.test(String(modelName || "").trim());
}

function isXAITemporaryUnavailableError(e: unknown) {
  const error = toUnknownRecord(e);
  const msg = String(error.message || "");
  const status = Number(error.status || 0);
  return (
    status === 503 ||
    /service is currently unavailable/i.test(msg) ||
    /model is temporarily unavailable/i.test(msg) ||
    /temporarily unavailable/i.test(msg)
  );
}

const _imageModelResolveCache = new Map<string, string>();
const _IMAGE_MODEL_CACHE_MAX = 200;
function _imageModelResolveCacheSet(k: string, v: string) {
  if (_imageModelResolveCache.size >= _IMAGE_MODEL_CACHE_MAX) _imageModelResolveCache.clear();
  _imageModelResolveCache.set(k, v);
}

// Google SDK 클라이언트 캐싱
let _googleKey = "";
let _googleClient: GoogleGenAI | null = null;
let _googleTimeoutMs: number | null = null;

async function getGoogleClientOrThrow(timeoutMs?: number) {
  const credential = await resolvePlatformCredential("ai.google.gemini");
  const timeoutKey = typeof timeoutMs === "number" ? timeoutMs : null;
  if (_googleClient && _googleKey === String(credential.version) && _googleTimeoutMs === timeoutKey) return _googleClient;
  _googleKey = String(credential.version);
  _googleTimeoutMs = timeoutKey;
  _googleClient = new GoogleGenAI({
    apiKey: credential.payload.apiKey,
    ...(timeoutKey ? { httpOptions: { timeout: timeoutKey } } : {}),
  });
  return _googleClient;
}

function getGoogleResponseParts(res: unknown): GoogleInlinePart[] {
  const response = res as GoogleResponseShape;
  return response?.candidates?.[0]?.content?.parts || response?.response?.candidates?.[0]?.content?.parts || [];
}

function getGooglePromptFeedback(res: unknown) {
  const response = res as GoogleResponseShape;
  return response?.promptFeedback || response?.response?.promptFeedback || null;
}

function getGoogleCandidates(res: unknown): GoogleCandidate[] {
  const response = res as GoogleResponseShape;
  return response?.candidates || response?.response?.candidates || [];
}

function getGoogleUsageMetadata(res: unknown): Record<string, unknown> {
  const response = res as GoogleResponseShape;
  return response?.usageMetadata || response?.response?.usageMetadata || {};
}

function getGoogleText(res: unknown) {
  const response = res as GoogleResponseShape;
  const textValue = typeof response?.text === "string" ? response.text : "";
  return textValue || response?.response?.text?.() || response?.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

// 요청 유효성 검사 함수
export const validateRequest = (data: Record<string, unknown>) => {
  const body = toUnknownRecord(data);

  if (!body.universeId || typeof body.universeId !== "string") {
    return { valid: false, error: "universeId가 필요합니다." };
  }

  if (!body.message || typeof body.message !== "string") {
    return { valid: false, error: "유효하지 않은 메시지 형식입니다." };
  }

  if (!body.npcId) {
    return { valid: false, error: "NPC ID가 필요합니다." };
  }

  return { valid: true };
};

// 이미지 생성 모델명 검증
export async function resolveImageModelNameFor(provider: ImageProviderType, input?: string, user?: unknown) {
  const p = String(provider || "")
    .trim()
    .toLowerCase();
  if (p === "qwen") {
    await assertQwenProviderCallReady({
      modelName: String(input || QWEN_IMAGE_MODEL).trim(),
      modality: "image",
      user,
    });
  }
  if (!isImageProvider(p)) {
    throw codedError("unsupported_provider", "UNSUPPORTED_PROVIDER", 400);
  }

  const prov = p as ImageProviderType;
  const raw = (input || "").trim();
  const accessScope = resolveSystemModelAccessActor(user).isAdministrator ? "admin" : "member";
  const cacheKey = `${prov}:${raw || "__default__"}:${accessScope}`;

  const cached = _imageModelResolveCache.get(cacheKey);
  if (cached) return cached;

  const candidate = await resolveSystemModelNameOrThrow({
    provider: prov,
    modelName: raw || undefined,
    modality: "image",
    actor: { user },
  });

  _imageModelResolveCacheSet(cacheKey, candidate);
  return candidate;
}

// Text model allowlist resolver
const _textModelResolveCache = new Map<string, string>();
const _TEXT_MODEL_CACHE_MAX = 400;
function _textModelResolveCacheSet(k: string, v: string) {
  if (_textModelResolveCache.size >= _TEXT_MODEL_CACHE_MAX) _textModelResolveCache.clear();
  _textModelResolveCache.set(k, v);
}

export async function resolveTextModelNameFor(provider: AiProviderType, input?: string, actorUser?: unknown) {
  const p = String(provider || "")
    .trim()
    .toLowerCase();
  if (!isTextProvider(p)) throw codedError("unsupported_provider", "UNSUPPORTED_PROVIDER", 400);
  const prov = p as TextProviderType;

  const raw = String(input || "").trim();
  const accessScope = resolveSystemModelAccessActor(actorUser).isAdministrator ? "admin" : "member";
  const cacheKey = `${prov}:${raw || "__default__"}:${accessScope}`;
  const cached = _textModelResolveCache.get(cacheKey);
  if (cached) return cached;

  const candidate = await resolveSystemModelNameOrThrow({
    provider: prov,
    modelName: raw || undefined,
    modality: "text",
    actor: { user: actorUser },
  });

  _textModelResolveCacheSet(cacheKey, candidate);
  return candidate;
}

const DEFAULT_UPSTREAM_TIMEOUT_MS = 60_000;
const OPENAI_IMAGE_UPSTREAM_TIMEOUT_MS = 150_000;

async function fetchJsonOrThrow(
  url: string,
  init: RequestInit,
  errCode: string,
  timeoutMs = DEFAULT_UPSTREAM_TIMEOUT_MS,
) {
  const ctrl = new AbortController();
  const safeTimeoutMs = Math.max(1_000, Number(timeoutMs || DEFAULT_UPSTREAM_TIMEOUT_MS));
  const t = setTimeout(() => ctrl.abort(), safeTimeoutMs);

  let res: Response;
  let txt = "";

  try {
    res = await fetch(url, { ...init, signal: ctrl.signal });
    txt = await res.text().catch(() => "");
  } catch (e: unknown) {
    clearTimeout(t);
    if (toUnknownRecord(e).name === "AbortError") throw codedError("upstream_timeout", errCode, 504);
    throw codedError(toErrorMessage(e), errCode, 502);
  } finally {
    clearTimeout(t);
  }

  let json: Record<string, unknown> = {};
  try {
    json = toUnknownRecord(txt ? JSON.parse(txt) : {});
  } catch {
    json = {};
  }

  if (!res.ok) {
    const error = toUnknownRecord(json.error);
    const rawMsg = String(error.message || json.message || txt || `upstream_failed(${res.status})`);
    const msg = errCode === "OPENAI_UPSTREAM_ERROR" ? mapOpenAISafetyMessage(rawMsg) : rawMsg;
    const mappedStatus = res.status >= 400 && res.status < 500 ? res.status : 502; // upstream 4xx/429는 그대로 내려줌
    if (errCode === "OPENAI_UPSTREAM_ERROR" && msg !== rawMsg) {
      throw codedError(msg, "OPENAI_SAFETY_REJECTED", 400);
    }
    throw codedError(msg, errCode, mappedStatus);
  }
  return json;
}

// b64 URL 기반 응답 체크
async function fetchImageUrlAsBase64(url: string) {
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) throw new Error(`image_fetch_failed(${res.status})`);
  const ab = await res.arrayBuffer();
  if (!ab.byteLength) throw new Error("empty_image_binary");
  return Buffer.from(ab).toString("base64");
}

// 서버에서 이미지를 fetch하여 base64로 변환
async function extractImageBase64s(json: unknown, model: string, errCode: string) {
  const data = Array.isArray(toUnknownRecord(json).data) ? (toUnknownRecord(json).data as unknown[]) : [];

  // 1) OpenAI-style base64 payload
  const b64s = data
    .map((d) => {
      const item = toUnknownRecord(d);
      return item.b64_json ?? item.image_base64 ?? item.base64;
    })
    .filter(Boolean)
    .map((s) => String(s));
  if (b64s.length) return b64s;

  // 2) URL payload fallback (xAI 등)
  const urls = data
    .map((d) => {
      const item = toUnknownRecord(d);
      return item.url ?? item.image_url ?? item.output_url;
    })
    .filter((u): u is string => typeof u === "string" && /^https?:\/\//i.test(u))
    .map((u: string) => u.trim())
    .filter(Boolean);

  if (!urls.length) {
    const firstKeys = Object.keys(toUnknownRecord(data[0])).join(",") || "none";
    logger.warn(`[${errCode}] empty_image_response model=${model} firstKeys=${firstKeys}`);
    return [];
  }

  const fetched = await Promise.allSettled(urls.map((u) => fetchImageUrlAsBase64(u)));
  const fromUrls = fetched
    .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled")
    .map((r) => r.value)
    .filter(Boolean);

  if (!fromUrls.length) {
    logger.warn(`[${errCode}] image_url_fetch_failed model=${model} urlCount=${urls.length}`);
  }

  return fromUrls;
}

function toPositiveNumber(value: unknown) {
  const n = Number(value || 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function normalizeOpenAIImageUsage(json: unknown): UsageTotal | undefined {
  const usage = toUnknownRecord(toUnknownRecord(json).usage);
  const inputDetails = toUnknownRecord(usage.input_tokens_details || usage.input_tokens_detail || usage.input_details);
  const outputDetails = toUnknownRecord(
    usage.output_tokens_details || usage.output_tokens_detail || usage.output_details,
  );

  const textInput =
    toPositiveNumber(inputDetails?.text_tokens) ||
    toPositiveNumber(inputDetails?.text) ||
    toPositiveNumber(usage?.text_input_tokens);
  const imageInput =
    toPositiveNumber(inputDetails?.image_tokens) ||
    toPositiveNumber(inputDetails?.image) ||
    toPositiveNumber(usage?.image_input_tokens);
  const imageOutput =
    toPositiveNumber(outputDetails?.image_tokens) ||
    toPositiveNumber(outputDetails?.image) ||
    toPositiveNumber(usage?.image_output_tokens) ||
    toPositiveNumber(usage?.output_tokens);

  const out: UsageTotal = {};
  if (textInput > 0) out.text = { input: textInput, output: 0 };
  if (imageInput > 0 || imageOutput > 0) out.image = { input: imageInput, output: imageOutput };

  if (Object.keys(out).length > 0) return out;

  const fallbackInput = toPositiveNumber(usage?.input_tokens || usage?.prompt_tokens);
  const fallbackOutput = toPositiveNumber(usage?.output_tokens || usage?.completion_tokens);
  if (fallbackInput > 0 || fallbackOutput > 0) {
    return {
      text: { input: fallbackInput, output: 0 },
      image: { input: 0, output: fallbackOutput },
    };
  }

  return undefined;
}

async function callOpenAICompatibleImages(args: {
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  n: number;
  size?: string;
  editImages?: { mimeType: string; data: string }[];
  errCode: string;
  allowResponseFormat?: boolean;
  allowSize?: boolean;
  timeoutMs?: number;
  aspectRatio?: string;
  // gpt-image 계열 전용: 실제 알파 채널 투명 배경 (프롬프트 지시만으로는 체커보드 패턴을 그림 — P2 e2e 실증)
  background?: string;
  // gpt-image 계열 전용: quality 미전송 시 auto가 되어 2.5 계열은 xhigh/max까지 선택할 수 있다.
  quality?: string;
}) {
  const {
    baseUrl,
    apiKey,
    model,
    prompt,
    n,
    size,
    editImages,
    errCode,
    allowResponseFormat = true,
    allowSize = true,
    timeoutMs,
    aspectRatio,
    background,
    quality,
  } = args;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
  };

  const normalizedEditImages = Array.isArray(editImages) ? editImages.filter((image) => Boolean(image?.data)) : [];

  // baseImage가 있으면 edits(멀티파트), 없으면 generations(JSON)
  if (normalizedEditImages.length > 0) {
    const form = new FormData();
    form.append("model", model);
    form.append("prompt", prompt);
    form.append("n", String(n));
    if (allowSize && size) form.append("size", size);
    if (aspectRatio) form.append("aspect_ratio", aspectRatio);
    if (background) form.append("background", background);
    if (quality) form.append("quality", quality);
    if (allowResponseFormat) form.append("response_format", "b64_json");

    normalizedEditImages.forEach((image, index) => {
      const validation = validateBase64Image({
        mimeType: image.mimeType,
        data: image.data,
      });
      if (!validation.valid) throw codedError(validation.error || "invalid_base_image", "INVALID_BASE_IMAGE", 400);

      const buf = Buffer.from(image.data, "base64");
      const ext = image.mimeType.includes("jpeg") ? "jpg" : image.mimeType.includes("webp") ? "webp" : "png";
      form.append("image[]", new Blob([buf], { type: image.mimeType }), `base-${index}.${ext}`);
    });

    const json = await fetchJsonOrThrow(
      `${baseUrl}/images/edits`,
      {
        method: "POST",
        headers, // FormData가 boundary를 설정하므로 Content-Type은 넣지 않음
        body: form,
      },
      errCode,
      timeoutMs,
    );
    const b64s = await extractImageBase64s(json, model, errCode);

    if (!b64s.length) throw codedError("empty_image_response", "EMPTY_IMAGE_RESPONSE", 502);
    return { base64s: b64s, usageTotal: normalizeOpenAIImageUsage(json) };
  }

  const json = await fetchJsonOrThrow(
    `${baseUrl}/images/generations`,
    {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        n,
        ...(allowSize && size ? { size } : {}),
        ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
        ...(background ? { background } : {}),
        ...(quality ? { quality } : {}),
        ...(allowResponseFormat ? { response_format: "b64_json" } : {}),
      }),
    },
    errCode,
    timeoutMs,
  );
  const b64s = await extractImageBase64s(json, model, errCode);

  if (!b64s.length) throw codedError("empty_image_response", "EMPTY_IMAGE_RESPONSE", 502);
  return { base64s: b64s, usageTotal: normalizeOpenAIImageUsage(json) };
}

// OpenAI-compatible Text (OpenAI / xAI)
async function callOpenAICompatibleText(args: {
  provider: TextProviderType;
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  n: number;
  temperature?: number;
  maxOutputTokens?: number;
  baseImages?: BaseImageType[];
  errCode: string;
  reasoningEffort?: string;
  // 최신 OpenAI 모델(gpt-5.x 등)은 max_tokens를 거부하고 max_completion_tokens를 요구한다.
  // xAI 등 OpenAI 호환 API는 max_tokens를 사용하므로 호출처에서 파라미터 명을 지정한다.
  tokenLimitParam?: "max_tokens" | "max_completion_tokens";
}) {
  const { provider, baseUrl, apiKey, model, prompt, n, temperature, maxOutputTokens, baseImages, errCode, reasoningEffort } = args;
  const effectiveMaxOutputTokens = resolveTextOutputBudget(provider, model, maxOutputTokens);
  const tokenLimitParam = args.tokenLimitParam || "max_tokens";
  const refs = normalizeTextReferenceImages(baseImages);
  const content =
    refs.length > 0
      ? [
          { type: "text", text: String(prompt || "") },
          ...refs.map((image) => ({
            type: "image_url",
            image_url: { url: `data:${image.mimeType};base64,${image.data}` },
          })),
        ]
      : String(prompt || "");

  const json = await fetchJsonOrThrow(
    `${baseUrl}/chat/completions`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content }],
        n: Math.max(1, Number(n || 1)),
        ...(typeof temperature === "number" ? { temperature } : {}),
        ...(typeof effectiveMaxOutputTokens === "number" ? { [tokenLimitParam]: effectiveMaxOutputTokens } : {}),
        ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
      }),
    },
    errCode,
    resolveTextUpstreamTimeoutMs(effectiveMaxOutputTokens, provider, model),
  );

  const choices = Array.isArray(toUnknownRecord(json).choices) ? (toUnknownRecord(json).choices as unknown[]) : [];
  const outputs: string[] = choices
    .map((c) => {
      const choice = toUnknownRecord(c);
      return toUnknownRecord(choice.message).content ?? choice.text ?? "";
    })
    .map((s) => String(s || "").trim())
    .filter(Boolean);

  const usage = toUnknownRecord(toUnknownRecord(json).usage);
  const isGpt6Text = errCode === "OPENAI_UPSTREAM_ERROR" && isOpenAIGpt6TextModel(model);
  const providerUsage = isGpt6Text ? parseOpenAIGpt6TextUsage(usage) : undefined;
  const finishReason = String(toUnknownRecord(choices[0]).finish_reason || "");

  if (!outputs.length) {
    if (isGpt6Text && finishReason === "length") {
      logger.warn("[OpenAI] output_token_limit_reached", {
        provider: "openai",
        model,
        finish_reason: finishReason,
        providerUsage,
      });
      throw codedError(
        "출력 한도가 작아 답을 만들지 못했습니다. 한도를 늘려 다시 시도해 주세요.",
        "OUTPUT_TOKEN_LIMIT_REACHED",
        422,
      );
    }
    throw codedError("empty_text_response", "EMPTY_TEXT_RESPONSE", 502);
  }

  if (errCode === "XAI_UPSTREAM_ERROR" && !hasValidXaiInputTokenCount(model, usage.prompt_tokens)) {
    throw codedError("xai_input_usage_unavailable", errCode, 502);
  }
  const input = providerUsage?.promptTokens ?? Number(usage.prompt_tokens || 0);
  const output = providerUsage?.completionTokens ?? Number(usage.completion_tokens || 0);

  // usage 누락 대비(일부 upstream/프록시 환경)
  const safeIn = input > 0 ? input : Math.ceil(String(prompt || "").length / 4);
  const safeOut = output > 0 ? output : Math.ceil(outputs.reduce((s, t) => s + t.length, 0) / 4);

  return { outputs, usageTotal: { input: safeIn, output: safeOut, ...(providerUsage ? { providerUsage } : {}) } };
}

export async function callOpenAIForText(
  modelName: string,
  prompt: string,
  opts?: TextGenerationOptions,
) {
  const apiKey = (await resolvePlatformCredential("ai.openai.default")).payload.apiKey;
  const aliasModel = await resolveTextModelNameFor("openai", modelName, opts?.actorUser);
  const upstreamModel = resolveUpstreamModelName("openai", aliasModel);
  const reasoningEffort = await resolveSystemReasoningEffort({
    provider: "openai",
    modelName: aliasModel,
    modality: "text",
  });
  const take = Math.max(1, Math.min(AI_GEN_CONTENT_LIMIT, Number(opts?.n || 1)));

  const baseUrl = OPENAI_BASE_URL;
  const out = await callOpenAICompatibleText({
    provider: "openai",
    baseUrl,
    apiKey,
    model: upstreamModel,
    prompt: String(prompt || ""),
    n: take,
    temperature: supportsCustomOpenAITemperature(upstreamModel) ? opts?.temperature : undefined,
    maxOutputTokens: opts?.maxOutputTokens,
    baseImages: opts?.baseImages,
    errCode: "OPENAI_UPSTREAM_ERROR",
    tokenLimitParam: "max_completion_tokens",
    reasoningEffort,
  });

  return { modelName: aliasModel, outputs: out.outputs.slice(0, take), usageTotal: out.usageTotal };
}

/** Prepared Qwen Omni transport; D1/D3 and model entitlement gates currently reject before network I/O. */
export async function callQwenForText(modelName: string, prompt: string, opts?: TextGenerationOptions) {
  const selectedModel = String(modelName || QWEN_OMNI_MODEL).trim();
  if (selectedModel !== QWEN_OMNI_MODEL) throw codedError("unsupported_qwen_model", "UNSUPPORTED_MODEL", 400);
  const result = await qwenOmniChat({
    messages: [{ role: "user", content: String(prompt || "") }],
    user: opts?.actorUser,
  });
  const text = String(result.response.choices?.[0]?.message?.content || "").trim();
  if (!text) throw codedError("empty_text_response", "EMPTY_TEXT_RESPONSE", 502);
  const input = Object.values(result.usage).reduce((sum, value) => sum + Number(value?.input || 0), 0);
  const output = Object.values(result.usage).reduce((sum, value) => sum + Number(value?.output || 0), 0);
  return { modelName: selectedModel, outputs: [text], usageTotal: { input, output, providerUsage: result.providerUsage } };
}

/** D1 supports one text-to-1K output only; reference/edit inputs and higher sizes are closed. */
export async function callQwenForImages(
  modelName: string,
  prompt: string,
  opts?: { baseImages?: BaseImageType[]; size?: string; n?: number; user?: unknown },
) {
  const selectedModel = String(modelName || QWEN_IMAGE_MODEL).trim();
  if (
    selectedModel !== QWEN_IMAGE_MODEL ||
    (opts?.baseImages || []).some((image) => Boolean(image?.data)) ||
    (opts?.n !== undefined && Number(opts.n) !== 1) ||
    (opts?.size && !["1K", "1024*1024"].includes(String(opts.size).trim()))
  ) {
    throw codedError("qwen_image_request_outside_approved_d1_scope", "QWEN_IMAGE_SCOPE_UNSUPPORTED", 400);
  }
  let requestDispatched = false;
  let responseReceived = false;
  try {
    await assertQwenProviderCallReady({ modelName: selectedModel, modality: "image", user: opts?.user });
    const client = await getPlatformQwenOpenAIClient();
    const request = buildQwenImageGenerationRequest(prompt);
    requestDispatched = true;
    const response = await client.images.generate(request as unknown as Parameters<typeof client.images.generate>[0]);
    responseReceived = true;
    const base64s = (response.data || []).map((item) => String(item.b64_json || "")).filter(Boolean);
    if (base64s.length !== 1) throw codedError("qwen_image_response_invalid", "QWEN_RESPONSE_INVALID", 502);
    return { modelName: selectedModel, executedModelName: selectedModel, base64s, fixedUsage: { images: 1 } };
  } catch (error) {
    const target = error instanceof Error ? error : new Error(String(error || "Qwen Image request failed."));
    Object.assign(target, {
      providerCallState: responseReceived ? "completed" : requestDispatched ? "unknown_outcome" : "not_sent",
    });
    throw target;
  }
}

export async function callXAIForText(
  modelName: string,
  prompt: string,
  opts?: TextGenerationOptions,
) {
  const apiKey = (await resolvePlatformCredential("ai.xai.default")).payload.apiKey;
  const aliasModel = await resolveTextModelNameFor("xai", modelName, opts?.actorUser);
  const upstreamModel = resolveUpstreamModelName("xai", aliasModel);
  const take = Math.max(1, Math.min(AI_GEN_CONTENT_LIMIT, Number(opts?.n || 1)));

  const baseUrl = XAI_BASE_URL;
  const out = await callOpenAICompatibleText({
    provider: "xai",
    baseUrl,
    apiKey,
    model: upstreamModel,
    prompt: String(prompt || ""),
    n: take,
    temperature: opts?.temperature,
    maxOutputTokens: opts?.maxOutputTokens,
    baseImages: opts?.baseImages,
    errCode: "XAI_UPSTREAM_ERROR",
  });

  return { modelName: aliasModel, outputs: out.outputs.slice(0, take), usageTotal: out.usageTotal };
}

export async function callDeepSeekForText(
  modelName: string,
  prompt: string,
  opts?: TextGenerationOptions,
) {
  if (normalizeTextReferenceImages(opts?.baseImages).length > 0) {
    throw codedError("model_image_input_unsupported", "MODEL_IMAGE_INPUT_UNSUPPORTED", 400);
  }
  const apiKey = (await resolvePlatformCredential("ai.deepseek.default")).payload.apiKey;
  const aliasModel = await resolveTextModelNameFor("deepseek", modelName, opts?.actorUser);
  const upstreamModel = resolveUpstreamModelName("deepseek", aliasModel);
  const take = Math.max(1, Math.min(AI_GEN_CONTENT_LIMIT, Number(opts?.n || 1)));

  const out = await callOpenAICompatibleText({
    provider: "deepseek",
    baseUrl: DEEPSEEK_BASE_URL,
    apiKey,
    model: upstreamModel,
    prompt: String(prompt || ""),
    n: take,
    temperature: opts?.temperature,
    maxOutputTokens: opts?.maxOutputTokens,
    errCode: "DEEPSEEK_UPSTREAM_ERROR",
  });

  return { modelName: aliasModel, outputs: out.outputs.slice(0, take), usageTotal: out.usageTotal };
}

export async function callZaiForText(
  modelName: string,
  prompt: string,
  opts?: TextGenerationOptions,
) {
  const aliasModel = await resolveTextModelNameFor("zai", modelName, opts?.actorUser);
  if (aliasModel === "glm-5.3" && normalizeTextReferenceImages(opts?.baseImages).length > 0) {
    throw codedError("model_image_input_unsupported", "MODEL_IMAGE_INPUT_UNSUPPORTED", 400);
  }
  const apiKey = (await resolvePlatformCredential("ai.zai.default")).payload.apiKey;
  const upstreamModel = resolveUpstreamModelName("zai", aliasModel);
  const take = Math.max(1, Math.min(AI_GEN_CONTENT_LIMIT, Number(opts?.n || 1)));
  const out = await callOpenAICompatibleText({
    provider: "zai",
    baseUrl: ZAI_BASE_URL,
    apiKey,
    model: upstreamModel,
    prompt: String(prompt || ""),
    n: take,
    temperature: opts?.temperature,
    maxOutputTokens: opts?.maxOutputTokens,
    baseImages: opts?.baseImages,
    errCode: "ZAI_UPSTREAM_ERROR",
  });
  return { modelName: aliasModel, outputs: out.outputs.slice(0, take), usageTotal: out.usageTotal };
}

// ----------------------------
// Anthropic Text (Claude)
// ----------------------------
export async function callClaudeForText(
  modelName: string,
  prompt: string,
  opts?: TextGenerationOptions,
) {
  const apiKey = (await resolvePlatformCredential("ai.anthropic.default")).payload.apiKey;
  const aliasModel = await resolveTextModelNameFor("claude", modelName, opts?.actorUser);
  const upstreamModel = resolveUpstreamModelName("claude", aliasModel);
  const take = Math.max(1, Math.min(AI_GEN_CONTENT_LIMIT, Number(opts?.n || 1)));

  const baseUrl = ANTHROPIC_BASE_URL;
  const outs: string[] = [];
  let inputSum = 0;
  let outputSum = 0;
  const errors: string[] = [];
  const refs = normalizeTextReferenceImages(opts?.baseImages);
  // Anthropic만 max_tokens가 필수다. 예산 미지정 시 1024로 두면 긴 콘텐츠 템플릿에서
  // adaptive thinking이 예산을 전부 소진해 text 블록 없는 200 응답이 온다.
  const effectiveMaxOutputTokens = resolveTextOutputBudget("claude", upstreamModel, opts?.maxOutputTokens);
  const maxTokens = resolveAnthropicMaxTokens(effectiveMaxOutputTokens);
  const disableThinking = shouldDisableAnthropicThinking(upstreamModel, maxTokens);
  // 200 응답인데 본문이 없을 때 원인을 남기기 위한 진단 값
  const stopReasons: string[] = [];
  const blockTypes: string[] = [];
  const messageContent =
    refs.length > 0
      ? [
          { type: "text", text: String(prompt || "") },
          ...refs.map((image) => ({
            type: "image",
            source: {
              type: "base64",
              media_type: image.mimeType,
              data: image.data,
            },
          })),
        ]
      : String(prompt || "");

  // Anthropic은 n을 표준으로 안 받는 경우가 많아 loop 방식(안정)
  for (let i = 0; i < take; i++) {
    try {
      const json = await fetchJsonOrThrow(
        `${baseUrl}/messages`,
        {
          method: "POST",
          headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: upstreamModel,
            max_tokens: maxTokens,
            ...(disableThinking ? { thinking: { type: "disabled" } } : {}),
            ...(typeof opts?.temperature === "number" && supportsCustomAnthropicTemperature(upstreamModel)
              ? { temperature: opts.temperature }
              : {}),
            messages: [{ role: "user", content: messageContent }],
          }),
        },
        "CLAUDE_UPSTREAM_ERROR",
        resolveTextUpstreamTimeoutMs(maxTokens, "claude", upstreamModel),
      );

      const record = toUnknownRecord(json);
      const content = Array.isArray(record.content) ? (record.content as unknown[]) : [];
      const stopReason = String(record.stop_reason || "").trim();
      if (stopReason) stopReasons.push(stopReason);
      content.forEach((c) => {
        const blockType = String(toUnknownRecord(c).type || "").trim();
        if (blockType && !blockTypes.includes(blockType)) blockTypes.push(blockType);
      });

      const text = content
        .map((c) => {
          const block = toUnknownRecord(c);
          return block.type === "text" ? block.text : "";
        })
        .join("")
        .trim();
      if (text) outs.push(text);

      const usage = toUnknownRecord(record.usage);
      inputSum += Number(usage.input_tokens || 0);
      outputSum += Number(usage.output_tokens || 0);
    } catch (e) {
      errors.push(toErrorMessage(e));
    }
  }

  if (!outs.length) {
    if (errors.length) {
      throw codedError(`upstream_text_failed: ${errors[0]}`, "UPSTREAM_ERROR", 502);
    }

    // 호출은 성공했는데 text 블록이 없는 경우(thinking만 반환 / max_tokens 소진).
    // 이유 없는 upstream_text_failed로 끝나면 원인 추적이 불가능하므로 진단값을 함께 남긴다.
    const diagnostics = {
      provider: "claude",
      model: upstreamModel,
      maxTokens,
      thinkingDisabled: disableThinking,
      stopReason: stopReasons[0] || "unknown",
      blockTypes: blockTypes.join("|") || "none",
    };
    logger.warn("[Gen Studio] empty_text_response", diagnostics);
    throw codedError(
      `empty_text_response: model=${diagnostics.model} stopReason=${diagnostics.stopReason}` +
        ` blocks=${diagnostics.blockTypes} maxTokens=${maxTokens}`,
      "EMPTY_TEXT_RESPONSE",
      502,
    );
  }

  if (inputSum === 0 && outputSum === 0) {
    inputSum = Math.ceil(String(prompt || "").length / 4);
    outputSum = Math.ceil(outs.reduce((s, t) => s + t.length, 0) / 4);
  }

  return { modelName: aliasModel, outputs: outs, usageTotal: { input: inputSum, output: outputSum } };
}

export async function callOpenAIForImages(
  modelName: string,
  prompt: string,
  opts: {
    size?: string;
    aspectRatio?: string;
    n?: number;
    baseImages?: { mimeType: string; data: string }[];
    background?: string;
    user?: unknown;
  },
) {
  const apiKey = (await resolvePlatformCredential("ai.openai.default")).payload.apiKey;
  const aliasModel = await resolveImageModelNameFor("openai", modelName, opts.user);
  const upstreamModel = resolveUpstreamModelName("openai", aliasModel);
  const take = Math.max(1, Math.min(AI_GEN_IMAGE_LIMIT, Number(opts.n || 1)));
  const resolved = resolveImageGenOptions({
    provider: "openai",
    modelName: aliasModel,
    aspectRatio: opts.aspectRatio,
    size: opts.size,
  });
  const size = typeof resolved.size === "string" ? resolved.size.trim() : "";
  const baseUrl = OPENAI_BASE_URL;
  const editImages = Array.isArray(opts.baseImages) ? opts.baseImages.filter((image) => Boolean(image?.data)) : [];
  const isEditRequest = editImages.length > 0;
  const requestAspectRatio = "";
  let b64s: string[] = [];
  let usageTotal: UsageTotal | undefined = undefined;
  const executedModelName = aliasModel;

  const requestModel = upstreamModel;
  const requestSize = size || undefined;
  const allowInitialResponseFormat = shouldRequestOpenAIImageResponseFormat(requestModel);
  // background 파라미터는 gpt-image 계열만 수용 — 그 외 모델에는 전송하지 않음 (upstream 파라미터 오류 방지)
  const requestBackground = /^gpt-image-/i.test(requestModel) && String(opts.background || "").trim()
    ? String(opts.background).trim()
    : undefined;
  // quality를 생략하면 upstream 기본값 auto가 적용된다. gpt-image-2.5 계열의 auto는 xhigh/max까지
  // 선택할 수 있어 장당 출력 토큰이 예측 불가로 커지므로 high로 고정한다.
  const requestQuality = /^gpt-image-/i.test(requestModel) ? OPENAI_IMAGE_QUALITY_LOCK : undefined;

  try {
    const imageOut = await callOpenAICompatibleImages({
      baseUrl,
      apiKey,
      model: requestModel,
      prompt: String(prompt || ""),
      n: take,
      size: requestSize,
      editImages,
      errCode: "OPENAI_UPSTREAM_ERROR",
      allowResponseFormat: allowInitialResponseFormat,
      allowSize: true,
      timeoutMs: OPENAI_IMAGE_UPSTREAM_TIMEOUT_MS,
      aspectRatio: requestAspectRatio || undefined,
      background: requestBackground,
      quality: requestQuality,
    });
    b64s = imageOut.base64s;
    usageTotal = imageOut.usageTotal;
  } catch (e: unknown) {
    const msg = String(toUnknownRecord(e).message || "");

    if (/response_format/i.test(msg)) {
      const imageOut = await callOpenAICompatibleImages({
        baseUrl,
        apiKey,
        model: requestModel,
        prompt: String(prompt || ""),
        n: take,
        size: requestSize,
        editImages,
        errCode: "OPENAI_UPSTREAM_ERROR",
        allowResponseFormat: false,
        allowSize: true,
        timeoutMs: OPENAI_IMAGE_UPSTREAM_TIMEOUT_MS,
        aspectRatio: requestAspectRatio || undefined,
        background: requestBackground,
        quality: requestQuality,
      });
      b64s = imageOut.base64s;
      usageTotal = imageOut.usageTotal;
    } else if (/Invalid value:\s*'\d+x\d+'|Supported values are:/i.test(msg)) {
      const imageOut = await callOpenAICompatibleImages({
        baseUrl,
        apiKey,
        model: requestModel,
        prompt: String(prompt || ""),
        n: take,
        size: "auto",
        editImages: isEditRequest ? editImages : undefined,
        errCode: "OPENAI_UPSTREAM_ERROR",
        allowResponseFormat: allowInitialResponseFormat,
        allowSize: true,
        timeoutMs: OPENAI_IMAGE_UPSTREAM_TIMEOUT_MS,
        aspectRatio: requestAspectRatio || undefined,
        background: requestBackground,
        quality: requestQuality,
      });
      b64s = imageOut.base64s;
      usageTotal = imageOut.usageTotal;
    } else if (/aspect_?ratio|Unknown parameter.*aspect_ratio|Unrecognized request argument.*aspect_ratio/i.test(msg)) {
      const imageOut = await callOpenAICompatibleImages({
        baseUrl,
        apiKey,
        model: requestModel,
        prompt: String(prompt || ""),
        n: take,
        size: size || "auto",
        editImages: isEditRequest ? editImages : undefined,
        errCode: "OPENAI_UPSTREAM_ERROR",
        allowResponseFormat: allowInitialResponseFormat,
        allowSize: true,
        timeoutMs: OPENAI_IMAGE_UPSTREAM_TIMEOUT_MS,
        background: requestBackground,
        quality: requestQuality,
      });
      b64s = imageOut.base64s;
      usageTotal = imageOut.usageTotal;
    } else {
      throw e;
    }
  }

  return {
    modelName: aliasModel,
    executedModelName,
    billingModelName: resolveImageBillingModelName({
      provider: "openai",
      requestedModelName: aliasModel,
      executedModelName,
      hasBaseImages: isEditRequest,
    }),
    usageTotal,
    base64s: b64s.slice(0, take),
  };
}

export async function callXAIForImages(
  modelName: string,
  prompt: string,
  opts: { size?: string; aspectRatio?: string; n?: number; baseImages?: { mimeType: string; data: string }[]; user?: unknown },
) {
  const aliasModel = await resolveImageModelNameFor("xai", modelName, opts.user);
  const upstreamModel = resolveUpstreamModelName("xai", aliasModel);
  const take = Math.max(1, Math.min(AI_GEN_IMAGE_LIMIT, Number(opts.n || 1)));
  const normalizedBaseImages = Array.isArray(opts?.baseImages) ? opts.baseImages.filter((v) => Boolean(v?.data)) : [];
  const hasBaseImages = normalizedBaseImages.length > 0;
  if (aliasModel === "grok-imagine-image-2.0" && hasBaseImages) {
    throw codedError("model_image_input_unsupported", "MODEL_IMAGE_INPUT_UNSUPPORTED", 400);
  }
  const apiKey = (await resolvePlatformCredential("ai.xai.default")).payload.apiKey;
  const resolved = resolveImageGenOptions({
    provider: "xai",
    modelName: aliasModel,
    aspectRatio: opts.aspectRatio,
    size: opts.size,
  });
  const baseUrl = XAI_BASE_URL;
  const maxAttempts = 3;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      let b64s: string[] = [];

      if (hasBaseImages) {
        const images = normalizedBaseImages.map((img) => ({
          type: "image_url",
          url: `data:${String(img.mimeType || "image/png")};base64,${String(img.data || "")}`,
        }));

        const payload: Record<string, unknown> = {
          model: upstreamModel,
          prompt: String(prompt || ""),
          n: take,
          aspect_ratio: resolved.aspectRatio,
          ...(images.length === 1 ? { image: images[0] } : { images }),
        };

        const json = await fetchJsonOrThrow(
          `${baseUrl}/images/edits`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
          "XAI_UPSTREAM_ERROR",
        );

        b64s = await extractImageBase64s(json, upstreamModel, "XAI_UPSTREAM_ERROR");
      } else {
        const payload: Record<string, unknown> = {
          model: upstreamModel,
          prompt: String(prompt || ""),
          n: take,
          aspect_ratio: resolved.aspectRatio,
          ...(aliasModel === "grok-imagine-image-2.0" ? { resolution: "1k", quality: "low" } : {}),
        };

        const json = await fetchJsonOrThrow(
          `${baseUrl}/images/generations`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
          "XAI_UPSTREAM_ERROR",
        );

        b64s = await extractImageBase64s(json, upstreamModel, "XAI_UPSTREAM_ERROR");
      }

      if (!b64s.length) throw codedError("empty_image_response", "EMPTY_IMAGE_RESPONSE", 502);

      return {
        modelName: aliasModel,
        executedModelName: aliasModel,
        billingModelName: resolveImageBillingModelName({
          provider: "xai",
          requestedModelName: aliasModel,
          executedModelName: aliasModel,
          hasBaseImages,
        }),
        base64s: b64s.slice(0, take),
      };
    } catch (e: unknown) {
      lastError = e;
      if (isXAITemporaryUnavailableError(e) && attempt < maxAttempts) {
        await delay(350 * attempt);
        continue;
      }

      if (isXAITemporaryUnavailableError(e)) {
        throw codedError(
          "xAI 이미지 모델이 일시적으로 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.",
          "MODEL_TEMP_UNAVAILABLE",
          503,
        );
      }

      throw e;
    }
  }

  throw lastError || codedError("xai_upstream_failed", "XAI_UPSTREAM_ERROR", 502);
}

export async function callZaiForImages(
  modelName: string,
  prompt: string,
  opts: { size?: string; aspectRatio?: string; n?: number; baseImages?: { mimeType: string; data: string }[]; user?: unknown },
) {
  const baseImages = Array.isArray(opts.baseImages) ? opts.baseImages.filter((image) => Boolean(image?.data)) : [];
  if (baseImages.length > 0) throw codedError("model_image_input_unsupported", "MODEL_IMAGE_INPUT_UNSUPPORTED", 400);
  const apiKey = (await resolvePlatformCredential("ai.zai.default")).payload.apiKey;
  const aliasModel = await resolveImageModelNameFor("zai", modelName, opts.user);
  const upstreamModel = resolveUpstreamModelName("zai", aliasModel);
  const take = Math.max(1, Math.min(AI_GEN_IMAGE_LIMIT, Number(opts.n || 1)));
  const resolved = resolveImageGenOptions({ provider: "zai", modelName: aliasModel, aspectRatio: opts.aspectRatio, size: opts.size });
  const imageOut = await callOpenAICompatibleImages({
    baseUrl: ZAI_BASE_URL,
    apiKey,
    model: upstreamModel,
    prompt: String(prompt || ""),
    n: take,
    size: resolved.size,
    errCode: "ZAI_UPSTREAM_ERROR",
    allowResponseFormat: false,
    allowSize: true,
    timeoutMs: OPENAI_IMAGE_UPSTREAM_TIMEOUT_MS,
  });
  return {
    modelName: aliasModel,
    executedModelName: aliasModel,
    billingModelName: resolveImageBillingModelName({ provider: "zai", requestedModelName: aliasModel, executedModelName: aliasModel, hasBaseImages: false }),
    usageTotal: imageOut.usageTotal,
    base64s: imageOut.base64s.slice(0, take),
  };
}

export async function callImagesByProvider(
  provider: AiProviderType,
  modelName: string,
  prompt: string,
  opts: {
    size?: string;
    aspectRatio?: string;
    n?: number;
    baseImages?: { mimeType: string; data: string }[];
    background?: string;
    user?: unknown;
  },
) {
  const p = (provider || "").toLowerCase() as AiProviderType;

  if (String(p) === "qwen") return await callQwenForImages(modelName, prompt, opts);

  if (p === "google") return await callGoogleForImages(modelName, prompt, opts);
  if (p === "openai") return await callOpenAIForImages(modelName, prompt, opts);
  if (p === "xai") return await callXAIForImages(modelName, prompt, opts);
  if (p === "zai") return await callZaiForImages(modelName, prompt, opts);
  throw codedError("unsupported_provider", "UNSUPPORTED_PROVIDER", 400);
}

// Gemini 호출 → base64 배열 반환 (이미지 전용 옵션 사용)
export async function callGoogleForImages(
  modelName: string,
  prompt: string,
  opts: { size?: string; aspectRatio?: string; n?: number; baseImages?: { mimeType: string; data: string }[]; user?: unknown },
) {
  const useModel = await resolveImageModelNameFor("google", modelName, opts.user);
  const genAI = await getGoogleClientOrThrow();
  const take = Math.max(1, Math.min(AI_GEN_IMAGE_LIMIT, Number(opts.n || 1)));
  const resolved = resolveImageGenOptions({
    provider: "google",
    modelName: useModel,
    aspectRatio: opts.aspectRatio,
    size: opts.size,
  });
  const aspectRatio = resolved.aspectRatio;
  const imageSize = typeof resolved.size === "string" ? resolved.size.trim() : "";

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const maxAttempts = 2; // 1회 재시도 (총 2회)

  // SDK 전용 옵션: 비율/출력 유형 지정
  const config = {
    responseModalities: [Modality.TEXT, Modality.IMAGE],
    imageConfig: {
      aspectRatio, // ex) "9:16"
      ...(imageSize ? { imageSize } : {}),
    },
  };

  const parts: GoogleInlinePart[] = [];
  if (prompt && prompt.trim()) {
    parts.push({ text: prompt.trim() });
  }

  const refs = Array.isArray(opts.baseImages) ? opts.baseImages.filter((v) => Boolean(v?.data)) : [];
  for (const ref of refs) {
    const validation = validateBase64Image({ mimeType: ref.mimeType, data: ref.data });
    if (!validation.valid) throw codedError(validation.error || "invalid_base_image", "INVALID_BASE_IMAGE", 400);
    parts.push({ inlineData: { mimeType: ref.mimeType, data: ref.data } });
  }

  if (parts.length === 0) {
    throw codedError("prompt_or_image_required", "INVALID_INPUT", 400);
  }

  // n회 병렬 호출로 n장 확보
  const runOnce = () =>
    Promise.allSettled(
      Array.from({ length: take }, () => {
        const request = {
          model: useModel,
          contents: [{ role: "user", parts }],
          config,
        } as Parameters<typeof genAI.models.generateContent>[0];

        return genAI.models.generateContent(request);
      }),
    );

  let settled = await runOnce();
  for (let attempt = 1; attempt < maxAttempts; attempt++) {
    const fulfilled = settled.filter(isFulfilled).map((r) => r.value);
    const allParts = fulfilled.flatMap((res) => getGoogleResponseParts(res));
    const imageParts = allParts.filter((p) => p?.inlineData?.data);
    if (imageParts.length > 0) break;
    await sleep(300 * attempt);
    settled = await runOnce();
  }

  const fulfilled = settled.filter(isFulfilled).map((r) => r.value);

  const allParts = fulfilled.flatMap((res) => getGoogleResponseParts(res));
  const imageParts = allParts.filter((p) => p?.inlineData?.data);

  logger.log("[apiHelper] Parts Check:", { fulfilled, allParts, imageParts });

  if (imageParts.length === 0) {
    const blockReason = fulfilled.map((r) => getGooglePromptFeedback(r)?.blockReason).filter(Boolean)[0];
    const finishReason = fulfilled
      .flatMap((r) => getGoogleCandidates(r))
      .map((c) => c?.finishReason)
      .filter(Boolean)[0];

    logger.warn("[Gen Studio] empty_image_response", {
      provider: "google",
      model: useModel,
      blockReason,
      finishReason,
      fulfilled: fulfilled.length,
      total: settled.length,
    });

    const firstRej = settled.find((s) => s.status === "rejected") as PromiseRejectedResult | undefined;
    const reason = firstRej ? toErrorMessage(firstRej.reason) : "";
    throw codedError(reason ? `empty_image_response: ${reason}` : "empty_image_response", "EMPTY_IMAGE_RESPONSE", 502);
  }
  const base64s = imageParts.slice(0, take).map((p) => String(p.inlineData?.data));

  return {
    modelName: useModel,
    executedModelName: useModel,
    billingModelName: resolveImageBillingModelName({
      provider: "google",
      requestedModelName: useModel,
      executedModelName: useModel,
      hasBaseImages: refs.length > 0,
    }),
    base64s,
  };
}

// Gemini n회 호출하며 토큰 사용량 합산
type TextCallOut = {
  modelName: string;
  outputs: string[];
  usageTotal: { input: number; output: number }; // 합산 토큰
};

// Gemini 텍스트 호출
export async function callGeminiForText(
  prompt: string,
  n = 1,
  modelName?: string,
  opts?: TextGenerationOptions,
): Promise<TextCallOut> {
  const useModel = await resolveTextModelNameFor("google", modelName, opts?.actorUser);
  const effectiveMaxOutputTokens = resolveTextOutputBudget("google", useModel, opts?.maxOutputTokens);
  const timeoutMs = supportsGeminiThinkingBudget(useModel)
    ? undefined
    : resolveTextUpstreamTimeoutMs(effectiveMaxOutputTokens, "google", useModel);
  const genAI = await getGoogleClientOrThrow(timeoutMs);
  const take = Math.max(1, Math.min(AI_GEN_CONTENT_LIMIT, Number(n || 1)));

  const temperature =
    typeof opts?.temperature === "number" && Number.isFinite(opts.temperature) ? opts.temperature : 1.0;
  const maxOutputTokens = effectiveMaxOutputTokens;
  const thinkingBudget =
    typeof opts?.thinkingBudget === "number" && Number.isInteger(opts.thinkingBudget)
      ? opts.thinkingBudget
      : undefined;

  const outs: string[] = [];
  let inputSum = 0;
  let outputSum = 0;
  const errors: string[] = [];
  // 200 응답인데 본문이 비어 있을 때 원인을 남기기 위한 진단 값
  const emptyReasons: string[] = [];
  const refs = normalizeTextReferenceImages(opts?.baseImages);
  const parts = [
    { text: prompt },
    ...refs.map((image) => ({
      inlineData: {
        mimeType: image.mimeType,
        data: image.data,
      },
    })),
  ];

  for (let i = 0; i < take; i++) {
    try {
      const req = {
        model: useModel,
        contents: [{ role: "user", parts }],
        config: {
          responseMimeType: opts?.responseMimeType || "text/plain",
          ...(supportsCustomGeminiTemperature(useModel) ? { temperature } : {}),
          ...(maxOutputTokens ? { maxOutputTokens } : {}),
          ...(thinkingBudget !== undefined && supportsGeminiThinkingBudget(useModel)
            ? { thinkingConfig: { thinkingBudget } }
            : {}),
        },
      };

      const res = await genAI.models.generateContent(req);

      const usage = getGoogleUsageMetadata(res);
      inputSum += Number(usage?.promptTokenCount || 0);
      // Gemini는 thinking token도 output 단가로 과금한다. candidates만 합산하면
      // thinking 모델의 provider 비용을 누락하므로 두 필드를 함께 기록한다.
      outputSum += Number(usage?.candidatesTokenCount || 0) + Number(usage?.thoughtsTokenCount || 0);

      const text = String(getGoogleText(res) || "").trim();
      // 빈 문자열을 결과로 담으면 과금은 진행되고 asset 저장 단계에서 조용히 걸러져
      // "success인데 결과 0건"이 된다. 본문이 없는 응답은 결과로 세지 않는다.
      if (text) {
        outs.push(text);
        continue;
      }

      const blockReason = String(getGooglePromptFeedback(res)?.blockReason || "").trim();
      const finishReason = String(getGoogleCandidates(res)[0]?.finishReason || "").trim();
      emptyReasons.push(`blockReason=${blockReason || "none"} finishReason=${finishReason || "none"}`);
    } catch (e) {
      errors.push(toErrorMessage(e));
    }
  }

  if (outs.length === 0) {
    if (errors.length) {
      throw codedError(`upstream_text_failed: ${errors[0]}`, "UPSTREAM_ERROR", 502);
    }

    // 호출은 성공했는데 본문이 비어 있는 경우(안전 차단 / MAX_TOKENS 등).
    const diagnostics = {
      provider: "google",
      model: useModel,
      maxOutputTokens: maxOutputTokens ?? null,
      thinkingBudget: thinkingBudget ?? null,
      reason: emptyReasons[0] || "unknown",
    };
    logger.warn("[Gen Studio] empty_text_response", diagnostics);
    throw codedError(
      `empty_text_response: model=${diagnostics.model} ${diagnostics.reason}`,
      "EMPTY_TEXT_RESPONSE",
      502,
    );
  }

  if (inputSum === 0 && outputSum === 0) {
    const approxIn = Math.ceil(prompt.length / 4);
    const approxOut = Math.ceil(outs.reduce((s, t) => s + t.length, 0) / 4);
    inputSum = approxIn;
    outputSum = approxOut;
  }

  return { modelName: useModel, outputs: outs, usageTotal: { input: inputSum, output: outputSum } };
}

export async function callTextByProvider(
  provider: AiProviderType,
  modelName: string,
  prompt: string,
  opts?: TextGenerationOptions,
) {
  const p = String(provider || "").toLowerCase() as AiProviderType;
  if (String(p) === "qwen") return await callQwenForText(modelName, prompt, opts);
  if (normalizeTextReferenceImages(opts?.baseImages).length > 0) {
    await assertSystemModelSupportsImageInputOrThrow({ provider: p, modelName });
  }
  if (p === "google") return await callGeminiForText(prompt, opts?.n || 1, modelName, opts);
  if (p === "openai") return await callOpenAIForText(modelName, prompt, opts);
  if (p === "xai") return await callXAIForText(modelName, prompt, opts);
  if (p === "claude") return await callClaudeForText(modelName, prompt, opts);
  if (p === "deepseek") return await callDeepSeekForText(modelName, prompt, opts);
  if (p === "zai") return await callZaiForText(modelName, prompt, opts);
  throw codedError("unsupported_provider", "UNSUPPORTED_PROVIDER", 400);
}
