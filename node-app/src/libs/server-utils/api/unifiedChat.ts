import "server-only";
import type { ChatCompletionMessageParam } from "openai/resources/index.mjs";
import type Anthropic from "@anthropic-ai/sdk";
import {
  createPartFromBase64,
  createPartFromText,
  HarmCategory,
  HarmBlockThreshold,
} from "@google/genai";
import { COMMERCE_NAMESPACE_KEY } from "consts/app";
import { logger } from "utils/log";
import { parseAIResponse, processAndCleanHistory } from "utils/ai";
import {
  billAIUsageOrThrow,
  billCommerceAIUsageOrThrow,
  assertAIUsageBalanceOrThrow,
  assertPricingPreflightOrThrow,
} from "libs/services/aiUsageBilling";
import {
  getSharedRequestBase,
  getBillingContext,
  composeSystemPromptOrThrow,
} from "libs/server-utils/api/sharedRequestUtils";
import { PROMPT_LIMITS } from "consts/auth";
import type { BillableProviderType, ChatImageInputType, TextProviderType, ModelScopeType, IAiResponse } from "types/ai";
import type { ITokenUsageBreakdown } from "types/payment";
import { resolveUpstreamModelName } from "consts/ai/modelRole";
import {
  isGoogleProTextModel,
  isXaiLongContextTieredTextModel,
  hasValidXaiInputTokenCount,
  pickXaiPricingVariantByInputTokens,
  isOpenAIGpt6TextModel,
  pickOpenAIGpt6PricingVariantByInputTokens,
  supportsCustomGeminiTemperature,
  supportsCustomAnthropicTemperature,
  supportsCustomOpenAITemperature,
} from "utils/ai/providerHelper";
import { toUnknownRecord } from "utils/common/typeUtils";
import {
  assertSystemModelSelectableOrThrow,
  assertSystemModelSupportsImageInputOrThrow,
  resolveSystemReasoningEffort,
} from "libs/server-utils/api/systemModelControl";
import {
  getPlatformAnthropicClient,
  getPlatformDeepSeekClient,
  getPlatformGoogleClient,
  getPlatformOpenAIClient,
  getPlatformXAIClient,
  getPlatformZaiClient,
} from "libs/server-utils/secure/platformAiClients";
import { claimProviderOperationOrThrow } from "libs/server-utils/api/providerOperationGuard";
import { assertQwenProviderCallReady, qwenOmniChat, QWEN_OMNI_MODEL } from "libs/server-utils/audio/providers/qwenSpeech";

/**
 * @docHint
 * @purpose 서버 유틸/핸들러 핵심 처리
 * @process handleUnifiedTextChatRequest 중심 처리  입력 검증  핵심 로직  결과 포맷팅  프롬프트 렌더링/정책 적용 포함  대화 저장/후처리 포함
 * @domain ai-chat
 * @scope global
 */

function pickGeminiVariantByInputTokens(inputTokens: number) {
  // contentPipeline과 동일한 기준 유지
  return inputTokens > 200_000 ? "long" : "short";
}

type UnifiedChatUser = {
  uid?: string;
  ID?: string;
  __resolvedUniverseId?: unknown;
  __resolvedUniverseType?: string | null;
  [key: string]: unknown;
};

type RunnerArgs = {
  model: string;
  systemPrompt: string;
  message: string;
  processedHistory: ChatHistoryEntry[]; // 결과를 그대로 전달 (role/content 형태)
  maxOutputTokens: number;
  imageInput?: ChatImageInputType;
  user?: UnifiedChatUser;
  onProviderDispatch?: () => void;
  onProviderResponse?: () => void;
};

type RunnerResult = {
  rawText: string;
  usage: { input: number; output: number };
  finishReason?: string;
  providerUsage?: Record<string, unknown>;
  billingUsage?: ITokenUsageBreakdown;
};

type UnifiedTextProviderType = TextProviderType | "qwen";

type ChatHistoryEntry = {
  role?: unknown;
  content?: unknown;
};

type UnifiedChatRequest = {
  modelName?: unknown;
  model?: unknown;
  message?: unknown;
  history?: unknown;
  universeId?: unknown;
  npcId?: unknown;
  routeHint?: unknown;
  chatModelService?: unknown;
  options?: { promptOptions?: unknown };
  voiceInput?: unknown;
  imageInput?: unknown;
  operationId?: unknown;
  magazineContext?: unknown;
};

type BillingSummary = { ok: boolean; coins: number };
type BillingResult = { ok?: boolean; coins?: number };

