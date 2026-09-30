import "server-only";
import { TUTORS_NAMESPACE_KEY, UNIVERSE_NAMESPACE_KEY, COMMERCE_NAMESPACE_KEY } from "consts/app";
import {
  assertAIUsageBalanceOrThrow,
  assertCommerceAIUsageBalanceOrThrow,
  assertPricingPreflightOrThrow,
  billAIUsageOrThrow,
  billCommerceAIUsageOrThrow,
} from "libs/services/aiUsageBilling";
import type { BillableProviderType, RouteHintType } from "types/ai";
import type { IFixedUsage, ITokenUsageBreakdown } from "types/payment";
import { estimateTokens } from "utils/ai/tokenUtils";
import { calcCoins, resolveBillingKey } from "utils/payment";
import { createSpeechError } from "./guards";
import { normalizeSpeechTokenUsageForSettlement, toStartedMinuteFixedUsageFromAudioSeconds } from "./speechBillingLedger";
import { OPENAI_GPT_TRANSCRIBE_CANDIDATE_MODEL } from "consts/ai/voiceCatalog";
import type { ISpeechBillingContext, ISpeechBillingResult } from "./types";
import type { IValidatedSpeechAudioInput } from "./types";

function resolveSpeechApp(routeHint?: RouteHintType, explicitApp?: string) {
  const app = String(explicitApp || "").trim();
  if (app) return app;
  if (routeHint === "tutors") return TUTORS_NAMESPACE_KEY;
  if (routeHint === "commerce") return COMMERCE_NAMESPACE_KEY;
  return UNIVERSE_NAMESPACE_KEY;
}

export function estimateSpeechSynthesisUsageFromText(text: string): ITokenUsageBreakdown {
  const tokens = Math.max(1, estimateTokens(String(text || "").trim()));
  return {
    text: {
      input: tokens,
    },
    audio: {
      output: tokens,
    },
  };
}

export function estimateSpeechTranscriptionUsageFromText(text: string): ITokenUsageBreakdown {
  const tokens = Math.max(1, estimateTokens(String(text || "").trim()));
  return {
    text: {
      output: tokens,
    },
  };
}

export function estimateSpeechTranscriptionFixedUsage(file: Pick<IValidatedSpeechAudioInput, "durationMs">) {
  const durationMs = Math.max(0, Number(file.durationMs || 0));
  if (durationMs > 0) return { minutes: durationMs / 60_000 };
  return { minutes: 1 };
}

export const estimateSpeechUsageFromText = estimateSpeechSynthesisUsageFromText;

/**
 * EL-203 — TTS 문자 과금 견적.
 * 토큰 추정(estimateSpeechSynthesisUsageFromText)과 달리 provider 청구 단위인 문자 수를 그대로 쓴다.
 * 두 경로는 공존한다 — 문자 단가가 등록되지 않은 모델은 기존 토큰 경로를 계속 쓴다.
 */
export function estimateSpeechSynthesisFixedUsage(count: { counted: number }): IFixedUsage {
  return { characters: Math.max(0, Math.ceil(Number(count?.counted || 0))) };
}

/** fixed usage가 요구하는 단위 전부. preflight가 각 단위의 단가 필드를 검증한다. */
export function resolveSpeechFixedUnits(fixed?: IFixedUsage): (keyof IFixedUsage)[] {
  if (!fixed) return [];
  return (["seconds", "minutes", "images", "videos", "characters", "credits"] as const).filter(
    (unit) => fixed[unit],
  );
}

export function toSpeechResponseUsage(usage?: ITokenUsageBreakdown) {
  const input =
    Math.max(0, Number(usage?.text?.input || 0)) +
    Math.max(0, Number(usage?.audio?.input || 0)) +
    Math.max(0, Number(usage?.image?.input || 0));
  const output =
    Math.max(0, Number(usage?.text?.output || 0)) +
    Math.max(0, Number(usage?.audio?.output || 0)) +
    Math.max(0, Number(usage?.image?.output || 0));
  return {
    promptTokens: input,
    completionTokens: output,
    totalTokens: input + output,
  };
}

