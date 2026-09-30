import { CURRENT_ACCOUNT_POLICY } from "./accountPolicy";

export const VOICE_DATA_CONSENT_PURPOSE_ID = "voice_data" as const;
/** Legacy operation gate keys; they are not separately persisted purpose consent IDs. */
export const QWEN_ASR_AUDIO_CONSENT_PURPOSE_ID = "qwen_asr_audio" as const;
export const QWEN_OMNI_AUDIO_CONSENT_PURPOSE_ID = "qwen_omni_audio" as const;
export const QWEN_OMNI_VIDEO_CONSENT_PURPOSE_ID = "qwen_omni_video" as const;
/** Only Omni audio/video remain separately represented, and both stay disabled. */
export const QWEN_MODEL_STUDIO_CONSENT_PURPOSE_IDS = [
  QWEN_OMNI_AUDIO_CONSENT_PURPOSE_ID,
  QWEN_OMNI_VIDEO_CONSENT_PURPOSE_ID,
] as const;
export type QwenPersistedPurposeConsentId = (typeof QWEN_MODEL_STUDIO_CONSENT_PURPOSE_IDS)[number];
export type QwenModelStudioConsentPurposeId =
  | QwenPersistedPurposeConsentId
  | typeof QWEN_ASR_AUDIO_CONSENT_PURPOSE_ID;
export type VoicePurposeConsentPurposeId =
  | typeof VOICE_DATA_CONSENT_PURPOSE_ID
  | QwenPersistedPurposeConsentId;

export type QwenPurposeConsentContract = {
  purposeId: QwenPersistedPurposeConsentId;
  provider: "alibaba_cloud_model_studio";
  modality: "audio" | "video" | "text";
  contractVersion: string | null;
  linkedPrivacyVersion: string | null;
  retentionConfirmed: boolean;
  grantable: boolean;
  transferAllowed: boolean;
};

/**
 * Qwen purpose consent stays blocked until the matching Node privacy policy is
 * publicly effective and its WordPress rendering has been parity-checked.
 * Populate these values only with evidence for the exact CURRENT_ACCOUNT_POLICY version.
 */
export const QWEN_MODEL_STUDIO_PRIVACY_RELEASE_GATE = {
  privacyVersion: "1.10.0",
  noticeDate: "2026-09-29T00:00:00+09:00",
  effectiveDate: "2026-10-06T00:00:00+09:00",
  noticePublishedAt: "2026-09-29T11:28:41+09:00",
  wordpressParityConfirmedAt: "2026-09-29T13:17:51+09:00",
} as const;

export function isQwenPrivacyPolicyReleaseReady(linkedPrivacyVersion: string | null, now = new Date()) {
  const privacy = CURRENT_ACCOUNT_POLICY.privacy;
  const gate = QWEN_MODEL_STUDIO_PRIVACY_RELEASE_GATE;
  const nowMs = now.getTime();
  const noticeDateMs = Date.parse(gate.noticeDate);
  const effectiveDateMs = Date.parse(gate.effectiveDate);
  const noticePublishedAtMs = Date.parse(gate.noticePublishedAt || "");
  const wordpressParityConfirmedAtMs = Date.parse(gate.wordpressParityConfirmedAt || "");

  return Boolean(
    linkedPrivacyVersion &&
      linkedPrivacyVersion === gate.privacyVersion &&
      gate.privacyVersion === privacy.version &&
      Number.isFinite(nowMs) &&
      Number.isFinite(noticeDateMs) &&
      Number.isFinite(effectiveDateMs) &&
      Number.isFinite(noticePublishedAtMs) &&
      Number.isFinite(wordpressParityConfirmedAtMs) &&
      noticePublishedAtMs >= noticeDateMs &&
      noticePublishedAtMs <= nowMs &&
      wordpressParityConfirmedAtMs >= noticePublishedAtMs &&
      wordpressParityConfirmedAtMs <= nowMs &&
      nowMs >= noticeDateMs &&
      nowMs >= effectiveDateMs,
  );
}