function parseOpenAIGpt6TextUsage(value: unknown) {
  const usage = toUnknownRecord(value);
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
  const promptDetailCounts = {
    cachedTokens: optionalCount(promptDetails, "cached_tokens"),
    audioTokens: optionalCount(promptDetails, "audio_tokens"),
    cacheWriteTokens: optionalCount(promptDetails, "cache_write_tokens"),
  };
  const completionDetailCounts = {
    reasoningTokens: optionalCount(completionDetails, "reasoning_tokens"),
    audioTokens: optionalCount(completionDetails, "audio_tokens"),
    acceptedPredictionTokens: optionalCount(completionDetails, "accepted_prediction_tokens"),
    rejectedPredictionTokens: optionalCount(completionDetails, "rejected_prediction_tokens"),
  };
  const optionalInvalid = [...Object.values(promptDetailCounts), ...Object.values(completionDetailCounts)].includes(null);
  if (
    !Number.isSafeInteger(promptTokens) ||
    !Number.isSafeInteger(completionTokens) ||
    !Number.isSafeInteger(totalTokens) ||
    Number(promptTokens) <= 0 ||
    Number(completionTokens) <= 0 ||
    Number(totalTokens) !== Number(promptTokens) + Number(completionTokens) ||
    optionalInvalid ||
    (typeof promptDetailCounts.cachedTokens === "number" && promptDetailCounts.cachedTokens > Number(promptTokens)) ||
    (typeof promptDetailCounts.audioTokens === "number" && promptDetailCounts.audioTokens > Number(promptTokens)) ||
    Object.values(completionDetailCounts).some((count) => typeof count === "number" && count > Number(completionTokens))
  ) {
    const error = new Error("OpenAI GPT-6 text usage is missing or inconsistent.") as Error & { errorCode: string; status: number };
    error.errorCode = "OPENAI_USAGE_UNAVAILABLE";
    error.status = 502;
    throw error;
  }
  return {
    contract: "openai.chat.completions.gpt6.v1",
    promptTokens: Number(promptTokens),
    completionTokens: Number(completionTokens),
    totalTokens: Number(totalTokens),
    promptTokensDetails: promptDetailCounts,
    completionTokensDetails: completionDetailCounts,
  };
}

const MAX_OUTPUT_TOKENS = PROMPT_LIMITS.maxOutputMessageLength;
export const UNIFIED_CHAT_PROVIDER_TIMEOUT_MS = 150_000;

type ProviderOperationFailureContext = {
  dispatchStarted: boolean;
  providerResponseReceived: boolean;
  error: unknown;
};

type ProviderOperationFailureDisposition = "release" | "dispatch_uncertain" | "post_response_failure";

export function classifyProviderOperationFailure(context: ProviderOperationFailureContext): ProviderOperationFailureDisposition {
  const { dispatchStarted, providerResponseReceived, error } = context;
  if (!dispatchStarted) return "release";

  const errorRecord = toUnknownRecord(error);
  const detail = toUnknownRecord(errorRecord.detail);
  const providerCallState = errorRecord.providerCallState || detail.providerCallState;
  if (providerCallState === "not_sent") return "release";
  const errorCode = errorRecord.errorCode;
  const status = Number(errorRecord.upstreamStatus ?? errorRecord.status);
  // This code is created only after a successful provider response; preserve the D6 post-response lease.
  if (providerResponseReceived && errorCode === "OUTPUT_TOKEN_LIMIT_REACHED") return "post_response_failure";
  if (Number.isInteger(status) && status >= 400 && status < 500) return "release";
  if (providerResponseReceived || providerCallState === "completed" || errorCode === "OPENAI_USAGE_UNAVAILABLE" || errorCode === "XAI_UPSTREAM_ERROR") {
    return "post_response_failure";
  }

  return "dispatch_uncertain";
}

// --- Google safety ---
const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

// --- OpenAI capability: response_format(json_object) 지원 모델에만 적용 ---
// "허용 모델" 검증은 pricing preflight가 담당, 여기서는 OpenAI 옵션(response_format) 적용 가능 여부만 판단
function openaiSupportsResponseFormatJsonObject(model: string) {
  const m = String(model);
  return /gpt-4o|gpt-4\.1|gpt-5|o1|o3|o4/i.test(m); // 보수적 allowlist
}

// --- xAI(Grok) capability: response_format(json_object) ---
function grokSupportsResponseFormatJsonObject(model: string) {
  const m = String(model).toLowerCase();
  // grok-4*, grok-3*, grok-2-1212*
  return m.startsWith("grok-4") || m.startsWith("grok-3") || m.startsWith("grok-2-1212") || /(^|[^a-z0-9])grok-(4|3)\b/.test(m);
}

function ensureJsonInstruction(systemPrompt: string) {
  const sys = String(systemPrompt);
  // JSON 키워드가 없으면 최소 보강(파서 안정성)
  return /json/i.test(sys) ? sys : `You must output valid JSON only. (JSON)\n` + sys;
}

