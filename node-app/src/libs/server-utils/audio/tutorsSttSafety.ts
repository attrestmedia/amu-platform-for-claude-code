import { CURRENT_ACCOUNT_POLICY } from "consts/legal/accountPolicy";

/**
 * Tutors STT의 서버 안전 경계 결과다.
 *
 * 이 모듈은 provider, 저장소, 과금, 사용자 문서에 의존하지 않는 순수 판정만 담당한다.
 * 운영 기본값은 비활성화이며, 실제 provider 활성화는 이 계약의 책임 범위가 아니다.
 */
export const TUTORS_STT_SAFETY_OUTCOMES = [
  "allowed",
  "not_activated",
  "policy_not_effective",
  "policy_version_mismatch",
  "per_use_ack_required",
  "audience_not_eligible",
  "limits_unconfigured",
  "language_not_allowed",
  "audio_too_large",
  "duration_too_long",
  "budget_unavailable",
] as const;

export type TutorsSttSafetyOutcome = (typeof TUTORS_STT_SAFETY_OUTCOMES)[number];

export type TutorsTrustedAudienceEligibility = "verified_adult" | "verified_minor" | "unknown";

export type TutorsSttSafetyPolicy = {
  /** 서버 기능 플래그다. 클라이언트 값으로 변경할 수 없다. */
  capabilityEnabled?: boolean;
  /** 서버가 운영 대상으로 승인한 provider만 포함한다. */
  providerAllowlist?: readonly string[];
  /** 서버가 운영 대상으로 승인한 model만 포함한다. */
  modelAllowlist?: readonly string[];
  /** 기존 account policy 정본에서 주입한 privacy policy 버전이다. */
  approvedPrivacyPolicyVersion?: string;
  /** 기존 account policy 정본에서 주입한 privacy policy 시행일이다. */
  privacyPolicyEffectiveAt?: string | Date;
  /** 서버가 확인한 이용자 자격이다. 요청 필드가 아니다. */
  trustedAudienceEligibility?: TutorsTrustedAudienceEligibility;
  /**
   * TUTORS-192 — 미성년 보호·보호자 동의 증거 확정 여부.
   * verified_adult는 더 이상 유일한 허용 조건이 아니며, 미성년은 이 값이 true일 때만 허용한다.
   * 연령 미확인(unknown)은 기본 fail-closed다.
   */
  minorProtectionReady?: boolean;
  /**
   * 2026-09-13 사용자 결정: 연령 미확인(unknown)을 성인으로 간주해 허용할지. 기본 false(fail-closed).
   * true면 unknown audience도 허용하며 미성년 보호 리스크를 사용자가 명시 수용한 것으로 본다.
   */
  allowUnknownAudience?: boolean;
  allowedLanguages?: readonly string[];
  maxAudioBytes?: number;
  maxDurationMs?: number;
  /** 사용자별 KST 일일 요청 상한(설정값). daily-limit 판정이 이 값을 소비한다. */
  maxRequestsPerUserPerDay?: number | null;
  /** 서버 budget preflight 결과다. 누락·실패는 허용하지 않는다. */
  dailyBudgetAvailable?: boolean;
};

export type TutorsSttSafetyRequest = {
  /** 모두 신뢰하지 않는 요청 값이며 provider/model 선택에 사용하지 않는다. */
  provider?: unknown;
  model?: unknown;
  /** multipart 요청이 주장한 값이며 duration cap 판정에 사용하지 않는다. */
  clientDurationMs?: unknown;
  disclosureAcknowledged?: unknown;
  disclosureVersion?: unknown;
  language?: unknown;
  fileSizeBytes?: unknown;
  /** 서버 decoder 등 신뢰된 경계가 주입한 duration만 cap 판정에 사용한다. */
  trustedDurationMs?: unknown;
  now?: Date | string;
};

export type TutorsSttSafetyDecision =
  | {
      allowed: true;
      outcome: "allowed";
      /** allowlist의 서버 선택값이다. 요청 provider/model은 반영하지 않는다. */
      selectedProvider: string;
      selectedModel: string;
    }
  | {
      allowed: false;
      outcome: Exclude<TutorsSttSafetyOutcome, "allowed">;
    };

function normalizedString(value: unknown) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || null;
}

function normalizedList(value: readonly string[] | undefined) {
  if (!Array.isArray(value)) return [];
  return value.map(normalizedString).filter((item): item is string => Boolean(item));
}

