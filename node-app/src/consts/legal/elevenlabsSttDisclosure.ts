import { CURRENT_ACCOUNT_POLICY } from "./accountPolicy";

/**
 * EL-600에서 준비하는 녹음 직전 고지 계약.
 *
 * 이 상수는 UI가 임의로 문구를 만들지 않도록 정책 버전, 전송 범위, provider 보존과
 * AMU의 일시 처리 범위를 한 곳에 둔다. 현재 라우트는 닫혀 있으므로 이 계약을 import해도
 * ElevenLabs 호출은 발생하지 않는다.
 */
export const ELEVENLABS_STT_DISCLOSURE_VERSION = CURRENT_ACCOUNT_POLICY.privacy.version;
export const ELEVENLABS_STT_PROVIDER = "elevenlabs" as const;
export const ELEVENLABS_STT_MODEL = "scribe-v2" as const;
export const ELEVENLABS_STT_UPSTREAM_MODEL_ID = "scribe_v2" as const;
export const ELEVENLABS_STT_ALLOWED_LANGUAGES = ["ko", "en"] as const;
export const ELEVENLABS_STT_MAX_AUDIO_BYTES = 25 * 1024 * 1024;
export const ELEVENLABS_STT_MAX_DURATION_MS = 10 * 60 * 1000;

export const ELEVENLABS_STT_DISCLOSURE = {
  version: ELEVENLABS_STT_DISCLOSURE_VERSION,
  processor: "ElevenLabs",
  legalEntity: "Eleven Labs Inc.",
  transferCountry: "미국",
  crossBorderProcessing: true,
  purpose: "회원이 요청한 음성 입력을 Scribe v2로 문자로 변환",
  transferredData: ["회원이 녹음한 음성 파일", "회원이 선택한 언어 코드"] as const,
  returnedData: "ElevenLabs가 반환한 전사 텍스트는 사용자가 확인한 뒤 대화 텍스트로만 사용할 수 있음",
  amuStorage: "AMU는 변환 처리 직후 원음과 전용 전사 결과를 DB·R2·Redis·로그·분석 원장에 저장하지 않음",
  providerStorage:
    "ElevenLabs 표준 비-Enterprise 서비스의 기본 보존 및 삭제 조건이 적용되며, 180일 비활성 후 콘텐츠를 삭제할 권리는 있으나 삭제 의무는 없음. API 삭제가 디버깅·안전 로그나 백업까지 즉시 제거한다고 보장하지 않음",
  providerDataResidency:
    "표준 서비스의 기본 저장 위치는 미국이며, 제공자의 계열사·하위처리자·지원·안전 검토 과정에서 선택한 위치 밖으로 처리될 수 있음",
  audience: "verified_adult" as const,
  limits: {
    allowedLanguages: ELEVENLABS_STT_ALLOWED_LANGUAGES,
    maxAudioBytes: ELEVENLABS_STT_MAX_AUDIO_BYTES,
    maxDurationMs: ELEVENLABS_STT_MAX_DURATION_MS,
  },
  budget: {
    currency: "USD",
    unit: "audio_second",
    listPricePerHourUsd: 0.22,
    requestUsdCap: null,
    userDailyUsdCap: null,
    ownerDailyUsdCap: null,
    approvalRequired: true,
  },
  notice:
    "음성 입력을 사용하면 녹음 파일과 선택한 언어 코드가 미국의 Eleven Labs Inc.에 전송되어 Scribe v2 음성 인식에 처리됩니다. ElevenLabs 표준 보존·삭제 조건이 적용되며, AMU는 처리 직후 원음과 전용 전사 결과를 별도 저장하지 않습니다. 음성 입력을 허용하지 않으면 텍스트 입력만 사용할 수 있습니다.",
} as const;