function buildVoiceInputContext(value: unknown, message: string) {
  const voiceInput = toUnknownRecord(value);
  if (voiceInput.source !== "microphone_transcript") return "";

  const assessment = toUnknownRecord(voiceInput.pronunciationAssessment);
  const hasDirectAudioAnalysis = assessment.basis === "gpt_audio_direct";
  const overallConfidence =
    typeof assessment.overallConfidence === "number" && Number.isFinite(assessment.overallConfidence)
      ? Math.max(0, Math.min(1, assessment.overallConfidence))
      : undefined;
  const unclearTokens = Array.isArray(assessment.unclearTokens)
    ? assessment.unclearTokens
        .map((item) => {
          const token = toUnknownRecord(item);
          const text = String(token.text || "").trim().slice(0, 40);
          const confidence = Number(token.confidence);
          return text && Number.isFinite(confidence) ? `${text} (${Math.round(confidence * 100)}%)` : "";
        })
        .filter(Boolean)
        .slice(0, 8)
    : [];
  const durationMs = Number(voiceInput.durationMs);
  const wordCount = String(message || "").trim().split(/\s+/).filter(Boolean).length;
  const wordsPerMinute =
    Number.isFinite(durationMs) && durationMs > 0 && wordCount > 0 ? Math.round((wordCount * 60_000) / durationMs) : undefined;
  const scoreFields = [
    ["overall", assessment.overallScore],
    ["clarity", assessment.clarityScore],
    ["fluency", assessment.fluencyScore],
    ["pace", assessment.paceScore],
    ["intonation", assessment.intonationScore],
  ]
    .map(([label, value]) => {
      const score = Number(value);
      return Number.isFinite(score) ? `${label}: ${Math.round(Math.max(0, Math.min(100, score)))}/100` : "";
    })
    .filter(Boolean);
  const strengths = Array.isArray(assessment.strengths)
    ? assessment.strengths.map((item) => String(item || "").trim().slice(0, 240)).filter(Boolean).slice(0, 5)
    : [];
  const improvements = Array.isArray(assessment.improvements)
    ? assessment.improvements.map((item) => String(item || "").trim().slice(0, 240)).filter(Boolean).slice(0, 5)
    : [];
  const uncertainWords = Array.isArray(assessment.uncertainWords)
    ? assessment.uncertainWords
        .map((item) => {
          const word = toUnknownRecord(item);
          const text = String(word.word || "").trim().slice(0, 40);
          const issue = String(word.issue || "").trim().slice(0, 160);
          const suggestion = String(word.suggestion || "").trim().slice(0, 160);
          return text ? [text, issue, suggestion].filter(Boolean).join(" — ") : "";
        })
        .filter(Boolean)
        .slice(0, 8)
    : [];

  return [
    "The current user message was spoken through the microphone and transcribed from the user's real voice.",
    hasDirectAudioAnalysis
      ? `The original recording was directly analyzed by ${String(assessment.modelName || "gpt-audio").slice(0, 80)} before this chat turn.`
      : "The original recording was not directly available to this text model; use the acoustic STT evidence below.",
    hasDirectAudioAnalysis && assessment.heardText
      ? `Direct audio model heard: ${String(assessment.heardText).trim().slice(0, 1000)}`
      : "",
    hasDirectAudioAnalysis && assessment.summary
      ? `Direct audio analysis summary: ${String(assessment.summary).trim().slice(0, 600)}`
      : "",
    scoreFields.length ? `Pronunciation coaching scores: ${scoreFields.join(", ")}.` : "",
    strengths.length ? `Audible strengths: ${strengths.join(" | ")}` : "",
    improvements.length ? `Recommended improvements: ${improvements.join(" | ")}` : "",
    uncertainWords.length ? `Words needing attention: ${uncertainWords.join(" | ")}` : "",
    overallConfidence !== undefined
      ? `Overall acoustic recognition confidence: ${Math.round(overallConfidence * 100)}%.`
      : "Overall acoustic recognition confidence is unavailable.",
    unclearTokens.length ? `Least confidently recognized fragments: ${unclearTokens.join(", ")}.` : "No notably unclear fragment was reported.",
    wordsPerMinute ? `Estimated speaking pace: ${wordsPerMinute} words per minute.` : "",
    "Use this evidence to discuss pronunciation, intelligibility, pacing, rhythm, stress, intonation, and likely unclear words naturally.",
    "For pronunciation feedback, be specific but state that these are AI coaching estimates, not standardized certification scores.",
    "Do not say that you only received typed text or that you could not hear the user.",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildMagazineContextPrompt(value: unknown) {
  const context = toUnknownRecord(value);
  if (context.source !== "article-experience") return "";
  const title = String(context.title || "").trim().slice(0, 240);
  const question = String(context.question || "").trim().slice(0, 400);
  const sectionId = String(context.sectionId || "").trim().slice(0, 128);
  const returnSectionId = String(context.returnSectionId || "").trim().slice(0, 128);
  if (!title || !question || !sectionId || !returnSectionId) return "";
  return [
    "[Magazine article context — server authoritative, do not expose internal IDs]",
    `Article: ${title}`,
    `Question: ${question}`,
    `Current section: ${sectionId}`,
    "Answer the user's situation using the article's evidence and clearly distinguish general guidance from certainty.",
  ].join("\n");
}

// --- Provider runners ---
async function runOpenAITextChat(args: RunnerArgs): Promise<RunnerResult> {
  const openai = await getPlatformOpenAIClient();
  const { model, systemPrompt, message, processedHistory, maxOutputTokens, imageInput } = args;
  const reasoningEffort = await resolveSystemReasoningEffort({
    provider: "openai",
    modelName: model,
    modality: "text",
  });
  const chatHistory: ChatCompletionMessageParam[] = (processedHistory || [])
    .filter((m) => m?.role === "user" || m?.role === "assistant")
    .map((msg) => ({ role: msg.role as "user" | "assistant", content: String(msg.content ?? "") }));

  const supportsJson = openaiSupportsResponseFormatJsonObject(model);
  const sys = ensureJsonInstruction(systemPrompt);

  const userMessage: ChatCompletionMessageParam = imageInput
    ? {
        role: "user",
        content: [
          { type: "text", text: message },
          {
            type: "image_url",
            image_url: { url: `data:${imageInput.mimeType};base64,${imageInput.data}`, detail: "auto" },
          },
        ],
      }
    : { role: "user", content: message };

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: sys },
    ...chatHistory,
    userMessage,
  ];

  const response = await openai.chat.completions.create({
    model,
    messages,
    ...(supportsCustomOpenAITemperature(model) ? { temperature: 0.4 } : {}),
    // 최신 OpenAI 모델(gpt-5.x 등)은 max_tokens를 거부하고 max_completion_tokens를 요구한다.
    max_completion_tokens: maxOutputTokens,
    ...(reasoningEffort
      ? { reasoning_effort: reasoningEffort as unknown as "low" | "medium" | "high" }
      : {}),
    ...(supportsJson ? { response_format: { type: "json_object" } } : {}),
  }, { timeout: UNIFIED_CHAT_PROVIDER_TIMEOUT_MS, maxRetries: 0 });

  const providerUsage = isOpenAIGpt6TextModel(model) ? parseOpenAIGpt6TextUsage(response.usage) : undefined;
  const inputTokens = providerUsage?.promptTokens ?? response.usage?.prompt_tokens;
  const outputTokens = providerUsage?.completionTokens ?? response.usage?.completion_tokens;
  const finishReason = String(response.choices?.[0]?.finish_reason || "");

  return {
    rawText: response.choices?.[0]?.message?.content || "",
    usage: {
      input: inputTokens || 0,
      output: outputTokens || 0,
    },
    ...(isOpenAIGpt6TextModel(model) ? { finishReason } : {}),
    ...(providerUsage ? { providerUsage } : {}),
  };
}

