import "server-only";
import { randomUUID } from "node:crypto";
import {
  ELEVENLABS_DEFAULT_STT_MODEL,
  OPENAI_GPT_TRANSCRIBE_CANDIDATE_MODEL,
} from "consts/ai/voiceCatalog";
import type { ISpeechTranscribeResponse } from "types/ai";
import {
  applySpeechBilling,
  estimateSpeechTranscriptionFixedUsage,
  estimateSpeechTranscriptionUsageFromText,
  preflightSpeechBilling,
  toSpeechResponseUsage,
} from "./billing";
import { assertSpeechAudioInputOrThrow, createSpeechError } from "./guards";
import { resolveElevenLabsApiKey } from "./providers/elevenlabsCredential";
import { elevenLabsTranscribeSpeech } from "./providers/elevenlabsSpeech";
import { openaiTranscribeSpeech } from "./providers/openaiSpeech";
import {
  assertQwenProviderCallReady,
  getQwenAsrDataUrlByteLength,
  QWEN_ASR_MAX_AUDIO_BYTES,
  QWEN_ASR_MAX_DURATION_MS,
  QWEN_ASR_MODEL,
  qwenTranscribeSpeech,
} from "./providers/qwenSpeech";
import { QWEN_ASR_AUDIO_CONSENT_PURPOSE_ID } from "consts/legal/voiceDataConsent";
import {
  markSpeechBudgetUnknownOutcome,
  releaseSpeechBudget,
  reserveSpeechBudgetOrThrow,
  settleSpeechBudget,
  type SpeechBudgetReservation,
} from "./speechBudgetReservation";
import { buildSpeechOperationId } from "./speechBillingLedger";
import {
  assertSpeechCandidatePreApprovalGateOrThrow,
  assertSpeechProviderCapabilityOrThrow,
} from "./speechProviderPolicy";
import { claimProviderOperationOrThrow } from "libs/server-utils/api/providerOperationGuard";
import { assertSystemModelEnabledOrThrow } from "libs/server-utils/api/systemModelControl";
import {
  isOverseasTransferRefused,
  OVERSEAS_TRANSFER_REFUSAL_PROCESSOR_KEYS,
} from "libs/server-utils/auth/overseasTransferRefusalService";
import type { ISpeechTranscribeRequest } from "./types";

async function assertElevenLabsTransferAllowed(args: ISpeechTranscribeRequest) {
  const user = args.user && typeof args.user === "object" ? args.user as Record<string, unknown> : {};
  const uid = String(args.billing?.uid || user.uid || user.ID || "").trim();
  if (!uid) {
    throw createSpeechError(
      "ElevenLabs 국외 이전 거부 상태를 확인할 수 없어 음성 처리를 차단했습니다.",
      "OVERSEAS_TRANSFER_REFUSAL_UNAVAILABLE",
      503,
    );
  }

  let refused: boolean;
  try {
    refused = await isOverseasTransferRefused({
      uid,
      processorKey: OVERSEAS_TRANSFER_REFUSAL_PROCESSOR_KEYS[0],
    });
  } catch {
    throw createSpeechError(
      "ElevenLabs 국외 이전 거부 상태를 확인할 수 없어 음성 처리를 차단했습니다.",
      "OVERSEAS_TRANSFER_REFUSAL_UNAVAILABLE",
      503,
    );
  }

  if (refused) {
    throw createSpeechError(
      "국외 이전 거부 설정으로 ElevenLabs 음성 처리를 차단했습니다.",
      "OVERSEAS_TRANSFER_REFUSED",
      403,
    );
  }
}

