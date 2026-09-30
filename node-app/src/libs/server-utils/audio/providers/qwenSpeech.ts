import "server-only";
import { CURRENT_ACCOUNT_POLICY } from "consts/legal/accountPolicy";
import {
  QWEN_ASR_AUDIO_CONSENT_PURPOSE_ID,
  QWEN_OMNI_AUDIO_CONSENT_PURPOSE_ID,
  isQwenPrivacyPolicyReleaseReady,
  type QwenModelStudioConsentPurposeId,
} from "consts/legal/voiceDataConsent";
import {
  QWEN_MODEL_STUDIO_DASHSCOPE_BASE_URL,
  QWEN_MODEL_STUDIO_OPENAI_COMPATIBLE_BASE_URL,
} from "libs/server-utils/secure/qwenCredentialVerification";
import { getPlatformQwenOpenAIClient } from "libs/server-utils/secure/platformAiClients";
import { listSystemModelCatalog } from "libs/server-utils/api/systemModelControl";
import {
  canSelectSystemModel,
  getSystemModelSelectionBlockReason,
  resolveSystemModelAccessActor,
} from "libs/server-utils/ai/systemModelAccess";
import { assertQwenPurposeConsent } from "libs/server-utils/audio/qwenPurposeConsent";
import { resolvePlatformCredential } from "libs/server-utils/secure/platformCredentialResolver";
import type { ITokenUsageBreakdown } from "types/payment";
import type { IValidatedSpeechAudioInput } from "../types";
import { toUnknownRecord } from "utils/common/typeUtils";

export const QWEN_OMNI_MODEL = "qwen3.8-omni-flash" as const;
export const QWEN_IMAGE_MODEL = "qwen-image-3.0-pro" as const;
export const QWEN_ASR_MODEL = "qwen-audio-3.1-asr-flash" as const;
export const QWEN_PROVIDER_TIMEOUT_MS = 150_000;
export const QWEN_ASR_MAX_AUDIO_BYTES = 10 * 1024 * 1024;
export const QWEN_ASR_MAX_DURATION_MS = 5 * 60 * 1000;
const QWEN_ASR_DATA_URL_PREFIX = "data:audio/wav;base64,";

type QwenRuntimeCredential = {
  payload: Record<string, string> & { apiKey: string; endpointKind: "model_studio_singapore_payg" };
  version: number;
};

/** Release 2 runtime allowlist; admin, privacy, consent, and active-credential gates still apply. */
export const QWEN_RUNTIME_RELEASED_MODELS: readonly string[] = [
  "qwen3.8-omni-flash",
  "qwen-image-3.0-pro",
  "qwen-audio-3.1-asr-flash",
];

function qwenError(message: string, errorCode: string, status = 503, detail?: Record<string, unknown>) {
  return Object.assign(new Error(message), {
    errorCode,
    status,
    ...(detail ? { detail } : {}),
    ...(detail?.providerCallState ? { providerCallState: detail.providerCallState } : {}),
  });
}