function estimateSpeechBillingCoins(
  provider: BillableProviderType,
  modelName: string,
  usage?: ITokenUsageBreakdown,
  fixed?: IFixedUsage,
) {
  const billingKey = resolveBillingKey(provider, modelName, undefined, "audio");
  return calcCoins({ billingKey, usage, fixed }).coins;
}

function normalizeSpeechFixedUsageForSettlement(
  provider: BillableProviderType,
  modelName: string,
  fixed?: IFixedUsage,
): IFixedUsage | undefined {
  if (provider !== "openai" || modelName !== OPENAI_GPT_TRANSCRIBE_CANDIDATE_MODEL) return fixed;
  if (!fixed) {
    throw createSpeechError("GPT-Transcribe started-minute 정산에 duration usage가 필요합니다.", "SPEECH_PRICING_UNVERIFIED", 502);
  }
  const hasSeconds = fixed.seconds !== undefined;
  const hasMinutes = fixed.minutes !== undefined;
  const hasOtherUsage = Object.entries(fixed).some(([unit, value]) =>
    unit !== "seconds" && unit !== "minutes" && value !== undefined,
  );
  const selectedDuration = hasSeconds ? fixed.seconds : fixed.minutes;
  if (
    hasSeconds === hasMinutes || hasOtherUsage ||
    typeof selectedDuration !== "number" || !Number.isFinite(selectedDuration) || selectedDuration <= 0
  ) {
    throw createSpeechError("GPT-Transcribe duration usage는 audio seconds 또는 minutes 중 하나여야 합니다.", "SPEECH_PRICING_UNVERIFIED", 502);
  }
  // Avoid floating-point minute→second round trips at exact minute boundaries.
  return hasSeconds
    ? toStartedMinuteFixedUsageFromAudioSeconds(selectedDuration)
    : { minutes: Math.max(1, Math.ceil(selectedDuration)) };
}

function normalizeSpeechBillingInputs(args: {
  provider: BillableProviderType;
  modelName: string;
  usage?: ITokenUsageBreakdown;
  fixed?: IFixedUsage;
}) {
  return {
    usage: normalizeSpeechTokenUsageForSettlement(args),
    fixed: normalizeSpeechFixedUsageForSettlement(args.provider, args.modelName, args.fixed),
  };
}

export async function preflightSpeechBilling(args: {
  provider: BillableProviderType;
  modelName: string;
  usage?: ITokenUsageBreakdown;
  fixed?: IFixedUsage;
  billing?: ISpeechBillingContext;
  meta?: Record<string, unknown>;
}): Promise<ISpeechBillingResult> {
  const { provider, modelName, billing, meta } = args;
  const { usage, fixed } = normalizeSpeechBillingInputs(args);

  if (usage) {
    await assertPricingPreflightOrThrow({
      provider,
      modelName,
      modality: "audio",
      kind: "token",
    });
  }
  if (fixed) {
    await assertPricingPreflightOrThrow({
      provider,
      modelName,
      modality: "audio",
      kind: "fixed",
      fixedUnits: resolveSpeechFixedUnits(fixed),
    });
  }

  const estimatedCoins = estimateSpeechBillingCoins(provider, modelName, usage, fixed);

  if (billing?.skipCharge || !billing) {
    return { ok: true, coins: estimatedCoins, charged: false, estimated: true };
  }

  const routeHint = billing.routeHint;
  const app = resolveSpeechApp(routeHint, billing.app);
  const billToUniverse = Boolean(billing.billToUniverse || routeHint === "commerce");

  if (billToUniverse) {
    const universeId = String(billing.universeId || "").trim();
    if (!universeId) {
      if (billing.requireChargeContext) {
        throw createSpeechError("speech 과금용 universeId가 필요합니다.", "SPEECH_BILLING_CONTEXT_REQUIRED", 400);
      }
      return { ok: true, coins: estimatedCoins, charged: false, estimated: true };
    }

    const result = await assertCommerceAIUsageBalanceOrThrow({
      universeId,
      app,
      provider,
      modelName,
      usage,
      fixed,
      modality: "audio",
      meta,
    });

    return {
      ok: true,
      coins: typeof result?.coins === "number" ? result.coins : estimatedCoins,
      charged: false,
      estimated: true,
    };
  }

  const uid = String(billing.uid || "").trim();
  if (!uid) {
    if (billing.requireChargeContext) {
      throw createSpeechError("speech 과금용 uid가 필요합니다.", "SPEECH_BILLING_CONTEXT_REQUIRED", 400);
    }
    return { ok: true, coins: estimatedCoins, charged: false, estimated: true };
  }

  const result = await assertAIUsageBalanceOrThrow({
    uid,
    app,
    provider,
    modelName,
    usage,
    fixed,
    modality: "audio",
    meta,
  });

  return {
    ok: true,
    coins: typeof result?.coins === "number" ? result.coins : estimatedCoins,
    charged: false,
    estimated: true,
  };
}

