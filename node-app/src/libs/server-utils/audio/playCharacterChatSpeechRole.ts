import "server-only";

/**
 * @docHint
 * @purpose Play CharacterChat speech 역할(STT·TTS=ElevenLabs) 서버 판정과 Admin Only cutover
 * @process feature access 판정 → manifest 역할 default 조회 → provider·model·voice·locale 검증 → route에 역할 결과 반환
 * @domain speech
 * @scope server
 */

import { AI_ELEVENLABS_APPROVED_VOICE_CATALOG } from "consts/ai/generated/modelCatalog.generated";
import { getDefaultSpeechModelName } from "consts/ai/speechModel";
import { PLAY_FEATURE_KEYS } from "consts/system/featureRollout";
import { resolveFeatureAccess } from "libs/server-utils/auth/featureAccessPolicy";
import { resolveLegacyOpenAiVoiceToElevenLabs } from "./legacyOpenAiVoiceMapping";
import { createSpeechError } from "./guards";

/** Play world route hints served by CharacterChat. */
export const PLAY_CHARACTER_CHAT_SPEECH_ROUTE_HINTS = ["ai", "commerce"] as const;
export const PLAY_SPEECH_BUDGET_OWNER = "play" as const;

type ApprovedVoice = (typeof AI_ELEVENLABS_APPROVED_VOICE_CATALOG)[number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function approvedVoice(voiceId: unknown): ApprovedVoice | undefined {
  const id = String(voiceId || "").trim();
  if (!id) return undefined;
  return (AI_ELEVENLABS_APPROVED_VOICE_CATALOG as readonly ApprovedVoice[]).find(
    (voice) => voice.voiceId === id && voice.usage === "production" && voice.rightsStatus === "verified_commercial",
  );
}

function throwRoleDefaultUnavailable(provider: "openai" | "elevenlabs", role: "speech_stt" | "speech_tts") {
  throw createSpeechError("승인된 음성 역할 기본 모델이 없습니다.", "SPEECH_ROLE_DEFAULT_UNAVAILABLE", 503, {
    provider,
    role,
  });
}

/** Admin Only 기능 접근이 허용된 Play 요청만 서버 역할 정책으로 전환한다. */
export async function resolvePlayCharacterChatSpeechCutover(args: {
  routeHint: string;
  user: unknown;
}): Promise<{ cutover: boolean }> {
  if (!(PLAY_CHARACTER_CHAT_SPEECH_ROUTE_HINTS as readonly string[]).includes(args.routeHint)) {
    return { cutover: false };
  }
  const access = await resolveFeatureAccess({ featureKey: PLAY_FEATURE_KEYS.characterChatVoice, user: args.user });
  if (!access.allowed) {
    throw createSpeechError("성인 확인 전에는 Play 음성 기능을 사용할 수 없습니다. 텍스트로 계속해 주세요.", "SPEECH_AUDIENCE_RESTRICTED", 403, {
      provider: "elevenlabs",
      owner: PLAY_SPEECH_BUDGET_OWNER,
      blockedReason: access.reason,
    });
  }
  return { cutover: access.allowed };
}

/** Client STT provider/model are accepted only when they match the approved server role. */
export function resolvePlayCharacterChatSttRoleOrThrow(args: {
  requestedProvider?: unknown;
  requestedModelName?: unknown;
}): { provider: "elevenlabs"; modelName: string } {
  const modelName = String(getDefaultSpeechModelName("elevenlabs", "speech_stt") || "").trim();
  if (!modelName) throwRoleDefaultUnavailable("elevenlabs", "speech_stt");

  const provider = String(args.requestedProvider || "").trim().toLowerCase();
  if (provider && provider !== "elevenlabs") {
    throw createSpeechError("Play CharacterChat STT provider가 승인되지 않았습니다.", "SPEECH_PROVIDER_NOT_APPROVED", 409, {
      role: "speech_stt",
      provider,
    });
  }

  const requestedModelName = String(args.requestedModelName || "").trim();
  if (requestedModelName && requestedModelName !== modelName) {
    throw createSpeechError("Play CharacterChat STT 모델이 승인되지 않았습니다.", "SPEECH_MODEL_NOT_APPROVED", 409, {
      role: "speech_stt",
      modelName: requestedModelName,
    });
  }

  return { provider: "elevenlabs", modelName };
}

/** Selects an approved ElevenLabs voice from the persisted persona profile, never from a client override. */
export function resolvePlayCharacterChatTtsRoleOrThrow(args: {
  requestedProvider?: unknown;
  requestedVoiceProfile?: unknown;
  personaVoiceProfile?: unknown;
  locale?: string;
}): { provider: "elevenlabs"; modelName: string; voiceId: string; locale: string } {
  const modelName = String(getDefaultSpeechModelName("elevenlabs", "speech_tts") || "").trim();
  if (!modelName) throwRoleDefaultUnavailable("elevenlabs", "speech_tts");

  const requestedProvider = String(args.requestedProvider || "").trim().toLowerCase();
  if (requestedProvider && requestedProvider !== "elevenlabs") {
    throw createSpeechError("Play CharacterChat TTS provider가 승인되지 않았습니다.", "SPEECH_PROVIDER_NOT_APPROVED", 409, {
      role: "speech_tts",
      provider: requestedProvider,
    });
  }

  if (args.requestedVoiceProfile != null) {
    const requested = isRecord(args.requestedVoiceProfile) ? args.requestedVoiceProfile : {};
    const provider = String(requested.provider || "").trim().toLowerCase();
    if (provider !== "elevenlabs") {
      throw createSpeechError("Play CharacterChat voice profile provider가 승인되지 않았습니다.", "SPEECH_PROVIDER_NOT_APPROVED", 409, {
        role: "speech_tts",
        provider,
      });
    }
    if (!approvedVoice(requested.voiceId)) {
      throw createSpeechError("요청한 ElevenLabs voice가 승인되지 않았습니다.", "VOICE_NOT_APPROVED", 503, {
        provider: "elevenlabs",
        voiceId: String(requested.voiceId || "").trim(),
      });
    }
  }

  const personaProfile = isRecord(args.personaVoiceProfile) ? args.personaVoiceProfile : {};
  const personaProvider = String(personaProfile.provider || "").trim().toLowerCase();
  const personaVoiceId = String(personaProfile.voiceId || "").trim();
  let voiceId = "";
  if (personaProvider === "elevenlabs") {
    if (!approvedVoice(personaVoiceId)) {
      throw createSpeechError("페르소나 ElevenLabs voice가 승인되지 않았습니다.", "VOICE_NOT_APPROVED", 503, {
        provider: "elevenlabs",
        voiceId: personaVoiceId,
      });
    }
    voiceId = personaVoiceId;
  } else if (!personaProvider || personaProvider === "openai") {
    voiceId = resolveLegacyOpenAiVoiceToElevenLabs(personaVoiceId) || "";
    if (!approvedVoice(voiceId)) {
      throw createSpeechError("기존 voice profile을 승인된 ElevenLabs voice로 매핑할 수 없습니다.", "VOICE_NOT_APPROVED", 503, {
        provider: "elevenlabs",
        voiceId: personaVoiceId,
      });
    }
  } else {
    throw createSpeechError("페르소나 voice provider를 승인된 ElevenLabs voice로 매핑할 수 없습니다.", "VOICE_NOT_APPROVED", 503, {
      provider: personaProvider,
      voiceId: personaVoiceId,
    });
  }

  const locale = String(args.locale || "ko").trim() || "ko";
  const selectedVoice = approvedVoice(voiceId);
  const requestedLanguage = locale.toLowerCase().split("-")[0];
  const localeSupported = selectedVoice?.locales.some((supportedLocale) => {
    const normalizedLocale = String(supportedLocale).toLowerCase();
    return normalizedLocale === locale.toLowerCase() || normalizedLocale.split("-")[0] === requestedLanguage;
  });
  if (selectedVoice?.locales.length && !localeSupported) {
    throw createSpeechError("선택한 ElevenLabs voice가 요청 언어를 지원하지 않습니다.", "VOICE_LOCALE_NOT_SUPPORTED", 400, {
      voiceId,
      locale,
    });
  }

  return { provider: "elevenlabs", modelName, voiceId, locale };
}
