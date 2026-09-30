import "server-only";

import {
  ELEVENLABS_APPROVED_VOICE_CATALOG,
  ELEVENLABS_DEFAULT_TTS_MODEL,
  ELEVENLABS_TTS_SPEED_RANGE,
} from "consts/ai/voiceCatalog";
import { assertSystemModelEnabledOrThrow } from "libs/server-utils/api/systemModelControl";
import {
  createSystemPricingSnapshotRevision,
  getSystemPricingMaps,
} from "libs/server-utils/api/systemPricingControl";
import {
  STUDIO_AUDIO_MAX_TEXT_LENGTH,
  STUDIO_AUDIO_TEMPLATE_KEYS,
  resolveStudioAudioCharacterLimit,
  validateStudioAudioRequest,
} from "libs/server-utils/lab/studioAudioContract";
import { assertAIUsageBalanceOrThrow } from "libs/services/aiUsageBilling";
import { toErrorLike, toUnknownRecord } from "utils/common/typeUtils";

// enqueueStudioAudioJob의 preflight와 같은 billing app이어야 한다(studioAudioJobQueue.ts의 BILLING_APP).
// 다르면 estimate와 예약 상한·지갑 정책이 어긋난다.
const STUDIO_AUDIO_BILLING_APP = "gen_studio_audio";

export const STUDIO_AUDIO_FAST_PRESET_MODEL = "eleven-flash-v2-5" as const;
export const STUDIO_AUDIO_QUALITY_PRESET_MODEL = "eleven-multilingual-v2" as const;
export const STUDIO_AUDIO_FORMATS = ["mp3", "wav", "opus", "pcm"] as const;

export type StudioAudioPresetType = "fast" | "quality";

export type StudioAudioVoiceOption = {
  voiceId: string;
  label: string;
  locales: string[];
  tags: string[];
  usage: "production";
  creditMultiplier: 1;
  sourceCategory: string;
  commercialUseAllowed: true;
};

export type StudioAudioModelOption = {
  modelName: string;
  preset: StudioAudioPresetType;
  label: { ko: string; en: string };
  description: { ko: string; en: string };
};

export type StudioAudioCatalog = {
  defaultModelName: string;
  maxTextLength: number;
  minTextLength: number;
  silenceMaxMs: number;
  speed: { min: number; max: number; step: number; defaultValue: number };
  formats: readonly string[];
  templates: readonly string[];
  models: StudioAudioModelOption[];
  voices: StudioAudioVoiceOption[];
};

const PREVIEW_CHARS = 80;

function safe(value: unknown, maxLength = 240) {
  return String(value ?? "").trim().slice(0, maxLength);
}

/**
 * 승인 catalog의 운영·권리 내부 필드(evidence, operationalTerms, verifiedAt)는 노출하지 않고
 * client가 Voice를 고르는 데 필요한 공개 필드만 추린다.
 */
export function listStudioAudioVoiceOptions(): StudioAudioVoiceOption[] {
  return ELEVENLABS_APPROVED_VOICE_CATALOG
    .filter((entry) => entry.rightsStatus === "verified_commercial" && entry.usage === "production")
    .map((entry) => ({
      voiceId: entry.voiceId,
      label: entry.label,
      locales: [...entry.locales],
      tags: [...entry.tags],
      usage: "production" as const,
      creditMultiplier: 1 as const,
      sourceCategory: entry.sourceCategory,
      commercialUseAllowed: true as const,
    }));
}

export function getStudioAudioCatalog(): StudioAudioCatalog {
  return {
    defaultModelName: ELEVENLABS_DEFAULT_TTS_MODEL,
    maxTextLength: STUDIO_AUDIO_MAX_TEXT_LENGTH,
    minTextLength: 1,
    silenceMaxMs: 10_000,
    speed: {
      min: ELEVENLABS_TTS_SPEED_RANGE.min,
      max: ELEVENLABS_TTS_SPEED_RANGE.max,
      step: ELEVENLABS_TTS_SPEED_RANGE.step,
      defaultValue: 1,
    },
    formats: STUDIO_AUDIO_FORMATS,
    templates: STUDIO_AUDIO_TEMPLATE_KEYS,
    models: [
      {
        modelName: STUDIO_AUDIO_FAST_PRESET_MODEL,
        preset: "fast",
        label: { ko: "빠른 생성", en: "Fast" },
        description: {
          ko: "짧은 대기 시간과 낮은 비용을 우선합니다.",
          en: "Prioritizes low latency and lower cost.",
        },
      },
      {
        modelName: STUDIO_AUDIO_QUALITY_PRESET_MODEL,
        preset: "quality",
        label: { ko: "고품질", en: "High quality" },
        description: {
          ko: "한국어 억양과 표현력을 우선합니다.",
          en: "Prioritizes Korean intonation and expressiveness.",
        },
      },
    ],
    voices: listStudioAudioVoiceOptions(),
  };
}

