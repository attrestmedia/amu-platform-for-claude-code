import "server-only";
import type { ChatCompletionMessageParam } from "openai/resources/index.mjs";
import type { TranscriptionCreateParamsNonStreaming } from "openai/resources/audio/transcriptions.mjs";
import { toFile } from "openai/uploads";
import {
  OPENAI_DEFAULT_AUDIO_ANALYSIS_MODEL,
  OPENAI_GPT_AUDIO_CANDIDATE_MODEL,
  OPENAI_GPT_TRANSCRIBE_CANDIDATE_MODEL,
  OPENAI_DEFAULT_STT_MODEL,
  OPENAI_DEFAULT_TTS_MODEL,
} from "consts/ai/voiceCatalog";
import { resolveUpstreamModelName } from "consts/ai/modelRole";
import { getPlatformOpenAIClient } from "libs/server-utils/secure/platformAiClients";
import type { ITokenUsageBreakdown } from "types/payment";
import { parseJsonSafe } from "utils/data";
import { toUnknownRecord } from "utils/common/typeUtils";
import { resolveSpeechSynthesisContentType } from "../guards";
import type {
  IResolvedVoiceProfile,
  ISpeechPronunciationAssessment,
  ISpeechSynthesizeProviderResult,
  ISpeechTranscribeProviderResult,
  IValidatedSpeechAudioInput,
  SpeechSynthesisFormat,
} from "../types";

type TranscriptionLogprob = { token?: string; logprob?: number };

function resolveConfidence(logprobs?: TranscriptionLogprob[]) {
  if (!Array.isArray(logprobs) || logprobs.length === 0) return undefined;
  const values = logprobs
    .map((item) => (typeof item?.logprob === "number" ? Math.exp(item.logprob) : NaN))
    .filter((value) => Number.isFinite(value));
  if (values.length === 0) return undefined;
  const avg = values.reduce((sum, value) => sum + Number(value), 0) / values.length;
  return Math.max(0, Math.min(1, Number(avg.toFixed(4))));
}

function resolveAcousticEvidence(logprobs?: TranscriptionLogprob[]) {
  if (!Array.isArray(logprobs) || logprobs.length === 0) return undefined;

  const unclearTokens = logprobs
    .map((item) => ({
      text: String(item?.token || "").trim(),
      confidence: typeof item?.logprob === "number" ? Math.exp(item.logprob) : NaN,
    }))
    .filter(
      (item) =>
        item.text && /[\p{L}\p{N}]/u.test(item.text) && Number.isFinite(item.confidence) && item.confidence < 0.85,
    )
    .sort((a, b) => a.confidence - b.confidence)
    .slice(0, 8)
    .map((item) => ({ text: item.text.slice(0, 40), confidence: Number(item.confidence.toFixed(3)) }));

  return unclearTokens.length
    ? {
        basis: "transcription_logprobs",
        unclearTokens,
      }
    : undefined;
}

function clampAssessmentScore(value: unknown) {
  const score = Number(value);
  return Number.isFinite(score) ? Math.round(Math.max(0, Math.min(100, score))) : undefined;
}

function usageError(message: string, errorCode = "OPENAI_USAGE_UNAVAILABLE") {
  return Object.assign(new Error(message), { errorCode, status: 502 });
}

