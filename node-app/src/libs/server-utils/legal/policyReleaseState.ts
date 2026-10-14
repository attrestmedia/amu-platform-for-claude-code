/**
 * @docHint
 * @purpose 정책 릴리스 상태 API와 검증 overdue 목록을 구성한다.
 * @process runtime 선택  resolver 결과 구성  hold·검증 이벤트 반영
 * @domain legal-policy
 * @scope policy-release-state
 */

import "server-only";

import { resolvePolicy } from "consts/legal/policyRelease/resolver";
import type { ManifestPolicyId } from "consts/legal/policyRelease/types";
import { getAccountPolicyViews } from "libs/server-utils/legal/accountPolicyDecision";
import { hasPolicyReleaseEvents } from "libs/database/legal/policyReleaseEventRepo";
import { getActivePolicyReleaseHolds } from "libs/server-utils/legal/policyReleaseSignals";
import {
  PolicyReleaseUnavailableError,
  getPolicyReleaseRuntime,
  type PolicyReleaseRuntime,
} from "libs/server-utils/legal/policyReleaseRuntime";

const POLICY_IDS: readonly ManifestPolicyId[] = [
  "terms-of-service",
  "privacy-policy",
  "refund-return-policy",
];
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const VERIFICATION_KINDS = ["notice_observed", "activation_observed"] as const;

type VerificationKind = typeof VERIFICATION_KINDS[number];
type PolicyReleaseEvidence = readonly { releaseId: string; kind: VerificationKind }[];

export type PolicyReleaseStateOptions = {
  runtime?: PolicyReleaseRuntime;
  nowMs?: number;
  holds?: readonly string[];
  evidence?: PolicyReleaseEvidence | null;
};

export type PolicyReleaseState = {
  ok: true;
  mode: "legacy" | "manifest";
  manifestRevision: string | null;
  serverTime: string;
  policies: Record<ManifestPolicyId, {
    active: { releaseId: string; contentSha256: string } | null;
    announced: { releaseId: string; contentSha256: string }[];
    currentVersion: string | null;
    requiredConsentVersion: string | null;
  }> | Record<string, never>;
  holds: string[];
  verificationOverdue: { releaseId: string; kind: VerificationKind; expectedAt: string }[] | null;
};

function unavailable(message?: string): never {
  throw new PolicyReleaseUnavailableError(message);
}

export async function buildPolicyReleaseState(
  options: PolicyReleaseStateOptions = {},
): Promise<PolicyReleaseState> {
  const nowMs = options.nowMs ?? Date.now();
  const serverTime = new Date(nowMs).toISOString();
  const runtime = options.runtime ?? getPolicyReleaseRuntime();

  if (runtime.mode === "legacy") {
    return {
      ok: true,
      mode: "legacy",
      manifestRevision: null,
      serverTime,
      policies: {},
      holds: [],
      verificationOverdue: [],
    };
  }
  if (runtime.mode === "unavailable") unavailable(runtime.reason);

  const manifest = runtime.manifest;
  const now = new Date(nowMs);
  const holds = [...(options.holds ?? await getActivePolicyReleaseHolds())];
  const accountViews = getAccountPolicyViews(now, { runtime, holds });
  const policies = Object.fromEntries(POLICY_IDS.map((policyId) => {
    const definition = manifest.policies[policyId];
    const eligibleReleases = definition.releases.filter((release) => release.status !== "cancelled");
    if (definition.aliases.consentKey === null && eligibleReleases.length === 0) {
      return [policyId, {
        active: null,
        announced: [],
        currentVersion: null,
        requiredConsentVersion: null,
      }];
    }

    const selection = resolvePolicy(manifest, policyId, nowMs);
    if (selection.error || !selection.latestPublished) unavailable(`No active release: ${policyId}`);

    const releaseById = (releaseId: string) => definition.releases.find((release) => release.releaseId === releaseId);
    const activeRelease = selection.active ? releaseById(selection.active) : null;
    const announced = selection.announced.map(releaseById);
    const currentRelease = releaseById(selection.latestPublished);
    if (!currentRelease || (selection.active && !activeRelease) || announced.some((release) => !release)) {
      unavailable(`Manifest release lookup failed: ${policyId}`);
    }

    const consentKey = definition.aliases.consentKey;
    const accountView = consentKey === "terms" ? accountViews.terms : consentKey === "privacy" ? accountViews.privacy : null;
    return [policyId, {
      active: activeRelease ? { releaseId: activeRelease.releaseId, contentSha256: activeRelease.contentSha256 } : null,
      announced: announced.map((release) => ({ releaseId: release!.releaseId, contentSha256: release!.contentSha256 })),
      currentVersion: currentRelease.version,
      requiredConsentVersion: accountView?.requiredConsentVersion ?? null,
    }];
  })) as PolicyReleaseState["policies"];

  const eligibleReleases = POLICY_IDS.flatMap((policyId) => manifest.policies[policyId].releases
    .filter((release) => release.status !== "cancelled")
    .map((release) => ({ policyId, release })));
  let evidence: PolicyReleaseEvidence | null;
  if (options.evidence !== undefined) {
    evidence = options.evidence;
  } else {
    try {
      const recorded = await hasPolicyReleaseEvents(
        eligibleReleases.map(({ release }) => release.releaseId),
        VERIFICATION_KINDS,
      );
      evidence = recorded.filter((event): event is PolicyReleaseEvidence[number] =>
        event.kind === "notice_observed" || event.kind === "activation_observed",
      );
    } catch {
      evidence = null;
    }
  }

  let verificationOverdue: PolicyReleaseState["verificationOverdue"] = null;
  if (evidence !== null) {
    const evidenceSet = new Set(evidence.map(({ releaseId, kind }) => `${releaseId}:${kind}`));
    verificationOverdue = eligibleReleases.flatMap(({ release }) => {
      const overdue: NonNullable<PolicyReleaseState["verificationOverdue"]> = [];
      const noticeExpected = release.noticeAtMs;
      if (
        release.effectiveAtMs > noticeExpected &&
        noticeExpected + SIX_HOURS_MS <= nowMs &&
        !evidenceSet.has(`${release.releaseId}:notice_observed`)
      ) {
        overdue.push({ releaseId: release.releaseId, kind: "notice_observed", expectedAt: release.noticeAt });
      }
      const activationExpected = release.effectiveAtMs;
      if (
        activationExpected + SIX_HOURS_MS <= nowMs &&
        !evidenceSet.has(`${release.releaseId}:activation_observed`)
      ) {
        overdue.push({ releaseId: release.releaseId, kind: "activation_observed", expectedAt: release.effectiveAt });
      }
      return overdue;
    }).sort((left, right) => left.expectedAt.localeCompare(right.expectedAt) || left.kind.localeCompare(right.kind));
  } else {
    console.error("[policyReleaseState] verification evidence lookup failed");
  }

  return {
    ok: true,
    mode: "manifest",
    manifestRevision: manifest.manifestRevision,
    serverTime,
    policies,
    holds,
    verificationOverdue,
  };
}