function readCount(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

async function assertQwenSpeechLaunchAccess(args: {
  modelName: string;
  modality: "text" | "image" | "audio";
  user?: unknown;
}) {
  const catalog = await listSystemModelCatalog();
  const item = catalog.find(
    (candidate) =>
      candidate.provider === "qwen" && candidate.modelName === args.modelName && candidate.modality === args.modality,
  );
  if (!item) {
    throw qwenError("Qwen speech model is not enabled in the system catalog.", "MODEL_DISABLED", 403, {
      provider: "qwen",
      modelName: args.modelName,
      modality: args.modality,
    });
  }
  const access = resolveSystemModelAccessActor(args.user);
  if (canSelectSystemModel(item, access)) return;
  const blockReason = getSystemModelSelectionBlockReason(item, access);
  if (blockReason === "administrator_required") {
    throw qwenError("Qwen speech model requires administrator access.", "MODEL_NOT_SELECTABLE", 403, {
      provider: "qwen",
      modelName: args.modelName,
      modality: args.modality,
    });
  }
  throw qwenError("Qwen speech model is not enabled in the system catalog.", "MODEL_DISABLED", 403, {
    provider: "qwen",
    modelName: args.modelName,
    modality: args.modality,
  });
}

/** D3 release and purpose-consent gate consumed by every Qwen user-data branch. */
export async function assertQwenProviderCallReady(args: {
  modelName: string;
  modality: "text" | "image" | "audio";
  user?: unknown;
  purposeId?: QwenModelStudioConsentPurposeId;
}) {
  await assertQwenSpeechLaunchAccess({ modelName: args.modelName, modality: args.modality, user: args.user });
  if (args.purposeId) assertQwenPurposeConsent({ purposeId: args.purposeId, user: args.user });
  const privacyVersion = CURRENT_ACCOUNT_POLICY.privacy.version;
  if (!isQwenPrivacyPolicyReleaseReady(privacyVersion)) {
    throw qwenError("Qwen 개인정보 공개·효력 및 WordPress parity 게이트가 닫혀 있습니다.", "QWEN_PURPOSE_CONSENT_UNAVAILABLE", 423);
  }
  if (!QWEN_RUNTIME_RELEASED_MODELS.includes(args.modelName)) {
    throw qwenError("Qwen 모델별 가격·entitlement·usage smoke가 승인되지 않아 호출할 수 없습니다.", "QWEN_RUNTIME_NOT_READY");
  }
  const credential = await resolvePlatformCredential("ai.qwen.default");
  const payload = toUnknownRecord(credential.payload);
  if (payload.endpointKind !== "model_studio_singapore_payg") {
    throw qwenError("레거시 Qwen endpoint 자격증명은 런타임에서 사용할 수 없습니다.", "QWEN_LEGACY_ENDPOINT_BLOCKED", 409);
  }
  if (typeof payload.apiKey !== "string" || !payload.apiKey.trim()) {
    throw qwenError("Model Studio PAYG 자격증명에 API key가 없습니다.", "PLATFORM_CREDENTIAL_UNAVAILABLE");
  }
  return {
    ...credential,
    payload: { ...credential.payload, endpointKind: "model_studio_singapore_payg", apiKey: payload.apiKey },
  } as QwenRuntimeCredential;
}

function sumModalityCounts(value: Record<string, unknown>) {
  const fields = ["text_tokens", "audio_tokens", "image_tokens", "video_tokens"] as const;
  const counts = Object.fromEntries(fields.map((field) => [field, readCount(value[field])])) as Record<(typeof fields)[number], number | null>;
  if (fields.some((field) => counts[field] === null)) return null;
  return { counts, total: fields.reduce((sum, field) => sum + Number(counts[field]), 0) };
}

/** Aggregate and modality details must agree; absent/partial usage is not billing evidence. */
export function parseQwenOmniUsage(value: unknown): ITokenUsageBreakdown {
  const usage = toUnknownRecord(value);
  const promptTokens = readCount(usage.prompt_tokens);
  const completionTokens = readCount(usage.completion_tokens);
  const totalTokens = readCount(usage.total_tokens);
  const promptDetails = sumModalityCounts(toUnknownRecord(usage.prompt_tokens_details));
  const completionDetails = sumModalityCounts(toUnknownRecord(usage.completion_tokens_details));
  if (
    promptTokens === null || completionTokens === null || totalTokens === null ||
    promptTokens <= 0 || totalTokens !== promptTokens + completionTokens ||
    !promptDetails || !completionDetails ||
    promptDetails.total !== promptTokens || completionDetails.total !== completionTokens
  ) {
    throw qwenError("Qwen Omni가 완전하고 합계가 일치하는 modality usage를 반환하지 않았습니다.", "QWEN_USAGE_UNAVAILABLE", 502);
  }
  return {
    text: { input: promptDetails.counts.text_tokens || 0, output: completionDetails.counts.text_tokens || 0 },
    audio: { input: promptDetails.counts.audio_tokens || 0, output: completionDetails.counts.audio_tokens || 0 },
    image: { input: promptDetails.counts.image_tokens || 0, output: completionDetails.counts.image_tokens || 0 },
    video: { input: promptDetails.counts.video_tokens || 0, output: completionDetails.counts.video_tokens || 0 },
  };
}

export function buildQwenImageGenerationRequest(prompt: string) {
  const normalizedPrompt = String(prompt || "").trim();
  if (!normalizedPrompt) throw qwenError("Qwen Image prompt가 필요합니다.", "INVALID_INPUT", 400);
  // D1 COGS covers text-to-image at 1K only; references, edits, and higher resolutions are excluded.
  return { model: QWEN_IMAGE_MODEL, prompt: normalizedPrompt, size: "1024*1024", n: 1 } as const;
}

export function parseQwenAsrUsage(value: unknown, fallbackDurationSeconds?: number): {
  usage: ITokenUsageBreakdown;
  durationSeconds: number;
  providerUsage: Record<string, unknown>;
} {
  const usage = toUnknownRecord(value);
  const inputTokens = readCount(usage.input_tokens);
  const outputTokens = readCount(usage.output_tokens);
  const totalTokens = readCount(usage.total_tokens);
  const providerDurationSeconds = Number(usage.duration);
  const durationSeconds = Number.isFinite(providerDurationSeconds) && providerDurationSeconds > 0
    ? providerDurationSeconds
    : Number(fallbackDurationSeconds);
  if (
    inputTokens === null || outputTokens === null || totalTokens === null ||
    inputTokens <= 0 || totalTokens !== inputTokens + outputTokens ||
    !Number.isFinite(durationSeconds) || durationSeconds <= 0
  ) {
    throw qwenError("Qwen ASR response token usage is missing or inconsistent.", "QWEN_USAGE_UNAVAILABLE", 502, {
      providerCallState: "completed",
    });
  }
  return {
    usage: { audio: { input: inputTokens }, text: { output: outputTokens } },
    durationSeconds,
    providerUsage: {
      contract: "qwen.asr.3.1.usage.v1",
      inputTokens,
      outputTokens,
      totalTokens,
      durationSeconds,
      durationSource: providerDurationSeconds > 0 ? "provider" : "server_audio_header",
    },
  };
}

export function buildQwenAsrSyncRequest(dataUrl: string, sampleRate: number) {
  const normalizedDataUrl = String(dataUrl || "").trim();
  if (!normalizedDataUrl.startsWith(QWEN_ASR_DATA_URL_PREFIX) || !Number.isSafeInteger(sampleRate) || sampleRate < 8_000 || sampleRate > 192_000) {
    throw qwenError("Qwen ASR requires a valid WAV Data URL and sample rate.", "INVALID_INPUT", 400);
  }
  return {
    model: QWEN_ASR_MODEL,
    input: {
      messages: [{
        role: "user",
        content: [{ type: "input_audio", input_audio: { data: normalizedDataUrl } }],
      }],
    },
    parameters: { format: "wav", sample_rate: String(sampleRate) },
  } as const;
}

/** Computes encoded Data URL size without allocating the base64 string. */
export function getQwenAsrDataUrlByteLength(buffer: Buffer) {
  return Buffer.byteLength(QWEN_ASR_DATA_URL_PREFIX, "utf8") + Math.ceil(buffer.length / 3) * 4;
}

function readQwenWavSampleRate(buffer: Buffer) {
  if (buffer.length < 12 || buffer.subarray(0, 4).toString("ascii") !== "RIFF" || buffer.subarray(8, 12).toString("ascii") !== "WAVE") {
    throw qwenError("Qwen ASR currently accepts validated WAV input only.", "UNSUPPORTED_AUDIO_FORMAT", 400);
  }
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.subarray(offset, offset + 4).toString("ascii");
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const payloadStart = offset + 8;
    const payloadEnd = payloadStart + chunkSize;
    if (payloadEnd > buffer.length) break;
    if (chunkId === "fmt " && chunkSize >= 16) {
      const sampleRate = buffer.readUInt32LE(payloadStart + 4);
      if (sampleRate >= 8_000 && sampleRate <= 192_000) return sampleRate;
      break;
    }
    offset = payloadEnd + (chunkSize % 2);
  }
  throw qwenError("Qwen ASR could not read the WAV sample rate.", "INVALID_AUDIO_HEADER", 400);
}