function validateQwenAsrFile(args: ISpeechTranscribeRequest) {
  const maxDurationMs = Math.min(QWEN_ASR_MAX_DURATION_MS, Math.max(1, Number(args.maxDurationMs || QWEN_ASR_MAX_DURATION_MS)));
  let validatedFile;
  try {
    validatedFile = assertSpeechAudioInputOrThrow(args.file, {
      maxBytes: QWEN_ASR_MAX_AUDIO_BYTES,
      maxDurationMs,
    });
  } catch (error) {
    const speechError = error as Error & { errorCode?: string; status?: number };
    if (speechError.errorCode === "AUDIO_FILE_TOO_LARGE" || (speechError.errorCode === "AUDIO_DURATION_EXCEEDED" && maxDurationMs === QWEN_ASR_MAX_DURATION_MS)) {
      speechError.status = 400;
    }
    throw speechError;
  }
  if (validatedFile.format !== "wav" || validatedFile.durationSource !== "server" || !validatedFile.actualDurationMs) {
    throw createSpeechError("Qwen ASR requires WAV input with server-verified duration.", "QWEN_ASR_AUDIO_VALIDATION_REQUIRED", 400);
  }
  if (validatedFile.actualDurationMs >= QWEN_ASR_MAX_DURATION_MS) {
    throw createSpeechError("Qwen ASR accepts audio shorter than 5 minutes.", "QWEN_ASR_INPUT_LIMIT_EXCEEDED", 400);
  }
  if (getQwenAsrDataUrlByteLength(validatedFile.buffer) > QWEN_ASR_MAX_AUDIO_BYTES) {
    throw createSpeechError("Qwen ASR encoded Data URL exceeds 10 MiB.", "QWEN_ASR_INPUT_LIMIT_EXCEEDED", 400);
  }
  return validatedFile;
}

function estimateQwenAsrUsage(durationMs: number) {
  const seconds = Math.max(1, Math.ceil(durationMs / 1000));
  return { audio: { input: seconds * 64 }, text: { output: seconds * 16 } };
}

function classifyQwenSpeechFailure(args: { dispatchStarted: boolean; responseReceived: boolean; error: unknown }) {
  if (!args.dispatchStarted) return "release" as const;
  const errorLike = args.error as (Error & { status?: number; upstreamStatus?: number; providerCallState?: string; detail?: Record<string, unknown> }) | null;
  const providerCallState = errorLike?.providerCallState || errorLike?.detail?.providerCallState;
  if (providerCallState === "not_sent") return "release" as const;
  const status = Number(errorLike?.upstreamStatus ?? errorLike?.status);
  if (Number.isInteger(status) && status >= 400 && status < 500) return "release" as const;
  if (args.responseReceived || providerCallState === "completed") return "post_response_failure" as const;
  return "dispatch_uncertain" as const;
}