async function runQwenOmniTextChat(args: RunnerArgs): Promise<RunnerResult> {
  if (args.imageInput) {
    const error = new Error("qwen_omni_chat_image_input_not_enabled") as Error & { errorCode: string; status: number };
    error.errorCode = "MODEL_IMAGE_INPUT_UNSUPPORTED";
    error.status = 400;
    throw error;
  }
  const messages = [
    { role: "system", content: ensureJsonInstruction(args.systemPrompt) },
    ...(args.processedHistory || [])
      .filter((message) => message?.role === "user" || message?.role === "assistant")
      .map((message) => ({ role: message.role as "user" | "assistant", content: String(message.content ?? "") })),
    { role: "user", content: args.message },
  ];
  const result = await qwenOmniChat({
    messages,
    user: args.user,
    lifecycle: {
      onDispatch: args.onProviderDispatch,
      onResponse: args.onProviderResponse,
    },
  });
  const content = result.response.choices?.[0]?.message?.content;
  const rawText = String(content || "");
  const total = (direction: "input" | "output") =>
    Object.values(result.usage).reduce((sum, modality) => sum + Number(modality?.[direction] || 0), 0);
  return {
    rawText,
    usage: { input: total("input"), output: total("output") },
    providerUsage: result.providerUsage,
    billingUsage: result.usage,
  };
}

// xAI(Grok): OpenAI-compatible chat completions (response_format 지원 모델은 json_object 적용)
async function runGrokTextChat(args: RunnerArgs): Promise<RunnerResult> {
  const xai = await getPlatformXAIClient();
  const { model, systemPrompt, message, processedHistory, maxOutputTokens, imageInput } = args;
  const chatHistory: ChatCompletionMessageParam[] = (processedHistory || [])
    .filter((m) => m?.role === "user" || m?.role === "assistant")
    .map((msg) => ({ role: msg.role as "user" | "assistant", content: String(msg.content ?? "") }));

  const sys = ensureJsonInstruction(systemPrompt);

  const userMessage: ChatCompletionMessageParam = imageInput
    ? {
        role: "user",
        content: [
          { type: "text", text: message },
          {
            type: "image_url",
            image_url: { url: `data:${imageInput.mimeType};base64,${imageInput.data}`, detail: "auto" },
          },
        ],
      }
    : { role: "user", content: message };

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: sys },
    ...chatHistory,
    userMessage,
  ];

  const response = await xai.chat.completions.create({
    model,
    messages,
    temperature: 0.4,
    max_tokens: maxOutputTokens,
    ...(grokSupportsResponseFormatJsonObject(model) ? { response_format: { type: "json_object" } } : {}),
  }, { timeout: UNIFIED_CHAT_PROVIDER_TIMEOUT_MS, maxRetries: 0 });

  if (!hasValidXaiInputTokenCount(model, response.usage?.prompt_tokens)) {
    const error = new Error("xai_input_usage_unavailable") as Error & { errorCode: string; status: number };
    error.errorCode = "XAI_UPSTREAM_ERROR";
    error.status = 502;
    throw error;
  }

  return {
    rawText: response.choices?.[0]?.message?.content || "",
    usage: {
      input: response.usage?.prompt_tokens || 0,
      output: response.usage?.completion_tokens || 0,
    },
  };
}