export async function applySpeechBilling(args: {
  provider: BillableProviderType;
  modelName: string;
  usage?: ITokenUsageBreakdown;
  fixed?: IFixedUsage;
  billing?: ISpeechBillingContext;
  meta?: Record<string, unknown>;
}): Promise<ISpeechBillingResult> {
  const { provider, modelName, billing, meta } = args;
  const { usage, fixed } = normalizeSpeechBillingInputs(args);

  if (usage) {
    await assertPricingPreflightOrThrow({
      provider,
      modelName,
      modality: "audio",
      kind: "token",
    });
  }
  if (fixed) {
    await assertPricingPreflightOrThrow({
      provider,
      modelName,
      modality: "audio",
      kind: "fixed",
      fixedUnits: resolveSpeechFixedUnits(fixed),
    });
  }

  const estimatedCoins = estimateSpeechBillingCoins(provider, modelName, usage, fixed);

  if (billing?.skipCharge || !billing) {
    return { ok: true, coins: estimatedCoins, charged: false, estimated: true };
  }

  const routeHint = billing.routeHint;
  const app = resolveSpeechApp(routeHint, billing.app);
  const billToUniverse = Boolean(billing.billToUniverse || routeHint === "commerce");

  if (billToUniverse) {
    const universeId = String(billing.universeId || "").trim();
    if (!universeId) {
      if (billing.requireChargeContext) {
        throw createSpeechError("speech 과금용 universeId가 필요합니다.", "SPEECH_BILLING_CONTEXT_REQUIRED", 400);
      }
      return { ok: true, coins: estimatedCoins, charged: false, estimated: true };
    }

    const result = await billCommerceAIUsageOrThrow({
      universeId,
      app,
      provider,
      modelName,
      usage,
      fixed,
      modality: "audio",
      meta,
    });

    return {
      ok: true,
      coins: typeof result?.coins === "number" ? result.coins : estimatedCoins,
      charged: true,
      estimated: false,
    };
  }

  const uid = String(billing.uid || "").trim();
  if (!uid) {
    if (billing.requireChargeContext) {
      throw createSpeechError("speech 과금용 uid가 필요합니다.", "SPEECH_BILLING_CONTEXT_REQUIRED", 400);
    }
    return { ok: true, coins: estimatedCoins, charged: false, estimated: true };
  }

  const result = await billAIUsageOrThrow({
    uid,
    app,
    provider,
    modelName,
    usage,
    fixed,
    modality: "audio",
    meta,
  });

  return {
    ok: true,
    coins: typeof result?.coins === "number" ? result.coins : estimatedCoins,
    charged: true,
    estimated: false,
  };
}
