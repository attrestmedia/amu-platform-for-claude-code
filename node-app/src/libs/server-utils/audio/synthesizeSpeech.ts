import "server-only";
import { randomUUID } from "node:crypto";
import { ELEVENLABS_DEFAULT_TTS_MODEL, OPENAI_DEFAULT_TTS_SPEED } from "consts/ai/voiceCatalog";
import { applySpeechBilling, estimateSpeechSynthesisUsageFromText, preflightSpeechBilling, toSpeechResponseUsage } from "./billing";
import { assertSpeechSynthesisTextOrThrow, createSpeechError } from "./guards";
import { resolveElevenLabsApiKey } from "./providers/elevenlabsCredential";
import { elevenLabsSynthesizeSpeech } from "./providers/elevenlabsSpeech";
import { openaiSynthesizeSpeech } from "./providers/openaiSpeech";
import {
  markSpeechBudgetUnknownOutcome,
  releaseSpeechBudget,
  reserveSpeechBudgetOrThrow,
  settleSpeechBudget,
} from "./speechBudgetReservation";
import { buildSpeechOperationId } from "./speechBillingLedger";
import {
  assertSpeechCandidatePreApprovalGateOrThrow,
  assertSpeechProviderCapabilityOrThrow,
} from "./speechProviderPolicy";
import { resolveVoiceProfile } from "./voiceProfileResolver";
import { assertSystemModelEnabledOrThrow } from "libs/server-utils/api/systemModelControl";
import {
  isOverseasTransferRefused,
  OVERSEAS_TRANSFER_REFUSAL_PROCESSOR_KEYS,
} from "libs/server-utils/auth/overseasTransferRefusalService";
import type { ISpeechSynthesizeRequest, ISpeechSynthesizeServiceResult } from "./types";
import type { BillableProviderType } from "types/ai";

