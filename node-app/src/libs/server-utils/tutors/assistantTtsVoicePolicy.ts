import {
  ELEVENLABS_APPROVED_VOICE_CATALOG,
  ELEVENLABS_DEFAULT_TTS_MODEL,
  getElevenLabsVoiceCatalogEntry,
  isApprovedElevenLabsVoiceId,
} from "consts/ai/voiceCatalog";
import { buildVoiceFingerprint } from "libs/server-utils/audio/cacheKeys";
import type { TutorsAssistantTtsVoiceSnapshot } from "./assistantTtsJobContract";
import {
  loadTutorsVoicePilotConfig,
  resolveExposableTutorsVoices,
  resolveTutorsVoicePilotSurface,
  type TutorsVoicePilotConfig,
} from "./tutorsVoicePilotContract";

/**
 * @docHint
 * @purpose EL-602 Tutors Assistant TTS voice 정책 — 승인 voice allowlist와 결정적 legacy 매핑
 * @process 정책 resolve → legacy openai profile 매핑 → 승인 voice snapshot
 * @domain tutors-tts
 * @scope server
 */

export type TutorsAssistantTtsVoicePolicy = {
  provider: "elevenlabs";
  modelName: string;
  /** 서버가 승인한 voiceId만. 기본 빈 배열(닫힘). 클라이언트 값으로 열 수 없다. */
  voiceAllowlist: readonly string[];
};

/** 운영 기본값 — 빈 allowlist(닫힘). */
export function getDefaultTutorsAssistantTtsVoicePolicy(): TutorsAssistantTtsVoicePolicy {
  return {
    provider: "elevenlabs",
    modelName: ELEVENLABS_DEFAULT_TTS_MODEL,
    voiceAllowlist: [],
  };
}

export function resolveTutorsAssistantTtsVoicePolicy(
  base: TutorsAssistantTtsVoicePolicy = getDefaultTutorsAssistantTtsVoicePolicy(),
): TutorsAssistantTtsVoicePolicy {
  return {
    provider: "elevenlabs",
    modelName: String(base.modelName || ELEVENLABS_DEFAULT_TTS_MODEL).trim() || ELEVENLABS_DEFAULT_TTS_MODEL,
    voiceAllowlist: Array.isArray(base.voiceAllowlist) ? [...base.voiceAllowlist] : [],
  };
}

/**
 * 구 OpenAI voice profile → 승인된 ElevenLabs ko voice의 결정적 매핑.
 * 매핑 미확정 voice는 null이며 임의 Voice나 OpenAI fallback으로 대체하지 않는다.
 */
export const LEGACY_OPENAI_TO_ELEVENLABS_VOICE: Readonly<Record<string, string>> = {
  alloy: "5I7B1di44aCL15NkP0jn", // Kanna - Calm & Friendly
  ash: "CxErO97xpQgQXYmapDKX", // Theo - Warm, Smooth and Soft
  ballad: "Lb7qkOn5hF8p7qfCDH8q", // Annie - Friendly, Soft and Clear
  coral: "zXNMXSB7uul4lbmpaVAn", // Dahye - Clear Korean Explainer
  echo: "CxErO97xpQgQXYmapDKX", // Theo - Warm, Smooth and Soft
  fable: "4JJwo477JUAx3HV0T7n7", // Yohan Koo - Encouraging, Clear and Airy
  nova: "Lb7qkOn5hF8p7qfCDH8q", // Annie - Friendly, Soft and Clear
  onyx: "uyVNoMrnUku1dZyVEXwD", // Anna Kim - Tender, Calm and Clear
  sage: "uyVNoMrnUku1dZyVEXwD", // Anna Kim - Tender, Calm and Clear
  shimmer: "uyVNoMrnUku1dZyVEXwD", // Anna Kim - Tender, Calm and Clear
  verse: "4JJwo477JUAx3HV0T7n7", // Yohan Koo - Encouraging, Clear and Airy
  marin: "5I7B1di44aCL15NkP0jn", // Kanna - Calm & Friendly
  cedar: "CxErO97xpQgQXYmapDKX", // Theo - Warm, Smooth and Soft
};

export function resolveLegacyOpenAiVoiceToElevenLabs(legacyVoiceId: unknown): string | null {
  const key = String(legacyVoiceId || "")
    .trim()
    .toLowerCase();
  if (!key) return null;
  const mapped = LEGACY_OPENAI_TO_ELEVENLABS_VOICE[key];
  return mapped || null;
}

