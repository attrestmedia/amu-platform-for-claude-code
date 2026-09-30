import "server-only";
import { toUnknownRecord } from "utils/common";
import {
  VOICE_DATA_CONSENT_PURPOSE_ID,
  VOICE_DATA_CONSENT_VERSION,
} from "consts/legal/voiceDataConsent";
import { createSpeechError } from "./guards";
import type { TutorsTrustedAudienceEligibility } from "./tutorsSttSafety";

/**
 * @docHint
 * @purpose 사용자 음성 원음의 provider 전송·임시 저장·분석에 대한 서버 검증 동의 판정
 * @process 요청 필드 무시 → 저장된 동의 원장 조회 → 성인 eligibility 판정 → fail-closed 결정 반환
 * @domain speech
 * @scope server
 *
 * VOICE-001 (.agent/legal/open-issues.md)
 *
 * 종전에는 `POST /api/speech/transcribe`의 multipart 필드 `assessmentConsent`(불리언)만으로
 * 원음 분석 경로가 열렸다. 클라이언트가 보낸 값이 그대로 판정 근거였으므로 서버 강제가 없었다.
 *
 * 이 모듈은 **요청 필드를 판정 근거로 쓰지 않는다.** 서버가 조회한 동의 원장과 성인 eligibility로만
 * 판정하며, 근거를 확인하지 못하면 거부한다(fail-closed).
 *
 * 원음 이해 목적 동의는 기존 약관·개인정보 동의와 별도의 `purposeConsents` 축에서 관리한다.
 * 계약 버전과 서버가 신뢰한 audience 조건이 모두 맞지 않으면 fail-closed로 거부한다.
 */

/** 하위 호환을 위해 유지하는 이름이다. 실제 저장 필드는 purposeId를 사용한다. */
export const VOICE_DATA_CONSENT_POLICY_ID = VOICE_DATA_CONSENT_PURPOSE_ID;

/**
 * 확정된 음성 데이터 동의 계약 버전.
 * 타입은 string|null을 유지해 정책 계약을 되돌릴 때 종전의 fail-closed 동작을 보존한다.
 */
export const VOICE_DATA_CONSENT_CONTRACT_VERSION: string | null = VOICE_DATA_CONSENT_VERSION;

export type VoiceProcessingIntent = "chat_transcript" | "pronunciation_assessment";
export type VoiceAudioRetention = "transient" | "short_ttl";

export type AdultEligibility =
  | "verified_adult"
  | "declared_adult"
  | "declared_minor"
  | "unknown";

export type VoiceDataConsentReasonCode =
  | "not_required"
  | "contract_version_undefined"
  | "consent_record_absent"
  | "consent_version_mismatch"
  | "adult_eligibility_unverified"
  | "declared_minor"
  | "consent_revoked"
  | "audience_not_eligible";

export type VoiceDataConsentDecision = {
  /** 원음 전송·임시 저장·분석을 허용하는지. 요청 필드가 아니라 서버 판정 결과다. */
  allowed: boolean;
  reasonCode: VoiceDataConsentReasonCode;
  /** 판정에 사용한 동의 레코드의 버전. 없으면 null이다. */
  consentVersion: string | null;
  adultEligibility: AdultEligibility;
  /** 자기 신고·프로필에서 얻은 연령 신호. 서버가 신뢰한 audience와 구분한다. */
  declaredAgeSignal: AdultEligibility;
  /** 서버 런타임 정책에서 주입된 신뢰 audience. 요청 필드에서 읽지 않는다. */
  audience: TutorsTrustedAudienceEligibility;
  /** 클라이언트가 주장한 값. 감사 목적으로만 남기며 판정에 사용하지 않는다. */
  clientAsserted: boolean;
  /** 허용에 필요한 조건. 거부 사유를 사람이 읽을 수 있게 남긴다. */
  requirement: string;
  evaluatedAt: string;
};

function normalizeConsentRecords(user: unknown) {
  const raw = toUnknownRecord(user).purposeConsents;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => toUnknownRecord(entry))
    .filter((entry) => String(entry.purposeId || "") === VOICE_DATA_CONSENT_PURPOSE_ID);
}

function hasRevokedAt(value: unknown) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function consentTimestamp(value: unknown) {
  const time = new Date(String(value || "")).getTime();
  return Number.isFinite(time) ? time : 0;
}

function parseBirthdateYear(value: unknown): number | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  const year = parsed.getUTCFullYear();
  if (year < 1900 || year > new Date().getUTCFullYear()) return null;
  return year;
}

/**
 * 성인 여부를 판정한다.
 *
 * `userInfo.age`와 `userInfo.birthdate`는 **선택 프로필 항목이며 본인 확인을 거치지 않은
 * 자기 신고 값**이다. 따라서 여기서 나올 수 있는 최선은 `declared_adult`이고
 * `verified_adult`는 신뢰 가능한 연령 확인 수단이 생기기 전까지 반환되지 않는다.
 * 자기 신고를 검증된 성인으로 승격하지 않는다.
 */