async function runDeepSeekTextChat(args: RunnerArgs): Promise<RunnerResult> {
  const deepseek = await getPlatformDeepSeekClient();
  const { model, systemPrompt, message, processedHistory, maxOutputTokens, imageInput } = args;
  if (imageInput) {
    const err = new Error("model_image_input_unsupported") as Error & { errorCode: string; status: number };
    err.errorCode = "MODEL_IMAGE_INPUT_UNSUPPORTED";
    err.status = 400;
    throw err;
  }
  const chatHistory: ChatCompletionMessageParam[] = (processedHistory || [])
    .filter((m) => m?.role === "user" || m?.role === "assistant")
    .map((msg) => ({ role: msg.role as "user" | "assistant", content: String(msg.content ?? "") }));
  const userMessage: ChatCompletionMessageParam = { role: "user", content: message };

  const response = await deepseek.chat.completions.create({
    model,
    messages: [{ role: "system", content: ensureJsonInstruction(systemPrompt) }, ...chatHistory, userMessage],
    temperature: 0.4,
    max_tokens: maxOutputTokens,
    response_format: { type: "json_object" },
  }, { timeout: UNIFIED_CHAT_PROVIDER_TIMEOUT_MS, maxRetries: 0 });

  return {
    rawText: response.choices?.[0]?.message?.content || "",
    usage: {
      input: response.usage?.prompt_tokens || 0,
      output: response.usage?.completion_tokens || 0,
    },
  };
}

async function runZaiTextChat(args: RunnerArgs): Promise<RunnerResult> {
  const zai = await getPlatformZaiClient();
  const { model, systemPrompt, message, processedHistory, maxOutputTokens, imageInput } = args;
  if (imageInput && model === "glm-5.3") {
    const err = new Error("model_image_input_unsupported") as Error & { errorCode: string; status: number };
    err.errorCode = "MODEL_IMAGE_INPUT_UNSUPPORTED";
    err.status = 400;
    throw err;
  }
  const chatHistory: ChatCompletionMessageParam[] = (processedHistory || [])
    .filter((m) => m?.role === "user" || m?.role === "assistant")
    .map((msg) => ({ role: msg.role as "user" | "assistant", content: String(msg.content ?? "") }));
  const userMessage: ChatCompletionMessageParam = imageInput
    ? {
        role: "user",
        content: [
          { type: "text", text: message },
          {
            type: "image_url",
            image_url: { url: `data:${imageInput.mimeType};base64,${imageInput.data}`, detail: "auto" },
          },
        ],
      }
    : { role: "user", content: message };
  const reasoningEffort = await resolveSystemReasoningEffort({
    provider: "zai",
    modelName: model,
    modality: "text",
  });
  // zai GLM은 OpenAI 호환 스펙을 확장해 low/high/max만 허용한다(medium은 400).
  // SDK 타입은 low/medium/high만 선언하므로 경계에서 캐스팅한다.
  const zaiReasoningEffort = reasoningEffort as "" | "low" | "high" | "max";
  const response = await zai.chat.completions.create({
    model,
    messages: [{ role: "system", content: ensureJsonInstruction(systemPrompt) }, ...chatHistory, userMessage],
    temperature: 0.4,
    max_tokens: maxOutputTokens,
    response_format: { type: "json_object" },
    // 미지정 시 최대 강도로 동작해 단문 답변에도 응답이 수십 초 걸린다.
    // 값은 시스템 컨트롤(모델 카탈로그)에서 관리하며 조회 실패 시 코드 정책 기본값으로 떨어진다.
    // 미지원 모델(빈 문자열)에는 파라미터를 아예 붙이지 않는다(provider 400 회피).
    ...(zaiReasoningEffort
      ? { reasoning_effort: zaiReasoningEffort as unknown as "low" | "medium" | "high" }
      : {}),
  }, { timeout: UNIFIED_CHAT_PROVIDER_TIMEOUT_MS, maxRetries: 0 });
  return {
    rawText: response.choices?.[0]?.message?.content || "",
    usage: { input: response.usage?.prompt_tokens || 0, output: response.usage?.completion_tokens || 0 },
  };
}

