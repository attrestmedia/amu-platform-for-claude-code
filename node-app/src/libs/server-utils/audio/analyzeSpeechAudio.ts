import "server-only";
import { OPENAI_DEFAULT_AUDIO_ANALYSIS_MODEL } from "consts/ai/voiceCatalog";
import { estimateTokens } from "utils/ai/tokenUtils";
import { applySpeechBilling, preflightSpeechBilling } from "./billing";
import { assertSpeechAudioInputOrThrow, createSpeechError } from "./guards";
import { openaiAnalyzeSpeechAudio } from "./providers/openaiSpeech";
import { assertQwenPurposeForAudioOperation, QWEN_OMNI_MODEL } from "./providers/qwenSpeech";
import { QWEN_OMNI_AUDIO_CONSENT_PURPOSE_ID } from "consts/legal/voiceDataConsent";
import { assertSpeechCandidatePreApprovalGateOrThrow } from "./speechProviderPolicy";
import type {
  ISpeechAudioAnalysisResult,
  ISpeechBillingContext,
  ISpeechAudioInput,
  IValidatedSpeechAudioInput,
} from "./types";

const AUDIO_TOKENS_PER_SECOND_ESTIMATE = 10;
const ANALYSIS_MAX_OUTPUT_TOKENS = 900;

function resolveEstimatedUsage(file: { durationMs?: number }) {
  const durationSeconds = Math.max(1, Number(file.durationMs || 60_000) / 1000);
  return {
    text: {
      input: estimateTokens("Pronunciation analysis structured JSON instructions"),
      output: ANALYSIS_MAX_OUTPUT_TOKENS,
    },
    audio: {
      input: Math.ceil(durationSeconds * AUDIO_TOKENS_PER_SECOND_ESTIMATE),
      output: 0,
    },
  };
}

function validateAudioAnalysisFile(
  file: ISpeechAudioInput,
  maxDurationMs?: number,
): IValidatedSpeechAudioInput & { format: "wav" | "mp3" } {
  const validated = assertSpeechAudioInputOrThrow(file, { maxDurationMs });
  if (validated.format !== "wav" && validated.format !== "mp3") {
    throw createSpeechError(
      "gpt-audio 원음 분석은 WAV 또는 MP3 입력만 지원합니다.",
      "AUDIO_ANALYSIS_FORMAT_UNSUPPORTED",
      400,
      { format: validated.format },
    );
  }
  return validated as IValidatedSpeechAudioInput & { format: "wav" | "mp3" };
}

export async function preflightSpeechAudioAnalysis(args: {
  file: ISpeechAudioInput;
  maxDurationMs?: number;
  modelName?: string;
  billing?: ISpeechBillingContext;
}) {
  const validated = validateAudioAnalysisFile(args.file, args.maxDurationMs);
  const modelName = String(args.modelName || OPENAI_DEFAULT_AUDIO_ANALYSIS_MODEL).trim() || OPENAI_DEFAULT_AUDIO_ANALYSIS_MODEL;
  if (modelName === QWEN_OMNI_MODEL) assertQwenPurposeForAudioOperation(QWEN_OMNI_AUDIO_CONSENT_PURPOSE_ID);
  assertSpeechCandidatePreApprovalGateOrThrow({ provider: "openai", modelName });
  return preflightSpeechBilling({
    provider: "openai",
    modelName,
    usage: resolveEstimatedUsage(validated),
    billing: args.billing,
    meta: { operation: "speech_audio_analyze", preflight: true, durationMs: validated.durationMs },
  });
}

export async function analyzeSpeechAudio(args: {
  file: ISpeechAudioInput;
  maxDurationMs?: number;
  modelName?: string;
  targetLanguage?: string;
  conversationContext?: string;
  billing?: ISpeechBillingContext;
}): Promise<ISpeechAudioAnalysisResult> {
  const validated = validateAudioAnalysisFile(args.file, args.maxDurationMs);
  const modelName = String(args.modelName || OPENAI_DEFAULT_AUDIO_ANALYSIS_MODEL).trim() || OPENAI_DEFAULT_AUDIO_ANALYSIS_MODEL;
  if (modelName === QWEN_OMNI_MODEL) assertQwenPurposeForAudioOperation(QWEN_OMNI_AUDIO_CONSENT_PURPOSE_ID);

  assertSpeechCandidatePreApprovalGateOrThrow({ provider: "openai", modelName });
  await preflightSpeechBilling({
    provider: "openai",
    modelName,
    usage: resolveEstimatedUsage(validated),
    billing: args.billing,
    meta: { operation: "speech_audio_analyze", preflight: true, durationMs: validated.durationMs },
  });

  let result: Awaited<ReturnType<typeof openaiAnalyzeSpeechAudio>>;
  try {
    result = await openaiAnalyzeSpeechAudio({
      audioBuffer: validated.buffer,
      format: validated.format,
      modelName,
      targetLanguage: args.targetLanguage,
      conversationContext: args.conversationContext,
      durationMs: validated.durationMs,
    });
  } catch (error) {
    if (error && typeof error === "object") {
      (error as { audioAnalysisFallbackAllowed?: boolean }).audioAnalysisFallbackAllowed = true;
    }
    throw error;
  }
  const billing = await applySpeechBilling({
    provider: "openai",
    modelName,
    usage: result.usage,
    billing: args.billing,
    meta: {
      operation: "speech_audio_analyze",
      durationMs: validated.durationMs,
      filename: validated.filename,
      format: validated.format,
    },
  });

  return {
    assessment: result.assessment,
    usage: result.usage,
    billing,
    meta: {
      provider: "openai",
      modelName,
      format: validated.format,
      sizeBytes: validated.sizeBytes,
      durationMs: validated.durationMs,
      audioRetention: "transient",
      rawAudioStored: false,
      ...(result.providerUsage ? { providerUsage: result.providerUsage } : {}),
    },
  };
}