async function transcribeQwenSpeech(args: ISpeechTranscribeRequest): Promise<ISpeechTranscribeResponse> {
  const validatedFile = validateQwenAsrFile(args);
  const modelName = String(args.modelName || QWEN_ASR_MODEL).trim();
  if (modelName !== QWEN_ASR_MODEL) {
    throw createSpeechError("지원되지 않는 Qwen ASR 모델입니다.", "UNSUPPORTED_SPEECH_MODEL", 400, { modelName });
  }
  const operationId = String(args.billing?.meta?.operationId || "").trim();
  if (!operationId) throw createSpeechError("Qwen ASR에는 operationId가 필요합니다.", "PROVIDER_OPERATION_ID_REQUIRED", 400);

  const lease = await claimProviderOperationOrThrow(operationId);
  if (lease.kind === "replay") return lease.result as ISpeechTranscribeResponse;
  let providerDispatchStarted = false;
  let providerResponseReceived = false;
  let reservation: SpeechBudgetReservation = { enforced: false };
  try {
    await assertQwenProviderCallReady({
      modelName: QWEN_ASR_MODEL,
      modality: "audio",
      user: args.user,
      purposeId: QWEN_ASR_AUDIO_CONSENT_PURPOSE_ID,
    });
    const estimatedUsage = estimateQwenAsrUsage(validatedFile.actualDurationMs || validatedFile.durationMs || 0);
    const billingMeta = {
      operation: "speech_transcribe",
      provider: "qwen",
      modelName,
      filename: validatedFile.filename,
      routeHint: args.billing?.routeHint,
      durationMs: validatedFile.actualDurationMs,
      ...args.billing?.meta,
    };
    const billingPreflight = await preflightSpeechBilling({
      provider: "qwen",
      modelName,
      usage: estimatedUsage,
      billing: args.billing,
      meta: { ...billingMeta, usageSource: "estimated_from_server_duration", preflight: true },
    });
    const durationSeconds = (validatedFile.actualDurationMs || 0) / 1000;
    const sessionId = String(args.billing?.meta?.sessionId || "").trim();
    const clientId = String(args.billing?.meta?.clientId || "").trim();
    reservation = await reserveSpeechBudgetOrThrow({
      role: "speech_stt",
      provider: "qwen",
      modelName,
      unit: "audio_second",
      quantity: durationSeconds,
      billing: args.billing,
      user: args.user,
      reservationKey: sessionId && clientId
        ? `${buildSpeechOperationId({ operation: "speech_transcribe", sessionId, clientId })}:${randomUUID()}`
        : undefined,
    });
    await assertSystemModelEnabledOrThrow({ provider: "qwen", modelName, modality: "audio" });
    const providerResult = await qwenTranscribeSpeech(validatedFile, args.user, {
      onDispatch: () => { providerDispatchStarted = true; },
      onResponse: () => { providerResponseReceived = true; },
    });
    if (!providerResult.usage) {
      throw createSpeechError("Qwen ASR provider token usage is required for D8 settlement.", "QWEN_USAGE_UNAVAILABLE", 502, {
        providerCallState: "completed",
      });
    }
    await settleSpeechBudget({
      reservation,
      actualQuantity: durationSeconds,
    });
    const billing = await applySpeechBilling({
      provider: "qwen",
      modelName,
      usage: providerResult.usage,
      billing: args.billing,
      meta: {
        ...billingMeta,
        billingPreflightCoins: billingPreflight.coins,
        billingUsageSource: providerResult.meta?.usageSource || "provider_reported_tokens",
      },
    });
    const response: ISpeechTranscribeResponse = {
      transcript: providerResult.transcript,
      language: providerResult.language,
      durationMs: validatedFile.actualDurationMs,
      confidence: providerResult.confidence,
      usage: toSpeechResponseUsage(providerResult.usage),
      billing: { ok: billing.ok, coins: billing.coins },
      meta: {
        provider: "qwen",
        modelName,
        filename: validatedFile.filename,
        mimeType: validatedFile.mimeType,
        sizeBytes: validatedFile.sizeBytes,
        format: validatedFile.format,
        ...providerResult.meta,
        usageSource: providerResult.meta?.usageSource || "provider_reported_tokens",
        billingUsageSource: providerResult.meta?.usageSource || "provider_reported_tokens",
        billingPreflightCoins: billingPreflight.coins,
        billingCharged: billing.charged,
        billingEstimated: billing.estimated,
      },
    };
    await lease.complete(response);
    return response;
  } catch (error) {
    const disposition = classifyQwenSpeechFailure({
      dispatchStarted: providerDispatchStarted,
      responseReceived: providerResponseReceived,
      error,
    });
    if (disposition === "release") {
      await releaseSpeechBudget({ reservation, reason: "provider_not_dispatched" });
    } else {
      await markSpeechBudgetUnknownOutcome({ reservation, reason: "provider_outcome_unknown" });
    }
    if (disposition === "release") await lease.release();
    else await lease.markUnresolved(disposition);
    throw error;
  }
}