function safeUsageCount(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function parseOpenAIAudioChatUsage(value: unknown) {
  const usage = toUnknownRecord(value);
  const promptTokens = safeUsageCount(usage.prompt_tokens);
  const completionTokens = safeUsageCount(usage.completion_tokens);
  const totalTokens = safeUsageCount(usage.total_tokens);
  const promptDetails = toUnknownRecord(usage.prompt_tokens_details);
  const completionDetails = toUnknownRecord(usage.completion_tokens_details);
  const audioInputTokens = safeUsageCount(promptDetails.audio_tokens);
  const audioOutputTokens = safeUsageCount(completionDetails.audio_tokens);
  if (
    promptTokens === null ||
    completionTokens === null ||
    totalTokens === null ||
    promptTokens <= 0 ||
    completionTokens <= 0 ||
    totalTokens !== promptTokens + completionTokens ||
    audioInputTokens === null ||
    audioInputTokens <= 0 ||
    audioInputTokens > promptTokens ||
    (audioOutputTokens !== null && audioOutputTokens > completionTokens)
  ) {
    throw usageError("GPT-Audio usage does not match the documented modality totals.");
  }
  return {
    promptTokens,
    completionTokens,
    totalTokens,
    audioInputTokens,
    audioOutputTokens: audioOutputTokens || 0,
    promptDetails: {
      textTokens: safeUsageCount(promptDetails.text_tokens),
      audioTokens: audioInputTokens,
      cachedTokens: safeUsageCount(promptDetails.cached_tokens),
    },
    completionDetails: {
      textTokens: safeUsageCount(completionDetails.text_tokens),
      audioTokens: audioOutputTokens,
      reasoningTokens: safeUsageCount(completionDetails.reasoning_tokens),
    },
  };
}

function parseGPTTranscribeUsage(value: unknown):
  | { type: "duration"; seconds: number }
  | {
      type: "tokens";
      inputTokens: number;
      inputAudioTokens: number;
      inputTextTokens: number;
      outputTokens: number;
      totalTokens: number;
    } {
  const usage = toUnknownRecord(value);
  if (usage.type === "duration") {
    const seconds = Number(usage.seconds);
    if (!Number.isFinite(seconds) || seconds <= 0) throw usageError("GPT-Transcribe duration usage is missing or invalid.");
    return { type: "duration", seconds };
  }
  if (usage.type === "tokens") {
    const details = toUnknownRecord(usage.input_token_details);
    const inputTokens = safeUsageCount(usage.input_tokens);
    const inputAudioTokens = safeUsageCount(details.audio_tokens);
    const inputTextTokens = safeUsageCount(details.text_tokens);
    const outputTokens = safeUsageCount(usage.output_tokens);
    const totalTokens = safeUsageCount(usage.total_tokens);
    if (
      inputTokens === null ||
      inputAudioTokens === null ||
      inputTextTokens === null ||
      outputTokens === null ||
      totalTokens === null ||
      inputAudioTokens + inputTextTokens !== inputTokens ||
      totalTokens !== inputTokens + outputTokens
    ) {
      throw usageError("GPT-Transcribe token usage does not match its modality totals.");
    }
    return { type: "tokens", inputTokens, inputAudioTokens, inputTextTokens, outputTokens, totalTokens };
  }
  throw usageError("GPT-Transcribe did not return a supported usage variant.");
}

function sanitizeAssessmentList(value: unknown, limit: number, maxLength: number) {
  return Array.isArray(value)
    ? value
        .map((item) => String(item || "").trim().slice(0, maxLength))
        .filter(Boolean)
        .slice(0, limit)
    : [];
}

function parsePronunciationAssessment(rawText: string, modelName: string): ISpeechPronunciationAssessment {
  const cleaned = String(rawText || "")
    .trim()
    .replace(/^```(?:json)?\s*|\s*```$/gi, "");
  const direct = parseJsonSafe(cleaned);
  const extracted = direct || parseJsonSafe(cleaned.match(/\{[\s\S]*\}/)?.[0] || "");
  const record = toUnknownRecord(extracted);
  const uncertainWords = Array.isArray(record.uncertainWords)
    ? record.uncertainWords
        .map((item) => {
          const word = toUnknownRecord(item);
          return {
            word: String(word.word || "").trim().slice(0, 40),
            issue: String(word.issue || "").trim().slice(0, 160) || undefined,
            suggestion: String(word.suggestion || "").trim().slice(0, 160) || undefined,
          };
        })
        .filter((item) => item.word)
        .slice(0, 8)
    : [];

  return {
    provider: "openai",
    modelName,
    basis: "gpt_audio_direct",
    heardText: String(record.heardText || "").trim().slice(0, 1000) || undefined,
    detectedLanguage: String(record.detectedLanguage || "").trim().slice(0, 32) || undefined,
    summary:
      String(record.summary || "").trim().slice(0, 600) ||
      cleaned.slice(0, 600) ||
      "The recording was analyzed directly, but no detailed summary was returned.",
    overallScore: clampAssessmentScore(record.overallScore),
    clarityScore: clampAssessmentScore(record.clarityScore),
    fluencyScore: clampAssessmentScore(record.fluencyScore),
    paceScore: clampAssessmentScore(record.paceScore),
    intonationScore: clampAssessmentScore(record.intonationScore),
    strengths: sanitizeAssessmentList(record.strengths, 5, 240),
    improvements: sanitizeAssessmentList(record.improvements, 5, 240),
    uncertainWords,
  };
}

export async function openaiAnalyzeSpeechAudio(args: {
  audioBuffer: Buffer;
  format: "wav" | "mp3";
  modelName?: string;
  targetLanguage?: string;
  conversationContext?: string;
  durationMs?: number;
}): Promise<{
  assessment: ISpeechPronunciationAssessment;
  usage: ITokenUsageBreakdown;
  rawText: string;
  providerUsage?: Record<string, unknown>;
}> {
  const openai = await getPlatformOpenAIClient();
  const modelName = String(args.modelName || OPENAI_DEFAULT_AUDIO_ANALYSIS_MODEL).trim() || OPENAI_DEFAULT_AUDIO_ANALYSIS_MODEL;
  const upstreamModel = resolveUpstreamModelName("openai", modelName);
  const targetLanguage = String(args.targetLanguage || "").trim().slice(0, 32);
  const conversationContext = String(args.conversationContext || "").trim().slice(0, 1200);
  const instructions = [
    "Analyze the user's original voice recording directly as a language pronunciation coach.",
    targetLanguage ? `Target language: ${targetLanguage}.` : "Detect the spoken language.",
    conversationContext
      ? `The tutor's immediately preceding message is provided only as reference for the expected reply or practice phrase: ${conversationContext}`
      : "No preceding tutor message was provided.",
    "Evaluate only audible evidence: pronunciation clarity, fluency, pace, rhythm, stress, and intonation.",
    "Do not infer identity, ethnicity, health, age, gender, or personality.",
    "Do not invent phoneme or word problems that cannot be heard confidently.",
    "Scores are coaching estimates from 0 to 100, not standardized certification scores.",
    "Return JSON only with keys: heardText, detectedLanguage, summary, overallScore, clarityScore, fluencyScore, paceScore, intonationScore, strengths, improvements, uncertainWords.",
    "strengths and improvements are arrays of short strings.",
    "uncertainWords is an array of objects with word, issue, suggestion.",
  ].join("\n");
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: instructions },
    {
      role: "user",
      content: [
        { type: "text", text: "Listen to this recording and return the requested pronunciation analysis." },
        {
          type: "input_audio",
          input_audio: { data: args.audioBuffer.toString("base64"), format: args.format },
        },
      ],
    },
  ];
  const response = await openai.chat.completions.create({
    model: upstreamModel,
    messages,
    modalities: ["text"],
    temperature: 0.2,
    max_tokens: 900,
  });
  const rawText = String(response.choices?.[0]?.message?.content || "").trim();
  const candidateUsage = modelName === OPENAI_GPT_AUDIO_CANDIDATE_MODEL
    ? parseOpenAIAudioChatUsage(response.usage)
    : null;
  const promptTokens = candidateUsage?.promptTokens ?? Math.max(0, Number(response.usage?.prompt_tokens || 0));
  const completionTokens = candidateUsage?.completionTokens ?? Math.max(0, Number(response.usage?.completion_tokens || 0));
  const reportedAudioInputTokens = candidateUsage?.audioInputTokens ?? Math.max(0, Number(response.usage?.prompt_tokens_details?.audio_tokens || 0));
  const reportedAudioOutputTokens = candidateUsage?.audioOutputTokens ?? Math.max(0, Number(response.usage?.completion_tokens_details?.audio_tokens || 0));
  // Candidate metering always uses provider counts. Duration is never converted to an audio-token estimate.
  const estimatedAudioInputTokens = candidateUsage ? 0 : Math.ceil(Math.max(0, Number(args.durationMs || 0)) / 100);
  const audioInputTokens = candidateUsage ? reportedAudioInputTokens : reportedAudioInputTokens || Math.min(promptTokens, estimatedAudioInputTokens);
  const audioOutputTokens = reportedAudioOutputTokens;

  return {
    assessment: parsePronunciationAssessment(rawText, modelName),
    usage: {
      text: {
        input: Math.max(0, promptTokens - audioInputTokens),
        output: Math.max(0, completionTokens - audioOutputTokens),
      },
      audio: {
        input: audioInputTokens,
        output: audioOutputTokens,
      },
    },
    rawText,
    ...(candidateUsage ? {
      providerUsage: {
        contract: "openai.chat.completions.audio.v1",
        promptTokens: candidateUsage.promptTokens,
        completionTokens: candidateUsage.completionTokens,
        totalTokens: candidateUsage.totalTokens,
        promptTokensDetails: candidateUsage.promptDetails,
        completionTokensDetails: candidateUsage.completionDetails,
      },
    } : {}),
  };
}

