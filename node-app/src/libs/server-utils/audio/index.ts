export { preflightTranscribeSpeech, transcribeSpeech } from "./transcribeSpeech";
export { analyzeSpeechAudio, preflightSpeechAudioAnalysis } from "./analyzeSpeechAudio";
export { synthesizeSpeech } from "./synthesizeSpeech";
export { resolveVoiceProfile } from "./voiceProfileResolver";
export { buildAssistantAudioCacheKey, buildLegacyVoiceFingerprint, buildMessageAudioMeta, buildVoiceFingerprint } from "./cacheKeys";
export {
  normalizePersonaVoiceProfile,
  normalizePersonaVoiceProfileForGender,
  persistResolvedPersonaVoiceProfile,
} from "./personaVoiceProfile";
export {
  SPEECH_DEFAULT_MAX_DURATION_MS,
  SPEECH_MAX_AUDIO_BYTES,
  SPEECH_MAX_TTS_TEXT_LENGTH,
  assertSpeechAudioInputOrThrow,
  assertSpeechSynthesisTextOrThrow,
  createSpeechError,
  resolveSpeechSynthesisContentType,
} from "./guards";
export {
  applySpeechBilling,
  estimateSpeechSynthesisUsageFromText,
  estimateSpeechTranscriptionFixedUsage,
  estimateSpeechTranscriptionUsageFromText,
  estimateSpeechUsageFromText,
  preflightSpeechBilling,
  toSpeechResponseUsage,
} from "./billing";
export {
  VOICE_DATA_CONSENT_CONTRACT_VERSION,
  VOICE_DATA_CONSENT_POLICY_ID,
  assertVoiceDataConsentOrThrow,
  resolveAdultEligibility,
  resolveVoiceDataConsent,
} from "./voiceDataConsent";
export type {
  AdultEligibility,
  VoiceAudioRetention,
  VoiceDataAudienceEligibility,
  VoiceDataConsentDecision,
  VoiceDataConsentReasonCode,
  VoiceProcessingIntent,
} from "./voiceDataConsent";
export type * from "./types";