export async function preflightTranscribeSpeech(args: ISpeechTranscribeRequest) {
  const provider = args.provider || "elevenlabs";
  if (provider === "qwen") {
    const validatedFile = validateQwenAsrFile(args);
    const modelName = String(args.modelName || QWEN_ASR_MODEL).trim();
    if (modelName !== QWEN_ASR_MODEL) {
      throw createSpeechError("지원되지 않는 Qwen ASR 모델입니다.", "UNSUPPORTED_SPEECH_MODEL", 400, { modelName });
    }
    await assertQwenProviderCallReady({
      modelName: QWEN_ASR_MODEL,
      modality: "audio",
      user: args.user,
      purposeId: QWEN_ASR_AUDIO_CONSENT_PURPOSE_ID,
    });
    return preflightSpeechBilling({
      provider: "qwen",
      modelName,
      usage: estimateQwenAsrUsage(validatedFile.actualDurationMs || 0),
      billing: args.billing,
      meta: {
        operation: "speech_transcribe",
        provider,
        modelName,
        filename: validatedFile.filename,
        routeHint: args.billing?.routeHint,
        durationMs: validatedFile.actualDurationMs,
        usageSource: "estimated_from_server_duration",
        preflight: true,
        ...args.billing?.meta,
      },
    });
  }
  if (provider !== "openai" && provider !== "elevenlabs") {
    throw createSpeechError("지원하지 않는 speech provider입니다.", "UNSUPPORTED_SPEECH_PROVIDER", 400, {
      provider,
    });
  }

  const validatedFile = assertSpeechAudioInputOrThrow(args.file, { maxDurationMs: args.maxDurationMs });
  const modelName = String(args.modelName || (provider === "elevenlabs" ? ELEVENLABS_DEFAULT_STT_MODEL : "")).trim();
  if (provider === "elevenlabs") {
    await assertSpeechProviderCapabilityOrThrow({ provider, modelName, role: "speech_stt", capability: "stt_file" });
    await assertElevenLabsTransferAllowed(args);
    if (validatedFile.durationSource !== "server" || !validatedFile.actualDurationMs) {
      throw createSpeechError("ElevenLabs STT 과금에 필요한 서버 측 오디오 길이를 확인할 수 없습니다.", "AUDIO_DURATION_UNAVAILABLE", 400);
    }
  } else {
    if (
      modelName === OPENAI_GPT_TRANSCRIBE_CANDIDATE_MODEL &&
      (validatedFile.durationSource !== "server" || !validatedFile.actualDurationMs)
    ) {
      throw createSpeechError("GPT-Transcribe 과금 사전 확인에 서버 측 오디오 길이가 필요합니다.", "AUDIO_DURATION_UNAVAILABLE", 400);
    }
    assertSpeechCandidatePreApprovalGateOrThrow({ provider, modelName });
    await assertSpeechProviderCapabilityOrThrow({ provider, modelName, role: "speech_stt", capability: "stt_file" });
  }
  const fixedUsage = provider === "elevenlabs"
    ? { seconds: (validatedFile.actualDurationMs || 0) / 1000 }
    : modelName === OPENAI_GPT_TRANSCRIBE_CANDIDATE_MODEL
      ? { minutes: (validatedFile.actualDurationMs || 0) / 60_000 }
      : estimateSpeechTranscriptionFixedUsage(validatedFile);
  return preflightSpeechBilling({
    provider,
    modelName,
    fixed: fixedUsage,
    billing: args.billing,
    meta: {
      operation: "speech_transcribe",
      provider,
      modelName,
      filename: validatedFile.filename,
      routeHint: args.billing?.routeHint,
      durationMs: validatedFile.durationMs,
      usageSource: provider === "elevenlabs"
        ? "estimated_from_server_duration"
        : validatedFile.durationMs ? "estimated_from_duration" : "estimated_minimum_duration",
      preflight: true,
      ...args.billing?.meta,
    },
  });
}

/** fixed usage는 provider에 따라 분 또는 초로 온다. 예산 판정 축(오디오 초)으로 맞춘다. */
function toAudioSeconds(fixed?: { minutes?: number; seconds?: number } | null): number {
  if (!fixed) return 0;
  if (typeof fixed.seconds === "number") return Number(fixed.seconds) || 0;
  return (Number(fixed.minutes) || 0) * 60;
}