/**
 * Omni audio/video remain disabled. ASR uses the versioned voice_data consent.
 */
export const QWEN_MODEL_STUDIO_CONSENT_CONTRACTS: Record<
  QwenPersistedPurposeConsentId,
  QwenPurposeConsentContract
> = {
  [QWEN_OMNI_AUDIO_CONSENT_PURPOSE_ID]: {
    purposeId: QWEN_OMNI_AUDIO_CONSENT_PURPOSE_ID,
    provider: "alibaba_cloud_model_studio",
    modality: "audio",
    contractVersion: null,
    linkedPrivacyVersion: null,
    retentionConfirmed: false,
    grantable: false,
    transferAllowed: false,
  },
  [QWEN_OMNI_VIDEO_CONSENT_PURPOSE_ID]: {
    purposeId: QWEN_OMNI_VIDEO_CONSENT_PURPOSE_ID,
    provider: "alibaba_cloud_model_studio",
    modality: "video",
    contractVersion: null,
    linkedPrivacyVersion: null,
    retentionConfirmed: false,
    grantable: false,
    transferAllowed: false,
  },
};

export const VOICE_DATA_CONSENT_VERSION = "1.1.0" as const;
export const VOICE_DATA_CONSENT_LINKED_PRIVACY_VERSION = CURRENT_ACCOUNT_POLICY.privacy.version;
export const VOICE_DATA_CONSENT_PROVIDER = "openai" as const;
export const VOICE_DATA_CONSENT_PROVIDERS = ["openai", "alibaba_cloud_model_studio"] as const;
export const VOICE_DATA_CONSENT_ENDPOINT = "/v1/audio/transcriptions" as const;
export const VOICE_DATA_CONSENT_DERIVED_RETENTION_DAYS = 30;
export const VOICE_DATA_CONSENT_REVOCATION_SLA_HOURS = 24;

/**
 * 음성 원음 처리를 위한 별도 목적 동의. Qwen ASR은 현재 privacy/consent 버전에서만 통과한다.
 */
export const VOICE_DATA_CONSENT_NOTICE =
  "회원이 별도 안내를 받고 이 목적에 동의한 경우, 회사는 음성 입력을 텍스트로 변환하거나 선택한 Tutor의 학습 대화 응답을 제공하기 위해 원본 음성을 OpenAI gpt-transcribe 또는 Alibaba Cloud Model Studio의 Qwen ASR에 전달할 수 있습니다. Qwen ASR 전송은 개인정보처리방침 v1.10.0 및 이 목적 동의 v1.1.0에 동의한 뒤에만 허용하며 이전 버전의 동의는 Qwen ASR에 적용되지 않습니다. 원본 음성은 AMU 서버에 저장하지 않고 요청 처리 중에만 사용합니다. Qwen 제공자 측 보유·삭제는 Alibaba Cloud International Product Terms §4.48 및 해당하는 범위의 Membership Agreement Data Processing Addendum 등 제공자 표준 약관에 따르며, 공개 자료에서 고정 보유기간이나 백업 삭제 시점을 확인할 수 없어 별도 기간을 보장하지 않습니다. 이 목적은 발음 점수화, 음성 특성 분석, 화자 식별·인증, 음성 복제, 광고 또는 프로파일링에 사용하지 않습니다. 동의를 거부하거나 철회하면 Qwen ASR을 사용할 수 없고, 가능한 경우 텍스트 입력 등 다른 입력 방식을 이용할 수 있습니다.";

export type VoicePurposeConsentMethod = "purpose_consent" | "purpose_reconsent";

export type VoicePurposeConsentRecord = {
  purposeId: VoicePurposeConsentPurposeId;
  version: string;
  /** Qwen purposes bind consent to a particular public privacy-policy version. */
  linkedPrivacyVersion?: string;
  agreedAt: Date | string;
  method: VoicePurposeConsentMethod;
  revokedAt?: Date | string;
};
