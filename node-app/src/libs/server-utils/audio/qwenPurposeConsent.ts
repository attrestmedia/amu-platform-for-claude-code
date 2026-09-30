import "server-only";
import { toUnknownRecord } from "utils/common";
import {
  QWEN_ASR_AUDIO_CONSENT_PURPOSE_ID,
  QWEN_MODEL_STUDIO_CONSENT_CONTRACTS,
  QWEN_MODEL_STUDIO_PRIVACY_RELEASE_GATE,
  VOICE_DATA_CONSENT_LINKED_PRIVACY_VERSION,
  VOICE_DATA_CONSENT_PURPOSE_ID,
  VOICE_DATA_CONSENT_VERSION,
  isQwenPrivacyPolicyReleaseReady,
  type QwenModelStudioConsentPurposeId,
} from "consts/legal/voiceDataConsent";

/**
 * @docHint
 * @purpose Qwen audio/video provider dispatch의 서버 목적 동의 preflight
 * @process 서버 저장 consent와 현재 법무·보유 계약을 대조하고 미확정 목적은 fail-closed
 * @domain privacy-consent
 * @scope server
 *
 * D2 provider 호출 직전에 호출한다. 클라이언트 요청의 purpose/version 주장을 신뢰하지 않는다.
 */

export type QwenPurposeConsentDecision = {
  allowed: boolean;
  purposeId: QwenModelStudioConsentPurposeId;
  reasonCode:
    | "purpose_contract_unavailable"
    | "policy_release_unavailable"
    | "consent_required"
    | "consent_revoked"
    | "consent_version_mismatch"
    | "consent_granted";
  consentVersion: string | null;
  linkedPrivacyVersion: string | null;
};

function isRevoked(value: unknown) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

/** Uses server-loaded user consent records; ASR reads voice_data and Omni remains fail-closed. */
export function resolveQwenPurposeConsent(args: {
  purposeId: QwenModelStudioConsentPurposeId;
  user: unknown;
}): QwenPurposeConsentDecision {
  const denied = (
    reasonCode: QwenPurposeConsentDecision["reasonCode"],
    consentVersion: string | null = null,
    linkedPrivacyVersion: string | null = null,
  ): QwenPurposeConsentDecision => ({
    allowed: false,
    purposeId: args.purposeId,
    reasonCode,
    consentVersion,
    linkedPrivacyVersion,
  });

  if (!isQwenPrivacyPolicyReleaseReady(VOICE_DATA_CONSENT_LINKED_PRIVACY_VERSION)) {
    return denied(
      "policy_release_unavailable",
      args.purposeId === QWEN_ASR_AUDIO_CONSENT_PURPOSE_ID ? VOICE_DATA_CONSENT_VERSION : null,
      VOICE_DATA_CONSENT_LINKED_PRIVACY_VERSION,
    );
  }

  if (args.purposeId === QWEN_ASR_AUDIO_CONSENT_PURPOSE_ID) {
    const rawConsents = toUnknownRecord(args.user).purposeConsents;
    const purposeConsents = Array.isArray(rawConsents)
      ? rawConsents
          .map((record) => toUnknownRecord(record))
          .filter((record) => record.purposeId === VOICE_DATA_CONSENT_PURPOSE_ID)
      : [];
    const current = purposeConsents
      .filter((record) => {
        const agreedAt = new Date(String(record.agreedAt || "")).getTime();
        const publishedAt = Date.parse(QWEN_MODEL_STUDIO_PRIVACY_RELEASE_GATE.noticePublishedAt || "");
        return (
          record.version === VOICE_DATA_CONSENT_VERSION &&
          record.linkedPrivacyVersion === VOICE_DATA_CONSENT_LINKED_PRIVACY_VERSION &&
          Number.isFinite(agreedAt) &&
          Number.isFinite(publishedAt) &&
          agreedAt >= publishedAt
        );
      })
      .sort((left, right) => new Date(String(right.agreedAt)).getTime() - new Date(String(left.agreedAt)).getTime())[0];

    if (!current) {
      return denied(
        purposeConsents.length ? "consent_version_mismatch" : "consent_required",
        VOICE_DATA_CONSENT_VERSION,
        VOICE_DATA_CONSENT_LINKED_PRIVACY_VERSION,
      );
    }
    if (isRevoked(current.revokedAt)) {
      return denied("consent_revoked", VOICE_DATA_CONSENT_VERSION, VOICE_DATA_CONSENT_LINKED_PRIVACY_VERSION);
    }
    return {
      allowed: true,
      purposeId: args.purposeId,
      reasonCode: "consent_granted",
      consentVersion: VOICE_DATA_CONSENT_VERSION,
      linkedPrivacyVersion: VOICE_DATA_CONSENT_LINKED_PRIVACY_VERSION,
    };
  }

  const contract = QWEN_MODEL_STUDIO_CONSENT_CONTRACTS[args.purposeId];
  if (
    !contract.grantable ||
    !contract.transferAllowed ||
    !contract.retentionConfirmed ||
    !contract.contractVersion ||
    !contract.linkedPrivacyVersion
  ) {
    return denied("purpose_contract_unavailable");
  }
  if (!isQwenPrivacyPolicyReleaseReady(contract.linkedPrivacyVersion)) {
    return denied("policy_release_unavailable", contract.contractVersion, contract.linkedPrivacyVersion);
  }

  const rawConsents = toUnknownRecord(args.user).purposeConsents;
  const purposeConsents = Array.isArray(rawConsents)
    ? rawConsents.map((record) => toUnknownRecord(record)).filter((record) => record.purposeId === args.purposeId)
    : [];
  const current = purposeConsents
    .filter((record) => {
      const agreedAt = new Date(String(record.agreedAt || "")).getTime();
      return (
        record.version === contract.contractVersion &&
        record.linkedPrivacyVersion === contract.linkedPrivacyVersion &&
        Number.isFinite(agreedAt) &&
        agreedAt > 0
      );
    })
    .sort((left, right) => new Date(String(right.agreedAt)).getTime() - new Date(String(left.agreedAt)).getTime())[0];

  if (!current) {
    return denied(purposeConsents.length ? "consent_version_mismatch" : "consent_required");
  }
  if (isRevoked(current.revokedAt)) {
    return denied("consent_revoked", contract.contractVersion, contract.linkedPrivacyVersion);
  }

  return {
    allowed: true,
    purposeId: args.purposeId,
    reasonCode: "consent_granted",
    consentVersion: contract.contractVersion,
    linkedPrivacyVersion: contract.linkedPrivacyVersion,
  };
}

export function assertQwenPurposeConsent(args: { purposeId: QwenModelStudioConsentPurposeId; user: unknown }) {
  const decision = resolveQwenPurposeConsent(args);
  if (!decision.allowed) {
    throw Object.assign(new Error("Qwen 목적별 처리가 승인되지 않았습니다."), {
      errorCode: "QWEN_PURPOSE_CONSENT_UNAVAILABLE",
      status: 423,
      decision,
    });
  }
  return decision;
}
