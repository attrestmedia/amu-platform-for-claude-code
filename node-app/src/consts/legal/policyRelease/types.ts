/**
 * @docHint
 * @purpose 정책 릴리스 manifest와 resolver의 공통 타입을 정의한다.
 * @process manifest 필드 선언  resolver 입력·출력 타입 공유
 * @domain legal-policy
 * @scope policy-release-contract
 */

export type ManifestPolicyId = "terms-of-service" | "privacy-policy" | "refund-return-policy";
export type ReconsentScope = "account" | `feature:${string}`;

export type PolicyReleaseClause = {
  clauseKey: string;
  effectiveAt: string;
  effectiveAtMs: number;
  label: string;
  adverseToUsers: boolean | null;
  materialRightsOrObligationsChange: boolean | null;
};

export type PolicyRelease = {
  releaseId: string;
  version: string;
  noticeAt: string;
  noticeAtMs: number;
  effectiveAt: string;
  effectiveAtMs: number;
  material: boolean;
  requiresReConsent: boolean;
  coversReleaseIds: string[];
  reconsentScope: ReconsentScope | null;
  adverseToUsers: boolean | null;
  materialRightsOrObligationsChange: boolean | null;
  clauseSchedules: PolicyReleaseClause[];
  status: "scheduled" | "cancelled";
  cancelledAt: string | null;
  contentSha256: string;
  summarySha256: string | null;
  moduleFile: string;
  summaryFile: string | null;
};

export type PolicyReleaseManifest = {
  schemaVersion: 2;
  manifestRevision: string;
  policies: Record<
    ManifestPolicyId,
    {
      aliases: {
        consentKey: "terms" | "privacy" | null;
        shortcodeType: string;
        wpSlug: string;
      };
      releases: PolicyRelease[];
    }
  >;
};

export type PolicyFeatureRequirement = {
  featureKey: string;
  policyId: ManifestPolicyId;
  minVersion: string;
  clauseKey?: string;
  requireNoticeEvidence: boolean;
};

export const POLICY_RECENTLY_EFFECTIVE_MS = 2_592_000_000;
