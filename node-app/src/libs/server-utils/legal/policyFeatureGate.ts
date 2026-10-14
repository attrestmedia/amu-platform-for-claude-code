/**
 * @docHint
 * @purpose 정책 manifest와 서버 증거·hold를 사용해 기능별 정책 접근을 판정한다.
 * @process feature 선언 조회  legacy·manifest·unavailable 판정  disclosure 버전 공급
 * @domain legal-policy
 * @scope policy-feature-gate
 */

import "server-only";

import { CURRENT_ACCOUNT_POLICY } from "consts/legal/accountPolicy";
import { POLICY_FEATURE_REQUIREMENTS, type PolicyFeatureRequirementDeclaration } from "consts/legal/policyFeatureRequirements";
import { featureStatus, purposeLink, resolvePolicy } from "consts/legal/policyRelease/resolver";
import type { PolicyFeatureRequirement, PolicyReleaseManifest } from "consts/legal/policyRelease/types";
import {
  getPolicyReleaseRuntime,
  PolicyReleaseUnavailableError,
  type PolicyReleaseRuntime,
} from "./policyReleaseRuntime";
import { getActivePolicyReleaseHolds, getPolicyReleaseEvidence } from "./policyReleaseSignals";
import { isQwenPrivacyPolicyReleaseReady } from "consts/legal/voiceDataConsent";

export type PolicyFeatureDecision = {
  open: boolean;
  requirementRelease: string | null;
  linkedPrivacyVersion: string | null;
  errorCode?: "POLICY_FEATURE_RECONSENT_REQUIRED" | "POLICY_RELEASE_HOLD" | "POLICY_RELEASE_UNAVAILABLE";
  status?: 403 | 503;
};

type PolicyFeatureDecisionOptions = {
  runtime?: PolicyReleaseRuntime;
  holds?: readonly string[];
  evidence?: readonly { releaseId: string; kind: "notice_observed" }[];
  /** A fixture-only seam; production callers use the static feature declaration. */
  requirement?: PolicyFeatureRequirementDeclaration;
};

function unavailable(requirementRelease: string | null = null, linkedPrivacyVersion: string | null = null): PolicyFeatureDecision {
  return {
    open: false,
    requirementRelease,
    linkedPrivacyVersion,
    errorCode: "POLICY_RELEASE_UNAVAILABLE",
    status: 503,
  };
}

function requirementFor(featureKey: string, options?: PolicyFeatureDecisionOptions) {
  return options?.requirement ?? POLICY_FEATURE_REQUIREMENTS.find((item) => item.featureKey === featureKey) ?? null;
}

function latestPublishedPrivacyVersion(manifest: PolicyReleaseManifest, nowMs: number): string | null {
  const selection = resolvePolicy(manifest, "privacy-policy", nowMs);
  if (!selection.latestPublished) return null;
  return manifest.policies["privacy-policy"].releases.find((release) => release.releaseId === selection.latestPublished)?.version ?? null;
}

/**
 * Version shown to a user when they acknowledge a disclosure. A declared feature
 * follows its requirement release; all other disclosures follow latestPublished.
 */
export function getPrivacyDisclosureVersion(
  featureKey: string | null,
  now: Date = new Date(),
  options?: PolicyFeatureDecisionOptions,
): string {
  const runtime = options?.runtime ?? getPolicyReleaseRuntime();
  if (runtime.mode === "unavailable") throw new PolicyReleaseUnavailableError(runtime.reason);
  if (runtime.mode === "legacy") {
    return CURRENT_ACCOUNT_POLICY.privacy.version;
  }

  const requirement = featureKey ? requirementFor(featureKey, options) : null;
  if (requirement) {
    const linkedVersion = purposeLink(
      runtime.manifest,
      requirement.policyId,
      now.getTime(),
      requirement,
    ).linkedVersion;
    if (!linkedVersion) throw new PolicyReleaseUnavailableError(`기능 정책 릴리스를 확인할 수 없습니다: ${featureKey}`);
    return linkedVersion;
  }

  const version = latestPublishedPrivacyVersion(runtime.manifest, now.getTime());
  if (!version) throw new PolicyReleaseUnavailableError("공고 중이거나 시행 중인 개인정보처리방침 릴리스가 없습니다.");
  return version;
}