function positiveFiniteNumber(value: unknown) {
  try {
    const number = typeof value === "number" ? value : Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  } catch {
    return null;
  }
}

function parseDate(value: unknown) {
  const date = value instanceof Date ? value : new Date(String(value || ""));
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

function denied(outcome: Exclude<TutorsSttSafetyOutcome, "allowed">): TutorsSttSafetyDecision {
  return { allowed: false, outcome };
}

/**
 * 운영 환경에서 사용하는 기본 정책.
 * privacy 버전·시행일은 legal 정본을 참조하고, 이 작업에서는 provider/model을 비워 둔다.
 */
export function getDefaultTutorsSttSafetyPolicy(): TutorsSttSafetyPolicy {
  return {
    capabilityEnabled: false,
    providerAllowlist: [],
    modelAllowlist: [],
    approvedPrivacyPolicyVersion: CURRENT_ACCOUNT_POLICY.privacy.version,
    privacyPolicyEffectiveAt: CURRENT_ACCOUNT_POLICY.privacy.effectiveDate,
    trustedAudienceEligibility: "unknown",
    allowedLanguages: [],
    maxAudioBytes: undefined,
    maxDurationMs: undefined,
    dailyBudgetAvailable: false,
  };
}

/**
 * Tutors STT 요청을 provider 호출보다 앞에서 fail-closed로 판정한다.
 * client provider/model 값은 의도적으로 읽지 않고 서버 allowlist의 첫 항목만 선택한다.
 */
export function evaluateTutorsSttSafety(
  policy: TutorsSttSafetyPolicy,
  request: TutorsSttSafetyRequest,
): TutorsSttSafetyDecision {
  if (policy.capabilityEnabled !== true) return denied("not_activated");

  const approvedPolicyVersion = normalizedString(policy.approvedPrivacyPolicyVersion);
  const effectiveAt = parseDate(policy.privacyPolicyEffectiveAt);
  const now = parseDate(request.now ?? new Date());
  if (!approvedPolicyVersion || effectiveAt === null || now === null || now < effectiveAt) {
    return denied("policy_not_effective");
  }

  const providers = normalizedList(policy.providerAllowlist);
  const models = normalizedList(policy.modelAllowlist);
  if (providers.length === 0 || models.length === 0) return denied("not_activated");

  if (request.disclosureAcknowledged !== true) return denied("per_use_ack_required");
  if (normalizedString(request.disclosureVersion) !== approvedPolicyVersion) {
    return denied("policy_version_mismatch");
  }

  // TUTORS-192: verified_adult는 더 이상 유일한 허용 조건이 아니다.
  // 성인은 허용하고, 미성년은 보호·보호자 동의 증거가 확정된 경우에만 허용한다.
  // 연령 미확인(unknown)과 증거 없는 미성년은 기본 fail-closed이며, 서버 설정이
  // allowUnknownAudience=true일 때만 unknown을 허용한다(2026-09-13 사용자 결정).
  const audienceAllowed =
    policy.trustedAudienceEligibility === "verified_adult" ||
    (policy.trustedAudienceEligibility === "verified_minor" && policy.minorProtectionReady === true) ||
    (policy.trustedAudienceEligibility === "unknown" && policy.allowUnknownAudience === true);
  if (!audienceAllowed) return denied("audience_not_eligible");

  const allowedLanguages = normalizedList(policy.allowedLanguages).map((language) => language.toLowerCase());
  const maxAudioBytes = positiveFiniteNumber(policy.maxAudioBytes);
  const maxDurationMs = positiveFiniteNumber(policy.maxDurationMs);
  if (allowedLanguages.length === 0 || maxAudioBytes === null || maxDurationMs === null) {
    return denied("limits_unconfigured");
  }

  const language = normalizedString(request.language)?.toLowerCase();
  if (!language || !allowedLanguages.includes(language)) return denied("language_not_allowed");

  const fileSizeBytes = positiveFiniteNumber(request.fileSizeBytes);
  if (fileSizeBytes === null || fileSizeBytes > maxAudioBytes) return denied("audio_too_large");

  const durationMs = positiveFiniteNumber(request.trustedDurationMs);
  if (durationMs === null || durationMs > maxDurationMs) return denied("duration_too_long");

  if (policy.dailyBudgetAvailable !== true) return denied("budget_unavailable");

  return {
    allowed: true,
    outcome: "allowed",
    selectedProvider: providers[0],
    selectedModel: models[0],
  };
}
