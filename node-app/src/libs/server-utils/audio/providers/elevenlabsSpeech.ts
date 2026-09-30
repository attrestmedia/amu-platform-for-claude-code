import "server-only";

import {
  ELEVENLABS_DEFAULT_STT_MODEL,
  ELEVENLABS_DEFAULT_TTS_MODEL,
  ELEVENLABS_TTS_SPEED_RANGE,
} from "consts/ai/voiceCatalog";
import { getSpeechModelPolicy } from "consts/ai/speechModel";
import { createSpeechError } from "../guards";
import type {
  IResolvedVoiceProfile,
  ISpeechSynthesizeProviderResult,
  ISpeechTranscribeProviderResult,
  IValidatedSpeechAudioInput,
  SpeechProviderCallState,
  SpeechProviderError,
  SpeechSynthesisFormat,
} from "../types";

export const ELEVENLABS_API_BASE_URL = "https://api.elevenlabs.io/v1";
const ELEVENLABS_MAX_RESPONSE_BYTES = 25 * 1024 * 1024;
const ELEVENLABS_REQUEST_TIMEOUT_MS = 30_000;
const MAX_PROVIDER_ERROR_BODY_LENGTH = 600;

const MODEL_IDS: Record<string, string> = {
  "eleven-flash-v2-5": "eleven_flash_v2_5",
  "eleven-multilingual-v2": "eleven_multilingual_v2",
  "eleven-v3": "eleven_v3",
  "scribe-v2": "scribe_v2",
};

const MODEL_CHARACTER_LIMITS: Record<string, number> = {
  "eleven-flash-v2-5": 40_000,
  "eleven-multilingual-v2": 10_000,
  "eleven-v3": 5_000,
};

const OUTPUT_FORMATS: Partial<Record<SpeechSynthesisFormat, { upstream: string; contentType: string }>> = {
  // 22.05 kHz/32 kbps is the lowest documented MP3 profile and avoids silently selecting a paid tier.
  mp3: { upstream: "mp3_22050_32", contentType: "audio/mpeg" },
  opus: { upstream: "opus_48000_32", contentType: "audio/opus" },
  pcm: { upstream: "pcm_16000", contentType: "audio/pcm" },
  wav: { upstream: "pcm_16000", contentType: "audio/pcm" },
};

type FetchLike = typeof fetch;

function codedProviderError(
  message: string,
  errorCode: string,
  status: number,
  args: {
    providerCallState: SpeechProviderCallState;
    providerRequestId?: string;
    upstreamStatus?: number;
  },
) {
  const error = createSpeechError(message, errorCode, status, {
    provider: "elevenlabs",
    providerCallState: args.providerCallState,
    providerRequestId: args.providerRequestId,
    upstreamStatus: args.upstreamStatus,
  }) as SpeechProviderError;
  error.providerCallState = args.providerCallState;
  error.providerRequestId = args.providerRequestId;
  error.upstreamStatus = args.upstreamStatus;
  return error;
}

function resolveUpstreamModelId(modelName: string, role: "speech_tts" | "speech_stt") {
  const policy = getSpeechModelPolicy("elevenlabs", modelName);
  if (!policy || !policy.roles.includes(role)) {
    throw createSpeechError("ElevenLabs speech 모델이 승인 목록에 없습니다.", "UNSUPPORTED_SPEECH_MODEL", 400, {
      provider: "elevenlabs",
      modelName,
      role,
    });
  }
  const upstreamModelId = MODEL_IDS[modelName] || policy.documentedModelId;
  if (!upstreamModelId) {
    throw createSpeechError("ElevenLabs upstream 모델 ID가 확인되지 않았습니다.", "UPSTREAM_MODEL_ID_UNVERIFIED", 503, {
      provider: "elevenlabs",
      modelName,
    });
  }
  return upstreamModelId;
}

/** 자격증명 해석은 elevenlabsCredential.ts가 담당한다. 여기서는 주입받은 값의 형식만 본다. */
export function normalizeApiKey(apiKey: unknown) {
  const value = String(apiKey || "").trim();
  if (!value) {
    throw codedProviderError("ElevenLabs 자격증명이 구성되지 않았습니다.", "SPEECH_PROVIDER_CREDENTIAL_UNAVAILABLE", 503, {
      providerCallState: "not_sent",
    });
  }
  return value;
}

function normalizeVoiceId(voiceId: unknown) {
  const value = String(voiceId || "").trim();
  if (!value || !/^[A-Za-z0-9_-]{8,128}$/.test(value)) {
    throw createSpeechError("ElevenLabs voiceId 형식이 올바르지 않습니다.", "UNSUPPORTED_VOICE_ID", 400);
  }
  return value;
}