export function resolveAdultEligibility(user: unknown): AdultEligibility {
  const info = toUnknownRecord(toUnknownRecord(user).userInfo);

  const declaredAge = Number(info.age);
  if (Number.isFinite(declaredAge) && declaredAge > 0) {
    return declaredAge >= 19 ? "declared_adult" : "declared_minor";
  }

  const birthYear = parseBirthdateYear(info.birthdate);
  if (birthYear !== null) {
    const approximateAge = new Date().getUTCFullYear() - birthYear;
    return approximateAge >= 19 ? "declared_adult" : "declared_minor";
  }

  return "unknown";
}

/**
 * 원음 처리 동의를 판정한다.
 *
 * `clientAsserted`는 감사용으로만 기록한다. **어떤 경우에도 허용 근거가 되지 않는다.**
 */
export function resolveVoiceDataConsent(args: {
  user: unknown;
  intent: VoiceProcessingIntent;
  requestedRetention: VoiceAudioRetention;
  clientAsserted: boolean;
  /** 서버에서 계산한 신뢰 audience. 생략하면 unknown으로 fail-closed한다. */
  audience?: TutorsTrustedAudienceEligibility;
  /** 서버 런타임의 미성년 보호 준비 상태. 요청 필드가 아니다. */
  minorProtectionReady?: boolean;
  /** 서버 런타임의 연령 미확인 허용 여부. 기본 false다. */
  allowUnknownAudience?: boolean;
}): VoiceDataConsentDecision {
  const evaluatedAt = new Date().toISOString();
  const adultEligibility = resolveAdultEligibility(args.user);
  const audience = args.audience || "unknown";
  const base = {
    consentVersion: null as string | null,
    adultEligibility,
    declaredAgeSignal: adultEligibility,
    audience,
    clientAsserted: args.clientAsserted,
    evaluatedAt,
  };

  const requiresConsent =
    args.intent === "pronunciation_assessment" || args.requestedRetention === "short_ttl";

  if (!requiresConsent) {
    return {
      ...base,
      allowed: true,
      reasonCode: "not_required",
      requirement: "STT transcript 전용 경로이며 원음을 저장하거나 분석 목적으로 전달하지 않는다.",
    };
  }

  if (!VOICE_DATA_CONSENT_CONTRACT_VERSION) {
    return {
      ...base,
      allowed: false,
      reasonCode: "contract_version_undefined",
      requirement:
        "음성 데이터 처리 근거·보존·미성년 정책이 확정되지 않았다. " +
        "VOICE_DATA_CONSENT_CONTRACT_VERSION이 확정되기 전에는 원음을 전송·저장하지 않는다.",
    };
  }

  const records = normalizeConsentRecords(args.user);
  if (records.length === 0) {
    return {
      ...base,
      allowed: false,
      reasonCode: "consent_record_absent",
      requirement: "서버에 저장된 음성 데이터 동의 레코드가 필요하다. 요청 필드는 동의를 대체하지 않는다.",
    };
  }

  const matched = records
    .filter((record) => String(record.version || "") === VOICE_DATA_CONSENT_CONTRACT_VERSION)
    .sort((left, right) => consentTimestamp(right.agreedAt) - consentTimestamp(left.agreedAt))[0];
  if (!matched) {
    return {
      ...base,
      allowed: false,
      reasonCode: "consent_version_mismatch",
      requirement: `현재 계약 버전(${VOICE_DATA_CONSENT_CONTRACT_VERSION})에 대한 재동의가 필요하다.`,
    };
  }

  if (hasRevokedAt(matched.revokedAt)) {
    return {
      ...base,
      consentVersion: String(matched.version || "") || null,
      allowed: false,
      reasonCode: "consent_revoked",
      requirement: "음성 데이터 동의가 철회되어 원음 이해 처리를 즉시 중단한다.",
    };
  }

  // 자기 신고 미성년 신호는 STT용 unknown 토글과 무관하게 원음 이해를 열 수 없다.
  if (adultEligibility === "declared_minor") {
    return {
      ...base,
      consentVersion: String(matched.version || "") || null,
      allowed: false,
      reasonCode: "declared_minor",
      requirement: "자기 신고 미성년 이용자는 원음 이해 경로에 들어가지 않는다. 런타임 설정으로 열지 않는다.",
    };
  }

  const audienceAllowed =
    audience === "verified_adult" ||
    (audience === "verified_minor" && args.minorProtectionReady === true) ||
    (audience === "unknown" && args.allowUnknownAudience === true);
  if (!audienceAllowed) {
    return {
      ...base,
      consentVersion: String(matched.version || "") || null,
      allowed: false,
      reasonCode: "audience_not_eligible",
      requirement:
        "서버가 신뢰한 audience와 미성년 보호 조건을 확인하지 못했다. 자기 신고 프로필 나이는 판정 근거가 아니다.",
    };
  }

  return {
    ...base,
    consentVersion: String(matched.version || "") || null,
    allowed: true,
    reasonCode: "not_required",
    requirement: "서버 검증 동의와 성인 eligibility를 모두 충족했다.",
  };
}

/** 허용되지 않은 원음 처리 요청을 차단한다. */
export function assertVoiceDataConsentOrThrow(decision: VoiceDataConsentDecision) {
  if (decision.allowed) return decision;
  throw createSpeechError(
    "음성 원음 처리에 필요한 동의를 서버에서 확인하지 못했습니다.",
    "SPEECH_CONSENT_REQUIRED",
    403,
    {
      reasonCode: decision.reasonCode,
      adultEligibility: decision.adultEligibility,
      requirement: decision.requirement,
    },
  );
}