export async function transcribeSpeech(args: ISpeechTranscribeRequest): Promise<ISpeechTranscribeResponse> {
  const provider = args.provider || "elevenlabs";
  if (provider === "qwen") {
    return transcribeQwenSpeech(args);
  }
  if (provider !== "openai" && provider !== "elevenlabs") {
    throw createSpeechError("지원하지 않는 speech provider입니다.", "UNSUPPORTED_SPEECH_PROVIDER", 400, {
      provider,
    });
  }

  const validatedFile = assertSpeechAudioInputOrThrow(args.file, { maxDurationMs: args.maxDurationMs });
  const modelName = String(args.modelName || (provider === "elevenlabs" ? ELEVENLABS_DEFAULT_STT_MODEL : "")).trim();
  if (provider === "elevenlabs") {
    await assertSpeechProviderCapabilityOrThrow({ provider, modelName, role: "speech_stt", capability: "stt_file" });
    await assertElevenLabsTransferAllowed(args);
    if (validatedFile.durationSource !== "server" || !validatedFile.actualDurationMs) {
      throw createSpeechError("ElevenLabs STT 과금에 필요한 서버 측 오디오 길이를 확인할 수 없습니다.", "AUDIO_DURATION_UNAVAILABLE", 400);
    }
  } else {
    if (
      modelName === OPENAI_GPT_TRANSCRIBE_CANDIDATE_MODEL &&
      (validatedFile.durationSource !== "server" || !validatedFile.actualDurationMs)
    ) {
      throw createSpeechError("GPT-Transcribe 과금 사전 확인에 서버 측 오디오 길이가 필요합니다.", "AUDIO_DURATION_UNAVAILABLE", 400);
    }
    assertSpeechCandidatePreApprovalGateOrThrow({ provider, modelName });
    await assertSpeechProviderCapabilityOrThrow({ provider, modelName, role: "speech_stt", capability: "stt_file" });
  }
  const estimatedFixed = provider === "elevenlabs"
    ? { seconds: (validatedFile.actualDurationMs || 0) / 1000 }
    : modelName === OPENAI_GPT_TRANSCRIBE_CANDIDATE_MODEL
      ? { minutes: (validatedFile.actualDurationMs || 0) / 60_000 }
      : estimateSpeechTranscriptionFixedUsage(validatedFile);
  const billingMeta = {
    operation: "speech_transcribe",
    provider,
    modelName,
    filename: validatedFile.filename,
    routeHint: args.billing?.routeHint,
    durationMs: validatedFile.durationMs,
    ...args.billing?.meta,
  };

  const billingPreflight = await preflightSpeechBilling({
    provider,
    modelName,
    fixed: estimatedFixed,
    billing: args.billing,
    meta: {
      ...billingMeta,
      usageSource: provider === "elevenlabs"
        ? "estimated_from_server_duration"
        : validatedFile.durationMs ? "estimated_from_duration" : "estimated_minimum_duration",
      preflight: true,
    },
  });

  // EL-204-S3. STT는 오디오 시간 축으로 예약한다(문자 축과 섞지 않는다).
  const sessionId = String(args.billing?.meta?.sessionId || "").trim();
  const clientId = String(args.billing?.meta?.clientId || "").trim();
  const reservation = await reserveSpeechBudgetOrThrow({
    role: "speech_stt",
    provider,
    modelName,
    unit: "audio_second",
    quantity: toAudioSeconds(estimatedFixed),
    billing: args.billing,
    user: args.user,
    reservationKey: sessionId && clientId
      ? `${buildSpeechOperationId({ operation: "speech_transcribe", sessionId, clientId })}:${randomUUID()}`
      : undefined,
  });

  const isGPTTranscribeCandidate = provider === "openai" && modelName === OPENAI_GPT_TRANSCRIBE_CANDIDATE_MODEL;
  let providerDispatchStarted = false;
  let providerResult:
    | Awaited<ReturnType<typeof elevenLabsTranscribeSpeech>>
    | Awaited<ReturnType<typeof openaiTranscribeSpeech>>;
  try {
    if (provider === "elevenlabs") {
      const apiKey = await resolveElevenLabsApiKey();
      await assertSystemModelEnabledOrThrow({ provider, modelName, modality: "audio" });
      providerResult = await elevenLabsTranscribeSpeech({
        apiKey,
        file: validatedFile,
        modelName,
        language: args.language,
      }).catch((error: unknown) => {
        providerDispatchStarted = true;
        throw error;
      });
      providerDispatchStarted = true;
    } else {
      await assertSystemModelEnabledOrThrow({ provider, modelName, modality: "audio" });
      providerResult = await openaiTranscribeSpeech({
        file: validatedFile,
        modelName,
        language: args.language,
        prompt: args.prompt,
      }).catch((error: unknown) => {
        providerDispatchStarted = true;
        throw error;
      });
      providerDispatchStarted = true;
    }

    if (
      isGPTTranscribeCandidate &&
      (providerResult.meta?.providerUsage === undefined ||
        providerResult.meta?.providerUsage === null ||
        (providerResult.meta?.providerUsage as Record<string, unknown>).type !== "duration" ||
        !providerResult.fixedUsage?.minutes)
    ) {
      throw createSpeechError(
        "GPT-Transcribe usage 단위가 오디오 분 과금 계약과 일치하지 않아 정산할 수 없습니다.",
        "OPENAI_USAGE_UNIT_UNSUPPORTED",
        502,
        { providerCallState: "completed", usageType: (providerResult.meta?.providerUsage as Record<string, unknown> | undefined)?.type || null },
      );
    }
  } catch (error) {
    if (providerDispatchStarted) {
      await markSpeechBudgetUnknownOutcome({ reservation, reason: "provider_outcome_unknown" });
    } else {
      await releaseSpeechBudget({ reservation, reason: "provider_not_dispatched" });
    }
    throw error;
  }

  const usage = isGPTTranscribeCandidate
    ? providerResult.usage
    : providerResult.usage || estimateSpeechTranscriptionUsageFromText(providerResult.transcript);
  const fixedUsage = providerResult.fixedUsage;
  await settleSpeechBudget({
    reservation,
    actualQuantity: toAudioSeconds(fixedUsage) || toAudioSeconds(estimatedFixed),
  });
  const billWithProviderUsage = Boolean(providerResult.usage || fixedUsage);
  const billing = await applySpeechBilling({
    provider,
    modelName,
    usage: provider === "openai" && providerResult.usage ? usage : undefined,
    fixed: provider === "elevenlabs"
      ? fixedUsage || { seconds: (validatedFile.actualDurationMs || 0) / 1000 }
      : isGPTTranscribeCandidate
        ? fixedUsage
        : billWithProviderUsage ? undefined : estimatedFixed,
    billing: args.billing,
    meta: {
      ...billingMeta,
      billingPreflightCoins: billingPreflight.coins,
      billingUsageSource: billWithProviderUsage
        ? providerResult.meta?.usageSource || "provider_usage"
        : validatedFile.durationMs
          ? "estimated_from_duration"
          : "estimated_minimum_duration",
    },
  });

  return {
    transcript: providerResult.transcript,
    language: providerResult.language,
    durationMs: validatedFile.durationMs,
    confidence: providerResult.confidence,
    usage: toSpeechResponseUsage(usage),
    billing: {
      ok: billing.ok,
      coins: billing.coins,
    },
    meta: {
      provider,
      modelName,
      filename: validatedFile.filename,
      mimeType: validatedFile.mimeType,
      sizeBytes: validatedFile.sizeBytes,
      format: validatedFile.format,
      usageSource: providerResult.meta?.usageSource || (provider === "elevenlabs" ? "amu_counted" : "estimated_from_text"),
      billingUsageSource: billWithProviderUsage
        ? providerResult.meta?.usageSource || "provider_usage"
        : validatedFile.durationMs
          ? "estimated_from_duration"
          : "estimated_minimum_duration",
      billingPreflightCoins: billingPreflight.coins,
      billingCharged: billing.charged,
      billingEstimated: billing.estimated,
      billingFixed: provider === "elevenlabs" ? fixedUsage || estimatedFixed : billWithProviderUsage ? undefined : estimatedFixed,
      ...providerResult.meta,
    },
  };
}
