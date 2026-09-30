import "server-only";
import { ELEVENLABS_DEFAULT_TTS_MODEL, OPENAI_DEFAULT_TTS_MODEL, OPENAI_DEFAULT_TTS_SPEED } from "consts/ai/voiceCatalog";
import { applySpeechBilling, estimateSpeechSynthesisUsageFromText, preflightSpeechBilling, toSpeechResponseUsage } from "./billing";
import { assertSpeechSynthesisTextOrThrow, createSpeechError } from "./guards";
import { resolveElevenLabsApiKey } from "./providers/elevenlabsCredential";
import { elevenLabsSynthesizeSpeech } from "./providers/elevenlabsSpeech";
import { openaiSynthesizeSpeech } from "./providers/openaiSpeech";
import { assertSpeechBudgetOrThrow, recordSpeechSpend } from "./speechBudgetGuard";
import {
  assertSpeechCandidatePreApprovalGateOrThrow,
  assertSpeechProviderCapabilityOrThrow,
} from "./speechProviderPolicy";
import { resolveVoiceProfile } from "./voiceProfileResolver";
import type { ISpeechSynthesizeRequest, ISpeechSynthesizeServiceResult } from "./types";
import type { BillableProviderType } from "types/ai";

export async function synthesizeSpeech(args: ISpeechSynthesizeRequest): Promise<ISpeechSynthesizeServiceResult> {
  const provider = args.provider || "openai";
  if (provider !== "openai" && provider !== "elevenlabs") {
    throw createSpeechError("현재 O1 단계에서는 OpenAI 음성만 지원합니다.", "UNSUPPORTED_SPEECH_PROVIDER", 400, {
      provider,
    });
  }

  const text = assertSpeechSynthesisTextOrThrow(args.text);
  if (provider === "elevenlabs") {
    await assertSpeechProviderCapabilityOrThrow({
      provider,
      modelName: args.modelName || ELEVENLABS_DEFAULT_TTS_MODEL,
      role: "speech_tts",
      capability: "tts_http",
    });
  }
  const resolvedVoice = resolveVoiceProfile({ ...args, text });
  const modelName = String(args.modelName || resolvedVoice.modelName || OPENAI_DEFAULT_TTS_MODEL).trim() || OPENAI_DEFAULT_TTS_MODEL;
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
  const budgetDecision = await assertSpeechBudgetOrThrow({
    provider,
    modelName,
    unit: "character",
    quantity: estimatedFixed?.characters ?? 0,
    billing: args.billing,
    user: args.user,
  });

  const providerResult = provider === "elevenlabs"
    ? await elevenLabsSynthesizeSpeech({
        apiKey: await resolveElevenLabsApiKey(),
        text,
        modelName,
        format: args.format,
        speed,
        voiceProfile: resolvedVoice,
      })
    : await openaiSynthesizeSpeech({
        text,
        modelName,
        format: args.format,
        speed,
        voiceProfile: resolvedVoice,
      });

  const usage = providerResult.usage || (provider === "openai" ? estimatedUsage : undefined);
  const fixedUsage = providerResult.fixedUsage || estimatedFixed;
  await recordSpeechSpend({
    decision: budgetDecision,
    provider,
    modelName,
    unit: "character",
    quantity: fixedUsage?.characters ?? estimatedFixed?.characters ?? 0,
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
