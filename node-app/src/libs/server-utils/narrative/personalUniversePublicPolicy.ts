import "server-only";

/**
 * 공개 Personal Universe는 세 조건을 모두 만족해야만 외부 응답·publish를 허용한다.
 * 미설정은 항상 false로 해석해 로컬·production 오개방을 막는다.
 */
export function isPersonalUniversePublicExposureEnabled() {
  return process.env.PERSONAL_UNIVERSE_PUBLIC_ENABLED === "true";
}

export function isPersonalUniversePublicPolicyApproved() {
  return process.env.PERSONAL_UNIVERSE_PUBLIC_POLICY_APPROVED === "true";
}

export function isPersonalUniversePublicModerationEnabled() {
  return process.env.PERSONAL_UNIVERSE_PUBLIC_MODERATION_ENABLED === "true";
}

export function getPersonalUniversePublicGate() {
  const exposureEnabled = isPersonalUniversePublicExposureEnabled();
  const policyApproved = isPersonalUniversePublicPolicyApproved();
  const moderationEnabled = isPersonalUniversePublicModerationEnabled();
  return {
    exposureEnabled,
    policyApproved,
    moderationEnabled,
    ready: exposureEnabled && policyApproved && moderationEnabled,
  } as const;
}