async function runClaudeTextChat(args: RunnerArgs): Promise<RunnerResult> {
  const anthropic = await getPlatformAnthropicClient();
  const { model, systemPrompt, message, processedHistory, maxOutputTokens, imageInput } = args;
  const chatHistory: Anthropic.MessageParam[] = (processedHistory || [])
    .filter((m) => m?.role === "user" || m?.role === "assistant")
    .map((msg) => ({ role: msg.role as "user" | "assistant", content: String(msg.content ?? "") }));

  const userContent: Anthropic.MessageParam["content"] = imageInput
    ? [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: imageInput.mimeType,
            data: imageInput.data,
          },
        },
        { type: "text", text: message },
      ]
    : message;
  const messages: Anthropic.MessageParam[] = [...chatHistory, { role: "user" as const, content: userContent }];

  const response = await anthropic.messages.create({
    model,
    max_tokens: maxOutputTokens,
    ...(supportsCustomAnthropicTemperature(model) ? { temperature: 0.4 } : {}),
    system: systemPrompt,
    messages,
  }, { timeout: UNIFIED_CHAT_PROVIDER_TIMEOUT_MS, maxRetries: 0 });

  let responseText = "";
  for (const block of response.content) {
    if (block.type === "text") responseText += block.text;
  }

  return {
    rawText: responseText,
    usage: {
      input: response.usage?.input_tokens || 0,
      output: response.usage?.output_tokens || 0,
    },
  };
}

interface GeminiHistoryMessage {
  role: ModelScopeType;
  parts: { text: string }[];
}

async function runGeminiTextChat(args: RunnerArgs): Promise<RunnerResult> {
  const genAI = await getPlatformGoogleClient();
  const { model, systemPrompt, message, processedHistory, maxOutputTokens, imageInput } = args;

  const chatHistory: GeminiHistoryMessage[] = (processedHistory || [])
    .filter((m) => m?.role === "user" || m?.role === "assistant")
    .map((msg) => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: String(msg.content ?? "") }],
    }));

  const chat = genAI.chats.create({
    model,
    config: {
      systemInstruction: systemPrompt,
      safetySettings,
      responseMimeType: "application/json",
      ...(supportsCustomGeminiTemperature(model) ? { temperature: 0.2 } : {}),
      maxOutputTokens: maxOutputTokens,
      httpOptions: {
        timeout: UNIFIED_CHAT_PROVIDER_TIMEOUT_MS,
        retryOptions: { attempts: 1 },
      },
    },
    history: [...chatHistory],
  });

  const response = await chat.sendMessage({
    message: imageInput
      ? [createPartFromText(message), createPartFromBase64(imageInput.data, imageInput.mimeType)]
      : message,
  });

  const usageMeta = toUnknownRecord(response.usageMetadata);
  const promptTokens = Number(usageMeta.promptTokenCount || 0);
  // Gemini pricing의 output에는 thinking token이 포함된다.
  const completionTokens =
    Number(usageMeta.candidatesTokenCount || 0) + Number(usageMeta.thoughtsTokenCount || 0);

  return {
    rawText: response.text || "",
    usage: { input: promptTokens, output: completionTokens },
  };
}

const RUNNERS: Record<TextProviderType, (args: RunnerArgs) => Promise<RunnerResult>> = {
  openai: runOpenAITextChat,
  claude: runClaudeTextChat,
  google: runGeminiTextChat,
  xai: runGrokTextChat,
  deepseek: runDeepSeekTextChat,
  zai: runZaiTextChat,
};

const CLEAN_LABEL: Record<UnifiedTextProviderType, string> = {
  openai: "OpenAI",
  claude: "Claude",
  google: "Gemini",
  xai: "Grok",
  deepseek: "DeepSeek",
  zai: "Z.ai (GLM)",
  qwen: "Qwen",
};

