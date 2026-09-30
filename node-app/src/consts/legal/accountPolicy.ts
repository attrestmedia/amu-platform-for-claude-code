export const CURRENT_ACCOUNT_POLICY = {
  terms: {
    policyId: "terms",
    version: "1.3.0",
    noticeDate: "2026-08-24T00:00:00+09:00",
    effectiveDate: "2026-09-23T00:00:00+09:00",
  },
  privacy: {
    policyId: "privacy",
    version: "1.10.0",
    noticeDate: "2026-09-29T00:00:00+09:00",
    effectiveDate: "2026-10-29T00:00:00+09:00",
  },
} as const;

// API 미들웨어의 빠른 사전 검사에는 가장 이른 시행일을 사용한다.
export const ACCOUNT_POLICY_EFFECTIVE_DATE = "2026-09-23T00:00:00+09:00";

export const ACCOUNT_POLICY_LINKS = {
  terms: "https://allmyuniverse.com/terms-conditions/",
  privacy: "https://allmyuniverse.com/privacy-policy/",
} as const;

export type AccountPolicyId = keyof typeof CURRENT_ACCOUNT_POLICY;
export type AccountStatus = "active" | "deletion_pending" | "deleted";
export type PolicyConsentMethod =
  | "magazine_signup"
  | "magazine_social_signup"
  | "platform_email_signup"
  | "platform_social_signup"
  | "policy_reconsent";

export type PolicyConsentRecord = {
  policyId: AccountPolicyId;
  version: string;
  agreedAt: Date | string;
  method: PolicyConsentMethod;
  provider?: string;
};

export type AccountPolicyConsentStatus = {
  required: boolean;
  missingPolicyIds: AccountPolicyId[];
  noticePolicyIds: AccountPolicyId[];
  enforcementPolicyIds: AccountPolicyId[];
  noticeActive: boolean;
  enforcementActive: boolean;
  currentPolicies: typeof CURRENT_ACCOUNT_POLICY;
};

export function resolveAccountPolicyConsentStatus(
  consents: readonly PolicyConsentRecord[] = [],
  now: Date = new Date(),
): AccountPolicyConsentStatus {
  const missingPolicyIds = (Object.keys(CURRENT_ACCOUNT_POLICY) as AccountPolicyId[]).filter((policyId) => {
    const current = CURRENT_ACCOUNT_POLICY[policyId];
    return !consents.some((consent) => consent.policyId === policyId && consent.version === current.version);
  });
  const noticePolicyIds = missingPolicyIds.filter(
    (policyId) => now.getTime() >= new Date(CURRENT_ACCOUNT_POLICY[policyId].noticeDate).getTime(),
  );
  const enforcementPolicyIds = missingPolicyIds.filter(
    (policyId) => now.getTime() >= new Date(CURRENT_ACCOUNT_POLICY[policyId].effectiveDate).getTime(),
  );

  return {
    required: missingPolicyIds.length > 0,
    missingPolicyIds,
    noticePolicyIds,
    enforcementPolicyIds,
    noticeActive: noticePolicyIds.length > 0,
    enforcementActive: enforcementPolicyIds.length > 0,
    currentPolicies: CURRENT_ACCOUNT_POLICY,
  };
}

export function currentPolicyConsents(
  method: PolicyConsentMethod,
  provider?: string,
  policyIds: readonly AccountPolicyId[] = Object.keys(CURRENT_ACCOUNT_POLICY) as AccountPolicyId[],
) {
  const agreedAt = new Date();
  return policyIds.map((policyId) => ({
    policyId,
    version: CURRENT_ACCOUNT_POLICY[policyId].version,
    agreedAt,
    method,
    ...(provider ? { provider } : {}),
  }));
}