function annotateQwenProviderCallState(error: unknown, state: "not_sent" | "completed" | "unknown_outcome") {
  const target = error instanceof Error ? error : new Error(String(error || "Qwen request failed."));
  Object.assign(target, { providerCallState: state });
  return target;
}

function classifyQwenHttpFailure(status: number, operation: string) {
  const error = status === 401
    ? qwenError(`Qwen ${operation} credentials were rejected.`, "QWEN_AUTH_REJECTED", 502)
    : status === 403
      ? qwenError(`Qwen ${operation} model entitlement is unavailable.`, "QWEN_MODEL_ENTITLEMENT_UNAVAILABLE", 502)
      : status === 429
        ? qwenError(`Qwen ${operation} provider quota is exhausted.`, "QWEN_PROVIDER_RATE_LIMITED", 429)
        : qwenError(`Qwen ${operation} upstream request failed.`, status >= 500 ? "QWEN_UPSTREAM_UNAVAILABLE" : "QWEN_UPSTREAM_REJECTED", 502);
  Object.assign(error, { upstreamStatus: status, providerCallState: "unknown_outcome" as const });
  throw error;
}

/** Native synchronous Model Studio endpoint; audio stays in the request as a base64 Data URL. */
export async function qwenTranscribeSpeech(
  file: IValidatedSpeechAudioInput,
  user?: unknown,
  lifecycle?: { onDispatch?: () => void; onResponse?: () => void },
) {
  if (!file.buffer.length) throw qwenError("Qwen ASR audio input is empty.", "EMPTY_AUDIO", 400);
  if (
    file.sizeBytes > QWEN_ASR_MAX_AUDIO_BYTES ||
    file.actualDurationMs === undefined ||
    file.actualDurationMs >= QWEN_ASR_MAX_DURATION_MS
  ) {
    throw qwenError("Qwen ASR accepts audio shorter than 5 minutes and an encoded Data URL up to 10 MiB.", "QWEN_ASR_INPUT_LIMIT_EXCEEDED", 400);
  }
  if (file.format !== "wav" || file.durationSource !== "server" || !file.actualDurationMs) {
    throw qwenError("Qwen ASR requires WAV input with server-verified duration.", "QWEN_ASR_AUDIO_VALIDATION_REQUIRED", 400);
  }
  const sampleRate = readQwenWavSampleRate(file.buffer);
  if (getQwenAsrDataUrlByteLength(file.buffer) > QWEN_ASR_MAX_AUDIO_BYTES) {
    throw qwenError("Qwen ASR encoded Data URL exceeds 10 MB.", "QWEN_ASR_INPUT_LIMIT_EXCEEDED", 400);
  }
  const dataUrl = `${QWEN_ASR_DATA_URL_PREFIX}${file.buffer.toString("base64")}`;
  const request = buildQwenAsrSyncRequest(dataUrl, sampleRate);
  const credential = await assertQwenProviderCallReady({
    modelName: QWEN_ASR_MODEL,
    modality: "audio",
    user,
    purposeId: QWEN_ASR_AUDIO_CONSENT_PURPOSE_ID,
  });
  const endpoint = `${QWEN_MODEL_STUDIO_DASHSCOPE_BASE_URL.replace(/\/+$/, "")}/services/aigc/multimodal-generation/generation`;
  lifecycle?.onDispatch?.();
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(QWEN_PROVIDER_TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${credential.payload.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-DashScope-SSE": "disable",
      },
      body: JSON.stringify(request),
    });
  } catch (error) {
    throw annotateQwenProviderCallState(error, "unknown_outcome");
  }
  if (!response.ok) classifyQwenHttpFailure(response.status, "ASR");
  lifecycle?.onResponse?.();

  const body = toUnknownRecord(await response.json().catch(() => null));
  const output = toUnknownRecord(body.output);
  const transcript = String(output.text || toUnknownRecord(output.sentence).text || "").trim();
  if (!transcript) {
    throw qwenError("Qwen ASR response did not include transcript text.", "QWEN_RESPONSE_INVALID", 502, {
      providerCallState: "completed",
    });
  }
  const parsedUsage = parseQwenAsrUsage(body.usage, file.actualDurationMs / 1000);
  return {
    transcript,
    language: undefined,
    confidence: undefined,
    usage: parsedUsage.usage,
    fixedUsage: undefined,
    meta: {
      usageSource: "provider_reported_tokens",
      providerUsage: parsedUsage.providerUsage,
      requestId: String(body.request_id || "") || undefined,
      transport: "dashscope_sync_base64",
    },
  };
}