function normalizeSpeed(speed: unknown) {
  const value = speed == null ? 1 : Number(speed);
  if (!Number.isFinite(value) || value < ELEVENLABS_TTS_SPEED_RANGE.min || value > ELEVENLABS_TTS_SPEED_RANGE.max) {
    throw createSpeechError("ElevenLabs speed는 0.7에서 1.2 사이여야 합니다.", "INVALID_VOICE_SETTINGS", 400, {
      speed,
      min: ELEVENLABS_TTS_SPEED_RANGE.min,
      max: ELEVENLABS_TTS_SPEED_RANGE.max,
    });
  }
  return value;
}

function normalizeUnitInterval(value: unknown, field: string) {
  if (value == null) return undefined;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) {
    throw createSpeechError(`${field}는 0에서 1 사이여야 합니다.`, "INVALID_VOICE_SETTINGS", 400, { field });
  }
  return number;
}

function normalizeSpeechTag(value: unknown) {
  const tag = String(value || "")
    .trim()
    .replace(/^[\[]|[\]]$/g, "")
    .replace(/[^a-zA-Z0-9 _'-]/g, "")
    .trim()
    .slice(0, 48);
  return tag;
}

export function buildElevenLabsInputText(args: {
  text: string;
  modelName: string;
  speechIntent?: IResolvedVoiceProfile["speechIntent"];
}) {
  const text = String(args.text || "").trim();
  const intent = args.speechIntent || {};
  const tags = Array.from(
    new Set(
      [intent.emotion, intent.delivery, ...(intent.tags || [])]
        .map(normalizeSpeechTag)
        .filter(Boolean),
    ),
  ).slice(0, 3);

  if (args.modelName === "eleven-v3") {
    const pauseTag = intent.pause && intent.pause !== "none" ? `${intent.pause} pause` : "";
    const allTags = [...tags, normalizeSpeechTag(pauseTag)].filter(Boolean).slice(0, 4);
    return allTags.length ? `${allTags.map((tag) => `[${tag}]`).join(" ")} ${text}` : text;
  }

  if (tags.length > 0) {
    throw createSpeechError("v3 전용 표현 태그는 Eleven v3에서만 사용할 수 있습니다.", "UNSUPPORTED_SPEECH_INTENT", 400);
  }
  if (intent.pause === "none" || !intent.pause) return text;
  return `${text} <break time="${intent.pause === "long" ? "1.5" : "0.5"}s" />`;
}

function resolveTtsRequest(args: {
  text: string;
  modelName?: string;
  format?: SpeechSynthesisFormat;
  speed?: number;
  voiceProfile: IResolvedVoiceProfile;
}) {
  const modelName = String(args.modelName || args.voiceProfile.modelName || ELEVENLABS_DEFAULT_TTS_MODEL).trim();
  const upstreamModelId = resolveUpstreamModelId(modelName, "speech_tts");
  const format = OUTPUT_FORMATS[args.format || "mp3"];
  if (!format) {
    throw createSpeechError("ElevenLabs가 지원하지 않는 출력 포맷입니다.", "UNSUPPORTED_SPEECH_OUTPUT_FORMAT", 400, {
      format: args.format || "mp3",
    });
  }
  const settings = args.voiceProfile.settings || {};
  const speed = normalizeSpeed(args.speed ?? settings.speed);
  const voiceSettings = {
    stability: normalizeUnitInterval(settings.stability, "stability"),
    similarity_boost: normalizeUnitInterval(settings.similarityBoost, "similarityBoost"),
    style: normalizeUnitInterval(settings.style, "style"),
    use_speaker_boost: typeof settings.speakerBoost === "boolean" ? settings.speakerBoost : undefined,
    speed,
  };
  const text = buildElevenLabsInputText({
    text: args.text,
    modelName,
    speechIntent: args.voiceProfile.speechIntent,
  });
  const maxCharacters = MODEL_CHARACTER_LIMITS[modelName];
  if (maxCharacters && Array.from(text.normalize("NFC")).length > maxCharacters) {
    throw createSpeechError("선택한 ElevenLabs 모델의 문자 제한을 초과했습니다.", "TTS_MODEL_CHARACTER_LIMIT_EXCEEDED", 413, {
      modelName,
      maxCharacters,
    });
  }

  return {
    modelName,
    upstreamModelId,
    format,
    voiceId: normalizeVoiceId(args.voiceProfile.voiceId),
    speed,
    voiceSettings,
    languageCode: args.voiceProfile.locale?.split("-")[0] || undefined,
    text,
  };
}

function requestIdFromResponse(response: Response) {
  return response.headers.get("request-id") || response.headers.get("x-trace-id") || undefined;
}

async function readResponseBytes(response: Response, maxBytes: number) {
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new Error("RESPONSE_BYTES_EXCEEDED");
  }
  if (!response.body) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) throw new Error("RESPONSE_BYTES_EXCEEDED");
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maxBytes) throw new Error("RESPONSE_BYTES_EXCEEDED");
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total);
}