// 통합 텍스트 챗 처리
// - pricing preflight / system prompt / history sanitize / provider call / parse + billing
export async function handleUnifiedTextChatRequest(provider: UnifiedTextProviderType, data: UnifiedChatRequest, user?: UnifiedChatUser) {
  const requestedModel = String(data?.modelName || data?.model || "").trim();
  const promptOptions = data?.options?.promptOptions;

  if (String(provider) === "qwen") {
    await assertQwenProviderCallReady({ modelName: requestedModel, modality: "text", user });
    if (requestedModel && requestedModel !== QWEN_OMNI_MODEL) {
      const error = new Error("unsupported_qwen_model") as Error & { errorCode: string; status: number };
      error.errorCode = "UNSUPPORTED_MODEL";
      error.status = 400;
      throw error;
    }
  }

  // modelName은 서버에서 반드시 요구 (클라 신뢰 금지)
  if (!requestedModel) {
    const err = new Error("modelName이 필요합니다.") as Error & { errorCode?: string; status?: number };
    err.errorCode = "MODEL_REQUIRED";
    err.status = 400;
    throw err;
  }

  await assertSystemModelSelectableOrThrow({
    provider,
    modelName: requestedModel,
    modality: "text",
    actor: { user },
  });

  const needsShortLongVariants =
    (provider === "google" && isGoogleProTextModel(requestedModel)) ||
    (provider === "xai" && isXaiLongContextTieredTextModel(requestedModel)) ||
    (provider === "openai" && isOpenAIGpt6TextModel(requestedModel));
  // 가격표 미설정 모델 차단 (fail-closed)
  await assertPricingPreflightOrThrow({
    provider: provider as BillableProviderType,
    modelName: requestedModel,
    modality: "text",
    kind: "token",
    variants: needsShortLongVariants ? ["short", "long"] : [undefined],
  });

  // upstream 실모델 ID로 변환
  const upstreamModel = resolveUpstreamModelName(provider, requestedModel);

  const { message, history, universeId, npcId, routeHint } = getSharedRequestBase(data);
  const { billToUniverse, app } = getBillingContext(routeHint);
  const imageInput =
    routeHint === "tutors" && data.imageInput ? (data.imageInput as ChatImageInputType) : undefined;
  if (imageInput) {
    await assertSystemModelSupportsImageInputOrThrow({
      provider,
      modelName: requestedModel,
    });
  }

  logger.log(`[API] UnifiedChat(${provider}):`, {
    model: requestedModel,
    upstreamModel,
    npcId,
    routeHint,
    messageLen: message.length,
    historyLen: history.length,
    imageAttached: Boolean(imageInput),
  });

  const universeTypeHint = user && user.__resolvedUniverseId === universeId ? user.__resolvedUniverseType : null;

  const serverSystemPrompt = await composeSystemPromptOrThrow({
    routeHint,
    universeId,
    npcId,
    user,
    promptOptions: promptOptions as Parameters<typeof composeSystemPromptOrThrow>[0]["promptOptions"],
    universeTypeHint,
  });
  const magazineContextPrompt = buildMagazineContextPrompt(data.magazineContext);
  const authoritativeSystemPrompt = magazineContextPrompt
    ? `${serverSystemPrompt}\n\n${magazineContextPrompt}`
    : serverSystemPrompt;
  // Tutors는 TUTORS-GATE-STT-DISCLOSURE가 닫힌 동안 text-only다.
  // 공유 helper가 직접 호출되거나 위조된 voiceInput이 전달돼도 음성 코칭/점수 prompt를 만들지 않는다.
  const voiceInputContext = routeHint === "tutors" ? "" : buildVoiceInputContext(data.voiceInput, message);

  const { processedHistory } = processAndCleanHistory(history, message, CLEAN_LABEL[provider]) as {
    processedHistory: ChatHistoryEntry[];
  };

  const runner = provider === "qwen" ? runQwenOmniTextChat : RUNNERS[provider];
  const operationId = String(data.operationId || "").trim().slice(0, 240);
  if (provider === "qwen" && !operationId) {
    const error = new Error("Qwen provider 호출에는 operationId가 필요합니다.") as Error & { errorCode: string; status: number };
    error.errorCode = "PROVIDER_OPERATION_ID_REQUIRED";
    error.status = 400;
    throw error;
  }
  const estimatedInputTokens = Math.max(
    1,
    Math.ceil(
      `${authoritativeSystemPrompt}\n${message}\n${processedHistory.map((item) => String(item.content || "")).join("\n")}`.length / 3,
    ),
  );
  const preflightMeta = {
    route: `${routeHint}/${provider}:preflight`,
    npcId,
    universeId,
    ...(operationId ? { operationId } : {}),
  };
  type UnifiedChatSuccess = {
    result: string;
    translation?: string;
    systemCode: string[];
    productCode: string[];
    isValidJson?: boolean;
    model: string;
    npcId: string;
    usage: IAiResponse["usage"];
    billing?: BillingSummary;
  };

  // server operationId 멱등성: 예약 → preflight → provider 호출 → 과금 → 결과 캐시
  // - 동일 operationId 처리 중 재요청: 409 PROVIDER_OPERATION_IN_PROGRESS
  // - 완료된 operationId 재요청: 캐시 결과 replay (provider 재호출·재과금 없음)
  const providerLease = operationId ? await claimProviderOperationOrThrow(operationId) : null;
  if (providerLease?.kind === "replay") {
    logger.log(`[API] UnifiedChat(${provider}): operationId replay`, { operationId });
    return providerLease.result as UnifiedChatSuccess;
  }

  let providerDispatchStarted = false;
  let providerResponseReceived = false;
  let providerFailureDisposition: ProviderOperationFailureDisposition | null = null;
  try {
    if (routeHint === "tutors") {
      await assertAIUsageBalanceOrThrow({
        uid: user?.uid || user?.ID || "",
        app,
        provider: provider as BillableProviderType,
        modelName: requestedModel,
        ...((provider === "xai" && isXaiLongContextTieredTextModel(requestedModel)) ||
        (provider === "openai" && isOpenAIGpt6TextModel(requestedModel))
          ? { variant: "long" }
          : {}),
        modality: "text",
        usage: { text: { input: estimatedInputTokens, output: MAX_OUTPUT_TOKENS } },
        meta: preflightMeta,
      });
    }

    let rawText = "";
    let usage: RunnerResult["usage"] = { input: 0, output: 0 };
    let finishReason: RunnerResult["finishReason"];
    let providerUsage: RunnerResult["providerUsage"];
    let modalityUsage: RunnerResult["billingUsage"];
    try {
      if (provider !== "qwen") providerDispatchStarted = true;
      ({ rawText, usage, finishReason, providerUsage, billingUsage: modalityUsage } = await runner({
        model: upstreamModel,
        systemPrompt: voiceInputContext ? `${authoritativeSystemPrompt}\n\n[Microphone input evidence]\n${voiceInputContext}` : authoritativeSystemPrompt,
        message,
        processedHistory,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        imageInput,
        ...(provider === "qwen"
          ? {
              user,
              onProviderDispatch: () => { providerDispatchStarted = true; },
              onProviderResponse: () => { providerResponseReceived = true; },
            }
          : {}),
      }));
      providerResponseReceived = true;
    } catch (error) {
      // fallback은 provider 호출 실패만 재시도한다. preflight·prompt·billing 오류와 구분하기 위한 내부 reason code다.
      const providerError = (
        error && typeof error === "object" ? error : new Error(String(error || "provider request failed"))
      ) as Error & { errorCode?: string; providerFailure?: boolean };
      providerFailureDisposition = classifyProviderOperationFailure({
        dispatchStarted: providerDispatchStarted,
        providerResponseReceived,
        error,
      });
      if (providerError.errorCode !== "OPENAI_USAGE_UNAVAILABLE") {
        providerError.providerFailure = true;
        if (!providerError.errorCode) providerError.errorCode = "AI_PROVIDER_REQUEST_FAILED";
      }
      throw providerError;
    }

    if (provider === "openai" && isOpenAIGpt6TextModel(requestedModel) && !rawText.trim() && finishReason === "length") {
      logger.warn("[API] UnifiedChat output_token_limit_reached", {
        provider: "openai",
        model: requestedModel,
        finishReason,
        providerUsage,
      });
      const error = new Error("출력 한도가 작아 답을 만들지 못했습니다. 한도를 늘려 다시 시도해 주세요.") as Error & {
        errorCode: string;
        status: number;
      };
      error.errorCode = "OUTPUT_TOKEN_LIMIT_REACHED";
      error.status = 422;
      throw error;
    }

    const parsed = parseAIResponse(rawText);

    // client-friendly usage 매핑
    const usageForClient: IAiResponse["usage"] = {
      promptTokens: usage.input,
      completionTokens: usage.output,
      totalTokens: usage.input + usage.output,
    };

    const variant =
      provider === "google" && isGoogleProTextModel(requestedModel)
        ? pickGeminiVariantByInputTokens(usage.input)
        : provider === "xai" && isXaiLongContextTieredTextModel(requestedModel)
          ? pickXaiPricingVariantByInputTokens(usage.input)
          : provider === "openai" && isOpenAIGpt6TextModel(requestedModel)
            ? pickOpenAIGpt6PricingVariantByInputTokens(usage.input)
        : undefined;

    // billing
    let billing: BillingSummary | undefined;
    if (billToUniverse) {
      const r: BillingResult = await billCommerceAIUsageOrThrow({
        universeId,
        app: COMMERCE_NAMESPACE_KEY,
        provider: provider as BillableProviderType,
        modelName: requestedModel,
        variant,
        usage: modalityUsage || { text: { input: usage.input, output: usage.output } },
        modality: "text",
        meta: {
          route: `${routeHint}/${provider}`,
          npcId,
          universeId,
          ...(operationId ? { operationId } : {}),
          ...(providerUsage ? { providerUsage } : {}),
        },
      });
      if (r && typeof r.coins === "number") billing = { ok: !!r.ok, coins: r.coins };
    } else {
      const r: BillingResult = await billAIUsageOrThrow({
        uid: user?.uid || user?.ID || "",
        app,
        provider: provider as BillableProviderType,
        modelName: requestedModel,
        variant,
        usage: modalityUsage || { text: { input: usage.input, output: usage.output } },
        modality: "text",
        meta: {
          route: `${routeHint}/${provider}`,
          npcId,
          universeId,
          ...(operationId ? { operationId } : {}),
          ...(providerUsage ? { providerUsage } : {}),
        },
        skipWhenNoUid: true,
      });
      if (r && typeof r.coins === "number") billing = { ok: !!r.ok, coins: r.coins };
    }

    const success: UnifiedChatSuccess = {
      result: parsed.message,
      translation: parsed.translation,
      systemCode: parsed.systemCode || [],
      productCode: parsed.productCode || [],
      isValidJson: parsed.isValid,
      model: requestedModel,
      npcId,
      usage: usageForClient,
      billing,
    };

    await providerLease?.complete(success);
    return success;
  } catch (error) {
    if (providerLease?.kind === "reserved" && !providerLease.isTerminal()) {
      const disposition =
        providerFailureDisposition ??
        classifyProviderOperationFailure({ dispatchStarted: providerDispatchStarted, providerResponseReceived, error });
      if (disposition === "release") await providerLease.release();
      else await providerLease.markUnresolved(disposition);
    }
    throw error;
  }
}