export async function qwenOmniChat(args: {
  messages: unknown[];
  user?: unknown;
  purposeId?: QwenModelStudioConsentPurposeId;
  lifecycle?: { onDispatch?: () => void; onResponse?: () => void };
}) {
  if (!args.lifecycle?.onDispatch || !args.lifecycle.onResponse) {
    throw qwenError("Qwen Omni must run inside a provider operation guard.", "PROVIDER_OPERATION_GUARD_REQUIRED", 400);
  }
  await assertQwenProviderCallReady({
    modelName: QWEN_OMNI_MODEL,
    modality: "text",
    user: args.user,
    purposeId: args.purposeId,
  });
  const client = await getPlatformQwenOpenAIClient();
  args.lifecycle?.onDispatch?.();
  let response: Awaited<ReturnType<typeof client.chat.completions.create>>;
  try {
    response = await client.chat.completions.create({ model: QWEN_OMNI_MODEL, messages: args.messages as never[] });
  } catch (error) {
    throw annotateQwenProviderCallState(error, "unknown_outcome");
  }
  args.lifecycle?.onResponse?.();
  let usage: ITokenUsageBreakdown;
  try {
    usage = parseQwenOmniUsage(response.usage);
  } catch (error) {
    throw annotateQwenProviderCallState(error, "completed");
  }
  return { response, usage, providerUsage: { contract: "qwen.omni.usage.v1", ...usage } };
}

export async function qwenAnalyzeOmniAudio(args: {
  messages: unknown[];
  user?: unknown;
  lifecycle: { onDispatch: () => void; onResponse: () => void };
}) {
  return qwenOmniChat({
    messages: args.messages,
    user: args.user,
    purposeId: QWEN_OMNI_AUDIO_CONSENT_PURPOSE_ID,
    lifecycle: args.lifecycle,
  });
}

export function assertQwenPurposeForAudioOperation(purposeId: QwenModelStudioConsentPurposeId, user?: unknown) {
  assertQwenPurposeConsent({ purposeId, user });
  throw qwenError("Qwen audio release gates are closed.", "QWEN_RUNTIME_NOT_READY");
}

export const QWEN_TRANSPORT_ENDPOINTS = {
  openaiCompatible: QWEN_MODEL_STUDIO_OPENAI_COMPATIBLE_BASE_URL,
  dashscope: QWEN_MODEL_STUDIO_DASHSCOPE_BASE_URL,
} as const;