export async function openaiTranscribeSpeech(args: {
  file: IValidatedSpeechAudioInput;
  modelName?: string;
  language?: string;
  prompt?: string;
}): Promise<ISpeechTranscribeProviderResult> {
  const openai = await getPlatformOpenAIClient();
  const modelName = String(args.modelName || OPENAI_DEFAULT_STT_MODEL).trim() || OPENAI_DEFAULT_STT_MODEL;
  const upstreamModel = resolveUpstreamModelName("openai", modelName);
  const upload = await toFile(args.file.buffer, args.file.filename, { type: args.file.mimeType });

  const isGPTTranscribeCandidate = modelName === OPENAI_GPT_TRANSCRIBE_CANDIDATE_MODEL;
  const response = isGPTTranscribeCandidate
    ? await openai.audio.transcriptions.create({
        file: upload,
        model: upstreamModel,
        prompt: args.prompt,
        response_format: "json",
        // New transcription models accept a list of language hints. Do not request unsupported logprobs.
        ...(args.language ? { languages: [args.language] } : {}),
      } as unknown as TranscriptionCreateParamsNonStreaming<"json">)
    : await openai.audio.transcriptions.create({
        file: upload,
        model: upstreamModel,
        language: args.language,
        prompt: args.prompt,
        include: ["logprobs"],
      });

  const candidateResponse = response as typeof response & { usage?: unknown; languages?: Array<{ code?: string }> };
  const candidateUsage = isGPTTranscribeCandidate ? parseGPTTranscribeUsage(candidateResponse.usage) : null;
  const logprobs = isGPTTranscribeCandidate ? undefined : response.logprobs as TranscriptionLogprob[] | undefined;

  return {
    transcript: String(response.text || "").trim(),
    language: args.language || candidateResponse.languages?.[0]?.code,
    confidence: resolveConfidence(logprobs),
    ...(candidateUsage?.type === "duration" ? { fixedUsage: { minutes: candidateUsage.seconds / 60 } } : {}),
    meta: {
      provider: "openai",
      upstreamModel,
      usageSource: isGPTTranscribeCandidate
        ? candidateUsage?.type === "duration" ? "provider_reported_duration" : "provider_reported_tokens"
        : "estimated_from_text",
      ...(candidateUsage ? {
        providerUsage: {
          contract: "openai.audio.transcriptions.usage.v1",
          ...candidateUsage,
          billableUnitReady: candidateUsage.type === "duration",
        },
      } : {}),
      acousticEvidence: resolveAcousticEvidence(logprobs),
    },
  };
}

export async function openaiSynthesizeSpeech(args: {
  text: string;
  modelName?: string;
  format?: SpeechSynthesisFormat;
  speed?: number;
  voiceProfile: IResolvedVoiceProfile;
}): Promise<ISpeechSynthesizeProviderResult> {
  const openai = await getPlatformOpenAIClient();
  const modelName = String(args.modelName || args.voiceProfile.modelName || OPENAI_DEFAULT_TTS_MODEL).trim() || OPENAI_DEFAULT_TTS_MODEL;
  const upstreamModel = resolveUpstreamModelName("openai", modelName);
  const format = args.format || "mp3";

  const response = await openai.audio.speech.create({
    input: args.text,
    model: upstreamModel,
    voice: args.voiceProfile.voiceId,
    instructions: args.voiceProfile.instructions,
    response_format: format,
    speed: args.speed,
  });

  const audioBuffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") || resolveSpeechSynthesisContentType(format);

  return {
    audioBuffer,
    contentType,
    bytes: audioBuffer.length,
    meta: {
      provider: "openai",
      upstreamModel,
      usageSource: "estimated_from_text",
      speed: args.speed,
    },
  };
}