export type StudioAudioEstimateResult = {
  estimatedCoins: number;
  characters: number;
  segmentCount: number;
  segments: Array<{ segmentIndex: number; orderedIndex: number; charCount: number; preview: string }>;
  maxTextLength: number;
  pricingRevision: string;
  billingKey: string;
  provider: "elevenlabs";
  modelName: string;
  voiceId: string;
  locale: string;
  format: string;
  speed: number;
  silenceMs: number;
};

export type StudioAudioEstimateOutcome =
  | { ok: true; data: StudioAudioEstimateResult }
  | { ok: false; error: string; errorCode: string };

/**
 * 무과금 서버 가격 snapshot. enqueue의 preflight와 동일한 가격 map·character 산정을 사용하되
 * balance/예약/queue 쓰기는 하지 않는다. client 금액을 최종 과금 근거로 쓰지 않는다.
 */
export async function estimateStudioAudio(args: {
  request: unknown;
  uid: string;
}): Promise<StudioAudioEstimateOutcome> {
  const uid = safe(args.uid, 160);
  if (!uid) return { ok: false, error: "UNAUTHORIZED", errorCode: "UNAUTHORIZED" };

  const initial = validateStudioAudioRequest({ ...toUnknownRecord(args.request), uid });
  if (!initial.ok) return { ok: false, error: initial.error, errorCode: "AUDIO_REQUEST_INVALID" };

  try {
    await assertSystemModelEnabledOrThrow({
      provider: initial.request.provider,
      modelName: initial.request.modelName,
      modality: "audio",
    });
  } catch (error) {
    const err = toErrorLike(error);
    return {
      ok: false,
      error: safe(err.message) || "AUDIO_MODEL_NOT_AVAILABLE",
      errorCode: safe(err.errorCode || err.code) || "AUDIO_MODEL_NOT_AVAILABLE",
    };
  }

  const characters = initial.manifest.segments.reduce((sum, segment) => sum + Math.max(0, segment.charCount), 0);
  if (characters <= 0) return { ok: false, error: "AUDIO_TEXT_REQUIRED", errorCode: "AUDIO_REQUEST_INVALID" };

  const pricingRevision = createSystemPricingSnapshotRevision(await getSystemPricingMaps());

  // enqueue와 같은 fail-closed를 탄다 — 단가 키가 없으면 가격 계산 helper는 예외 없이 0코인을
  // 반환하지만 enqueue는 assertPricingConfigured에서 PRICING_NOT_FOUND(503)로 막힌다. estimate가
  // 먼저 0코인을 보여주면 사용자는 생성 직전에야 503을 만난다. 그래서 같은 preflight 함수로 검증한다.
  let preview: Awaited<ReturnType<typeof assertAIUsageBalanceOrThrow>>;
  try {
    preview = await assertAIUsageBalanceOrThrow({
      uid,
      app: STUDIO_AUDIO_BILLING_APP,
      provider: initial.request.provider,
      modelName: initial.request.modelName,
      modality: "audio",
      fixed: { characters },
      meta: { operationId: `audio:${initial.request.clientRequestId}:estimate`, pricingRevision, source: "gen-studio" },
    });
  } catch (error) {
    const err = toErrorLike(error);
    return {
      ok: false,
      error: safe(err.message) || "AUDIO_PRICING_UNAVAILABLE",
      errorCode: safe(err.errorCode || err.code) || "AUDIO_PRICING_UNAVAILABLE",
    };
  }
  const previewRecord = preview as { coins?: unknown; billingKey?: unknown };

  return {
    ok: true,
    data: {
      estimatedCoins: Math.max(0, Math.ceil(Number(previewRecord.coins) || 0)),
      characters,
      segmentCount: initial.manifest.segmentCount,
      segments: initial.manifest.segments.map((segment) => ({
        segmentIndex: segment.segmentIndex,
        orderedIndex: segment.orderedIndex,
        charCount: segment.charCount,
        preview: safe(segment.text, PREVIEW_CHARS),
      })),
      maxTextLength: resolveStudioAudioCharacterLimit(
        initial.request.modelName,
        initial.request.providerCharacterLimit,
      ),
      pricingRevision,
      billingKey: safe(previewRecord.billingKey, 160),
      provider: "elevenlabs",
      modelName: initial.request.modelName,
      voiceId: initial.request.voiceId,
      locale: initial.request.locale,
      format: initial.request.format,
      speed: initial.request.speed,
      silenceMs: initial.request.silenceMs,
    },
  };
}

export type { StudioAudioEstimateOutcome as StudioAudioEstimateResponse };
