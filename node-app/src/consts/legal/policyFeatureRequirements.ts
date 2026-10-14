/**
 * @docHint
 * @purpose 정책 릴리스가 요구하는 기능별 privacy release와 목적 동의를 선언한다.
 * @process featureKey·policyId·최소 버전·공고 증거·purposeId를 정적 분류표로 제공
 * @domain legal-policy
 * @scope policy-feature-requirements
 */

import { VOICE_DATA_CONSENT_PURPOSE_ID } from "./voiceDataConsent";
import type { PolicyFeatureRequirement } from "./policyRelease/types";

export type PolicyFeatureRequirementDeclaration = PolicyFeatureRequirement & { purposeId: string | null };

export const POLICY_FEATURE_REQUIREMENTS = [
  {
    featureKey: "voice.qwen-asr",
    policyId: "privacy-policy",
    minVersion: "1.10.0",
    clauseKey: "qwen-model-studio",
    requireNoticeEvidence: true,
    purposeId: VOICE_DATA_CONSENT_PURPOSE_ID,
  },
  {
    featureKey: "provider.qwen-model-studio",
    policyId: "privacy-policy",
    minVersion: "1.10.0",
    clauseKey: "qwen-model-studio",
    requireNoticeEvidence: true,
    purposeId: null,
  },
] as const satisfies readonly PolicyFeatureRequirementDeclaration[];

export function getPolicyFeatureRequirement(featureKey: string): PolicyFeatureRequirementDeclaration | null {
  return POLICY_FEATURE_REQUIREMENTS.find((requirement) => requirement.featureKey === featureKey) ?? null;
}