export function isApprovedTutorsAssistantTtsVoiceId(
  voiceId: unknown,
  policy: TutorsAssistantTtsVoicePolicy,
): boolean {
  const id = String(voiceId || "").trim();
  if (!id) return false;
  if (!policy.voiceAllowlist.includes(id)) return false;
  // voiceId는 대소문자를 보존한다. allowlist와 승인 catalog 모두 exact match다.
  return isApprovedElevenLabsVoiceId(id, { productionOnly: true });
}

/** 승인 voice snapshot. 승인되지 않은 voiceId면 null(임의 Voice 금지). */
export function buildTutorsAssistantTtsVoiceSnapshot(args: {
  voiceId: unknown;
  modelName?: unknown;
  locale?: unknown;
  policy: TutorsAssistantTtsVoicePolicy;
  contentHash?: unknown;
  format?: unknown;
  speed?: unknown;
}): TutorsAssistantTtsVoiceSnapshot | null {
  const voiceId = String(args.voiceId || "").trim();
  if (!isApprovedTutorsAssistantTtsVoiceId(voiceId, args.policy)) return null;
  const entry = getElevenLabsVoiceCatalogEntry(voiceId);
  if (!entry) return null;
  const modelName =
    String(args.modelName || args.policy.modelName || ELEVENLABS_DEFAULT_TTS_MODEL).trim() || ELEVENLABS_DEFAULT_TTS_MODEL;
  const locale = String(args.locale || "ko").trim() || "ko";
  const voiceFingerprint = buildVoiceFingerprint(
    {
      provider: "elevenlabs",
      voiceId,
      modelName,
      locale,
      voiceRevision: entry.voiceRevision,
    },
    {
      contentHash: typeof args.contentHash === "string" ? args.contentHash : undefined,
      format: typeof args.format === "string" ? args.format : undefined,
      speed: typeof args.speed === "number" ? args.speed : undefined,
    },
  );
  return {
    provider: "elevenlabs",
    voiceId,
    modelName,
    locale,
    voiceRevision: entry.voiceRevision,
    voiceFingerprint,
  };
}

/**
 * EL-P6-ACTIVATION Stream B — 파일럿 노출 surface를 ATS voice 정책으로 매핑한다.
 * 노출이 허용된 경우에만 config의 voiceAllowlist ∩ 승인 production 카탈로그를 쓴다.
 * 기본(설정 미비/미노출)은 빈 allowlist(닫힘)다.
 */
export function resolveTutorsAssistantTtsVoicePolicyFromPilot(args: {
  config?: TutorsVoicePilotConfig | null;
  exposure: { exposed: boolean; voices: string[] };
}): TutorsAssistantTtsVoicePolicy {
  const base = getDefaultTutorsAssistantTtsVoicePolicy();
  if (!args.exposure.exposed || args.exposure.voices.length === 0) return base;
  return {
    provider: "elevenlabs",
    modelName: String(args.config?.ttsModel || base.modelName) || ELEVENLABS_DEFAULT_TTS_MODEL,
    voiceAllowlist: [...args.exposure.voices],
  };
}

/**
 * 설정을 읽어 파일럿 surface 노출을 판정한 뒤 ATS voice 정책을 돌려준다.
 * surface 소비의 서버 단일 진입점이며, 설정 미비/장애 시 닫힌 정책([])이다.
 */
export async function loadTutorsAssistantTtsVoicePolicyFromPilot(args?: {
  uid?: unknown;
  universeId?: unknown;
  consentVersion?: unknown;
}): Promise<TutorsAssistantTtsVoicePolicy> {
  const config = await loadTutorsVoicePilotConfig();
  const surface = resolveTutorsVoicePilotSurface({
    config,
    uid: args?.uid,
    universeId: args?.universeId,
    consentVersion: args?.consentVersion,
    catalog: ELEVENLABS_APPROVED_VOICE_CATALOG,
  });
  return resolveTutorsAssistantTtsVoicePolicyFromPilot({
    config,
    exposure: {
      exposed: surface.exposed,
      // 노출이 열려도 실제 Voice는 allowlist ∩ 승인 카탈로그만 남긴다.
      voices: surface.exposed
        ? resolveExposableTutorsVoices({
            voiceAllowlist: config.voiceAllowlist,
            catalog: ELEVENLABS_APPROVED_VOICE_CATALOG,
          })
        : [],
    },
  });
}