async function assertElevenLabsTransferAllowed(args: ISpeechSynthesizeRequest) {
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

export async function synthesizeSpeech(args: ISpeechSynthesizeRequest): Promise<ISpeechSynthesizeServiceResult> {
  const provider = args.provider || "elevenlabs";
  if (provider !== "openai" && provider !== "elevenlabs") {
    throw createSpeechError("지원하지 않는 speech provider입니다.", "UNSUPPORTED_SPEECH_PROVIDER", 400, {
      provider,
    });
  }

  const text = assertSpeechSynthesisTextOrThrow(args.text);
  const requestedModelName = args.modelName || args.voiceProfile?.modelName || args.persona?.voiceProfile?.modelName;
  const capability = await assertSpeechProviderCapabilityOrThrow({
    provider,
    modelName: requestedModelName,
    role: "speech_tts",
    capability: "tts_http",
  });
  const modelName = String(
    capability?.modelName || requestedModelName || (provider === "elevenlabs" ? ELEVENLABS_DEFAULT_TTS_MODEL : ""),
  ).trim();
  if (provider === "elevenlabs") {
    await assertElevenLabsTransferAllowed(args);
  }
  const resolvedVoice = resolveVoiceProfile({ ...args, modelName, text });
  if (provider === "openai") {
    assertSpeechCandidatePreApprovalGateOrThrow({ provider, modelName });
  }
  const requestedSpeed = Number(args.speed ?? args.universeMetadata?.voiceConfig?.defaultTtsSpeed ?? OPENAI_DEFAULT_TTS_SPEED);
  const speed = provider === "elevenlabs"
    ? Number.isFinite(requestedSpeed) ? Math.min(1.2, Math.max(0.7, requestedSpeed)) : 1
    : Number.isFinite(requestedSpeed) ? Math.min(4, Math.max(0.25, requestedSpeed)) : OPENAI_DEFAULT_TTS_SPEED;
  const estimatedUsage = estimateSpeechSynthesisUsageFromText(text);
  const estimatedFixed = provider === "elevenlabs" ? { characters: Array.from(text.normalize("NFC")).length } : undefined;
  const billingMeta = {
    operation: "speech_synthesize",
    provider,
    modelName,
    voiceId: resolvedVoice.voiceId,
    routeHint: args.billing?.routeHint,
    ...args.billing?.meta,
  };

  const billingPreflight = await preflightSpeechBilling({
    provider: provider as BillableProviderType,
    modelName,
    usage: provider === "openai" ? estimatedUsage : undefined,
    fixed: estimatedFixed,
    billing: args.billing,
    meta: { ...billingMeta, usageSource: "estimated_from_text", preflight: true },
  });

  // EL-204-S3. 코인 preflight와 별개 축이다 — 그쪽은 이용자 잔액, 이쪽은 조직 지출 상한이다.
  // 강제 대상이 아닌 provider에서는 아무것도 하지 않는다.
  const sessionId = String(args.billing?.meta?.sessionId || "").trim();
  const clientId = String(args.billing?.meta?.clientId || "").trim();
  const reservation = await reserveSpeechBudgetOrThrow({
    role: "speech_tts",
    provider,
    modelName,
    unit: "character",
    quantity: estimatedFixed?.characters ?? 0,
    billing: args.billing,
    user: args.user,
    reservationKey: sessionId && clientId
      ? `${buildSpeechOperationId({ operation: "speech_synthesize", sessionId, clientId })}:${randomUUID()}`
      : undefined,
  });

  let providerResult:
    | Awaited<ReturnType<typeof elevenLabsSynthesizeSpeech>>
    | Awaited<ReturnType<typeof openaiSynthesizeSpeech>>;
  let providerDispatchStarted = false;
  try {
    if (provider === "elevenlabs") {
      const apiKey = await resolveElevenLabsApiKey();
      await assertSystemModelEnabledOrThrow({ provider, modelName, modality: "audio" });
      providerResult = await elevenLabsSynthesizeSpeech({
        apiKey,
        text,
        modelName,
        format: args.format,
        speed,
        voiceProfile: resolvedVoice,
      }).catch((error: unknown) => {
        providerDispatchStarted = true;
        throw error;
      });
      providerDispatchStarted = true;
    } else {
      await assertSystemModelEnabledOrThrow({ provider, modelName, modality: "audio" });
      providerResult = await openaiSynthesizeSpeech({
        text,
        modelName,
        format: args.format,
        speed,
        voiceProfile: resolvedVoice,
      }).catch((error: unknown) => {
        providerDispatchStarted = true;
        throw error;
      });
      providerDispatchStarted = true;
    }
  } catch (error) {
    if (providerDispatchStarted) {
      await markSpeechBudgetUnknownOutcome({ reservation, reason: "provider_outcome_unknown" });
    } else {
      await releaseSpeechBudget({ reservation, reason: "provider_not_dispatched" });
    }
    throw error;
  }

  const usage = providerResult.usage || (provider === "openai" ? estimatedUsage : undefined);
  const fixedUsage = providerResult.fixedUsage || estimatedFixed;
  await settleSpeechBudget({
    reservation,
    actualQuantity: fixedUsage?.characters ?? estimatedFixed?.characters ?? 0,
  });
  const billing = await applySpeechBilling({
    provider: provider as BillableProviderType,
    modelName,
    usage: provider === "openai" ? usage : undefined,
    fixed: provider === "elevenlabs" ? fixedUsage : undefined,
    billing: args.billing,
    meta: { ...billingMeta, billingPreflightCoins: billingPreflight.coins },
  });

  return {
    audioBuffer: providerResult.audioBuffer,
    bytes: providerResult.bytes,
    audioUrl: undefined,
    contentType: providerResult.contentType,
    voice: {
      provider,
      voiceId: resolvedVoice.voiceId,
      modelName,
      locale: resolvedVoice.locale,
    },
    usage: toSpeechResponseUsage(usage),
    billing: { ok: billing.ok, coins: billing.coins },
    meta: {
      provider,
      modelName,
      bytes: providerResult.bytes,
      usageSource: providerResult.meta?.usageSource || (provider === "elevenlabs" ? "amu_counted" : "estimated_from_text"),
      billingPreflightCoins: billingPreflight.coins,
      billingCharged: billing.charged,
      billingEstimated: billing.estimated,
      billingFixed: fixedUsage,
      usageUnit: provider === "elevenlabs" ? "character" : undefined,
      matchedTags: resolvedVoice.matchedTags,
      matchedReasons: resolvedVoice.matchedReasons,
      voiceSource: resolvedVoice.source,
      voiceScore: resolvedVoice.score,
      speed,
      ...providerResult.meta,
    },
    resolvedVoice,
  };
}