async function readErrorBody(response: Response) {
  try {
    return (await response.text()).slice(0, MAX_PROVIDER_ERROR_BODY_LENGTH);
  } catch {
    return "";
  }
}

function createRequestSignal() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ELEVENLABS_REQUEST_TIMEOUT_MS);
  return { controller, timeout };
}

export async function elevenLabsSynthesizeSpeech(args: {
  apiKey: string;
  text: string;
  modelName?: string;
  format?: SpeechSynthesisFormat;
  speed?: number;
  voiceProfile: IResolvedVoiceProfile;
  fetchImpl?: FetchLike;
}): Promise<ISpeechSynthesizeProviderResult> {
  const apiKey = normalizeApiKey(args.apiKey);
  const request = resolveTtsRequest(args);
  const fetchImpl = args.fetchImpl || fetch;
  const { controller, timeout } = createRequestSignal();
  let response: Response;
  try {
    response = await fetchImpl(
      `${ELEVENLABS_API_BASE_URL}/text-to-speech/${encodeURIComponent(request.voiceId)}?output_format=${encodeURIComponent(request.format.upstream)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "xi-api-key": apiKey },
        body: JSON.stringify({
          text: request.text,
          model_id: request.upstreamModelId,
          language_code: request.modelName === "eleven-multilingual-v2" ? undefined : request.languageCode,
          voice_settings: request.voiceSettings,
        }),
        signal: controller.signal,
      },
    );
  } catch {
    const timedOut = controller.signal.aborted;
    clearTimeout(timeout);
    throw codedProviderError(
      timedOut ? "ElevenLabs 음성 합성 시간이 초과되었습니다." : "ElevenLabs에 연결하지 못했습니다.",
      timedOut ? "SPEECH_PROVIDER_TIMEOUT" : "SPEECH_PROVIDER_CONNECTION_FAILED",
      503,
      { providerCallState: timedOut ? "unknown_outcome" : "not_sent" },
    );
  }
  const providerRequestId = requestIdFromResponse(response);
  if (!response.ok) {
    await readErrorBody(response);
    clearTimeout(timeout);
    throw codedProviderError("ElevenLabs 음성 합성 요청이 실패했습니다.", response.status === 429 ? "SPEECH_PROVIDER_RATE_LIMITED" : "SPEECH_PROVIDER_ERROR", response.status >= 500 || response.status === 429 ? 503 : 400, {
      providerCallState: "completed",
      providerRequestId,
      upstreamStatus: response.status,
    });
  }

  const contentType = String(response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!contentType.startsWith("audio/")) {
    clearTimeout(timeout);
    throw codedProviderError("ElevenLabs 응답 content-type이 오디오가 아닙니다.", "SPEECH_PROVIDER_INVALID_CONTENT_TYPE", 502, {
      providerCallState: "completed",
      providerRequestId,
      upstreamStatus: response.status,
    });
  }

  let audioBuffer: Buffer;
  try {
    audioBuffer = await readResponseBytes(response, ELEVENLABS_MAX_RESPONSE_BYTES);
  } catch {
    clearTimeout(timeout);
    throw codedProviderError("ElevenLabs 오디오 응답 용량이 허용 범위를 초과했습니다.", "SPEECH_PROVIDER_RESPONSE_TOO_LARGE", 502, {
      providerCallState: "completed",
      providerRequestId,
      upstreamStatus: response.status,
    });
  }
  clearTimeout(timeout);
  if (audioBuffer.length <= 0) {
    throw codedProviderError("ElevenLabs 오디오 응답이 비어 있습니다.", "SPEECH_PROVIDER_EMPTY_AUDIO", 502, {
      providerCallState: "completed",
      providerRequestId,
      upstreamStatus: response.status,
    });
  }

  const characterCostRaw = response.headers.get("character-cost")?.trim() || "";
  const characterCost = Number(characterCostRaw);
  const hasCharacterCost = Boolean(characterCostRaw) && Number.isFinite(characterCost) && characterCost >= 0;
  return {
    audioBuffer,
    contentType: contentType || request.format.contentType,
    bytes: audioBuffer.length,
    fixedUsage: hasCharacterCost ? { characters: Math.max(1, Math.ceil(characterCost)) } : undefined,
    meta: {
      provider: "elevenlabs",
      upstreamModel: request.upstreamModelId,
      providerRequestId,
      upstreamStatus: response.status,
      providerCallState: "completed",
      usageUnit: "character",
      usageSource: hasCharacterCost ? "provider_reported" : "amu_counted",
      outputFormat: request.format.upstream,
      bytes: audioBuffer.length,
      speed: request.speed,
    },
  };
}

export async function elevenLabsTranscribeSpeech(args: {
  apiKey: string;
  file: IValidatedSpeechAudioInput;
  modelName?: string;
  language?: string;
  fetchImpl?: FetchLike;
}): Promise<ISpeechTranscribeProviderResult> {
  const apiKey = normalizeApiKey(args.apiKey);
  const modelName = String(args.modelName || ELEVENLABS_DEFAULT_STT_MODEL).trim();
  const upstreamModelId = resolveUpstreamModelId(modelName, "speech_stt");
  if (args.file.durationSource !== "server" || !args.file.actualDurationMs || args.file.actualDurationMs <= 0) {
    throw createSpeechError("ElevenLabs STT 과금에 필요한 서버 측 오디오 길이를 확인할 수 없습니다.", "AUDIO_DURATION_UNAVAILABLE", 400, {
      durationSource: args.file.durationSource,
    });
  }

  const form = new FormData();
  form.set("file", new Blob([new Uint8Array(args.file.buffer)], { type: args.file.mimeType }), args.file.filename);
  form.set("model_id", upstreamModelId);
  if (args.language) form.set("language_code", args.language);

  const { controller, timeout } = createRequestSignal();
  const fetchImpl = args.fetchImpl || fetch;
  let response: Response;
  try {
    response = await fetchImpl(`${ELEVENLABS_API_BASE_URL}/speech-to-text`, {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body: form,
      signal: controller.signal,
    });
  } catch {
    const timedOut = controller.signal.aborted;
    clearTimeout(timeout);
    throw codedProviderError(
      timedOut ? "ElevenLabs 음성 전사 시간이 초과되었습니다." : "ElevenLabs에 연결하지 못했습니다.",
      timedOut ? "SPEECH_PROVIDER_TIMEOUT" : "SPEECH_PROVIDER_CONNECTION_FAILED",
      503,
      { providerCallState: timedOut ? "unknown_outcome" : "not_sent" },
    );
  }
  const providerRequestId = requestIdFromResponse(response);
  if (!response.ok) {
    await readErrorBody(response);
    clearTimeout(timeout);
    throw codedProviderError("ElevenLabs 음성 전사 요청이 실패했습니다.", response.status === 429 ? "SPEECH_PROVIDER_RATE_LIMITED" : "SPEECH_PROVIDER_ERROR", response.status >= 500 || response.status === 429 ? 503 : 400, {
      providerCallState: "completed",
      providerRequestId,
      upstreamStatus: response.status,
    });
  }

  const contentType = String(response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (contentType && contentType !== "application/json") {
    clearTimeout(timeout);
    throw codedProviderError("ElevenLabs 전사 응답 content-type이 JSON이 아닙니다.", "SPEECH_PROVIDER_INVALID_CONTENT_TYPE", 502, {
      providerCallState: "completed",
      providerRequestId,
      upstreamStatus: response.status,
    });
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await response.json()) as Record<string, unknown>;
  } catch {
    clearTimeout(timeout);
    throw codedProviderError("ElevenLabs 전사 응답을 해석할 수 없습니다.", "SPEECH_PROVIDER_INVALID_RESPONSE", 502, {
      providerCallState: "completed",
      providerRequestId,
      upstreamStatus: response.status,
    });
  }
  clearTimeout(timeout);

  const transcript = String(payload.text || "").trim();
  const languageCode = String(payload.language_code || args.language || "").trim() || undefined;
  const languageProbability = Number(payload.language_probability);
  const providerSeconds = args.file.actualDurationMs / 1000;
  return {
    transcript,
    language: languageCode,
    confidence: Number.isFinite(languageProbability) ? Math.max(0, Math.min(1, languageProbability)) : undefined,
    fixedUsage: { seconds: providerSeconds },
    meta: {
      provider: "elevenlabs",
      upstreamModel: upstreamModelId,
      providerRequestId,
      upstreamStatus: response.status,
      providerCallState: "completed",
      usageUnit: "audio_second",
      usageSource: "amu_counted",
      actualDurationMs: args.file.actualDurationMs,
      speakerDiarizationPresent: Array.isArray(payload.words) && (payload.words as unknown[]).some((item) => {
        return item && typeof item === "object" && "speaker_id" in item;
      }),
    },
  };
}
