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
export {
  TUTORS_STT_SAFETY_OUTCOMES,
  evaluateTutorsSttSafety,
  getDefaultTutorsSttSafetyPolicy,
} from "./tutorsSttSafety";
export type {
  TutorsSttSafetyDecision,
  TutorsSttSafetyOutcome,
  TutorsSttSafetyPolicy,
  TutorsSttSafetyRequest,
  TutorsTrustedAudienceEligibility,
} from "./tutorsSttSafety";
export type {
  AdultEligibility,
  VoiceAudioRetention,
  VoiceDataConsentDecision,
  VoiceDataConsentReasonCode,
  VoiceProcessingIntent,
} from "./voiceDataConsent";
export {
  TUTORS_AUDIO_TURN_OUTCOMES,
  evaluateTutorsAudioTurn,
  getDefaultTutorsAudioTurnPolicy,
  isAudioCapableChatModel,
  normalizeChatInputModality,
  resolveTutorsAudioTurnPolicy,
} from "./tutorsAudioTurnPolicy";
export type {
  TutorsAudioTurnDecision,
  TutorsAudioTurnOutcome,
  TutorsAudioTurnPolicy,
  TutorsAudioTurnRequest,
} from "./tutorsAudioTurnPolicy";
export type * from "./types";