/** Server-only feature release, hold, evidence, and purpose-consent decision. */
export async function getPolicyFeatureDecision(
  args: {
    featureKey: string;
    now?: Date;
    purposeConsents?: readonly {
      purposeId: string;
      linkedPrivacyVersion: string | null;
      revokedAt?: string | Date | null;
    }[];
    purposeId?: string | null;
  },
  options?: PolicyFeatureDecisionOptions,
): Promise<PolicyFeatureDecision> {
  const requirement = requirementFor(args.featureKey, options);
  if (!requirement) {
    return {
      open: false,
      requirementRelease: null,
      linkedPrivacyVersion: null,
      errorCode: "POLICY_FEATURE_RECONSENT_REQUIRED",
      status: 403,
    };
  }

  const now = args.now ?? new Date();
  const runtime = options?.runtime ?? getPolicyReleaseRuntime();
  if (runtime.mode === "unavailable") return unavailable();

  let linkedPrivacyVersion: string | null;
  try {
    linkedPrivacyVersion = getPrivacyDisclosureVersion(args.featureKey, now, { ...options, runtime });
  } catch {
    return unavailable();
  }
  if (!linkedPrivacyVersion) return unavailable();

  if (runtime.mode === "legacy") {
    const open = args.featureKey === "voice.qwen-asr" || args.featureKey === "provider.qwen-model-studio"
      ? isQwenPrivacyPolicyReleaseReady(linkedPrivacyVersion, now)
      : true;
    return open
      ? { open: true, requirementRelease: null, linkedPrivacyVersion }
      : unavailable(null, linkedPrivacyVersion);
  }

  const nowMs = now.getTime();
  const holds = options?.holds ?? await getActivePolicyReleaseHolds();
  const req: PolicyFeatureRequirement = requirement;
  const requirementRelease = purposeLink(runtime.manifest, req.policyId, nowMs, req).linkedVersion;
  let evidence = options?.evidence;
  if (!evidence) {
    const releases = runtime.manifest.policies[req.policyId].releases;
    const selected = releases.find((release) => release.version === requirementRelease);
    evidence = selected ? await getPolicyReleaseEvidence([selected.releaseId]) : [];
  }

  if (requirement.purposeId === null) {
    const selected = runtime.manifest.policies[req.policyId].releases.find(
      (release) => release.version === requirementRelease,
    );
    if (!selected) return unavailable(null, linkedPrivacyVersion);
    if (holds.includes(selected.releaseId)) {
      return {
        open: false,
        requirementRelease: selected.releaseId,
        linkedPrivacyVersion,
        errorCode: "POLICY_RELEASE_HOLD",
        status: 503,
      };
    }
    if (
      requirement.requireNoticeEvidence &&
      !evidence.some((event) => event.releaseId === selected.releaseId && event.kind === "notice_observed")
    ) {
      return unavailable(selected.releaseId, linkedPrivacyVersion);
    }
    return { open: true, requirementRelease: selected.releaseId, linkedPrivacyVersion };
  }

  const result = featureStatus(
    runtime.manifest,
    req,
    nowMs,
    holds,
    evidence,
    args.purposeConsents,
    args.purposeId ?? requirement.purposeId,
  );
  const linkedVersion = requirementRelease;
  if (result.errorCode === "POLICY_RELEASE_HOLD") {
    return { open: false, requirementRelease: result.requirementRelease, linkedPrivacyVersion: linkedVersion, errorCode: result.errorCode, status: 503 };
  }
  if (result.errorCode === "POLICY_FEATURE_RECONSENT_REQUIRED") {
    return { open: false, requirementRelease: result.requirementRelease, linkedPrivacyVersion: linkedVersion, errorCode: result.errorCode, status: 403 };
  }
  if (result.satisfied && result.requirementRelease) {
    return { open: true, requirementRelease: result.requirementRelease, linkedPrivacyVersion: linkedVersion };
  }
  return unavailable(result.requirementRelease, linkedVersion);
}
