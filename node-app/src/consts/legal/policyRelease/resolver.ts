/**
 * @docHint
 * @purpose 정책 릴리스 manifest의 공통 선택·동의 판정을 수행한다.
 * @process manifest 값 검증 전제  순수 시각·scope 계산  결과 반환
 * @domain legal-policy
 * @scope policy-release-resolver
 */

import {
  POLICY_RECENTLY_EFFECTIVE_MS,
  type PolicyFeatureRequirement,
  type PolicyRelease,
  type PolicyReleaseManifest,
  type ReconsentScope,
} from "./types";

type PolicyDefinition = PolicyReleaseManifest["policies"][keyof PolicyReleaseManifest["policies"]];
type ResolverManifest = Omit<PolicyReleaseManifest, "policies"> & { policies: Record<string, PolicyDefinition> };
type PolicyConsent = { policyId: string; version: string };
type PurposeConsent = {
  purposeId: string;
  linkedPrivacyVersion: string | null;
  revokedAt?: string | Date | null;
};
type NoticeEvidence = { releaseId: string; kind: string };

const VERSION_PATTERN = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
const FEATURE_SCOPE_PATTERN = /^feature:[a-z0-9.-]+$/;

function manifestWithLoosePolicyKeys(manifest: PolicyReleaseManifest): ResolverManifest {
  return manifest as ResolverManifest;
}

function policy(manifest: PolicyReleaseManifest, policyId: string): PolicyDefinition {
  const found = manifestWithLoosePolicyKeys(manifest).policies[policyId];
  if (!found) throw new Error(`manifest에 policyId가 없습니다: ${policyId}`);
  return found;
}

function releasesFor(manifest: PolicyReleaseManifest, policyId: string): PolicyRelease[] {
  const releases = policy(manifest, policyId).releases;
  if (!Array.isArray(releases)) throw new Error(`${policyId}.releases는 배열이어야 합니다`);
  return releases;
}

function eligible(releases: readonly PolicyRelease[]): PolicyRelease[] {
  return releases.filter((release) => release.status !== "cancelled");
}

function versionTuple(version: string): [bigint, bigint, bigint] {
  if (typeof version !== "string") throw new Error(`semver 문자열이 아닙니다: ${String(version)}`);
  const match = VERSION_PATTERN.exec(version);
  if (!match) throw new Error(`MAJOR.MINOR.PATCH 형식이 아닙니다: ${version}`);
  return [BigInt(match[1]), BigInt(match[2]), BigInt(match[3])];
}

export function compareVersion(a: string, b: string): -1 | 0 | 1 {
  const left = versionTuple(a);
  const right = versionTuple(b);
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] < right[index]) return -1;
    if (left[index] > right[index]) return 1;
  }
  return 0;
}

function ordered(releases: readonly PolicyRelease[]): PolicyRelease[] {
  return [...releases].sort((left, right) => {
    const byEffectiveAt = left.effectiveAtMs - right.effectiveAtMs;
    return byEffectiveAt || compareVersion(left.version, right.version);
  });
}

export function resolvePolicy(
  manifest: PolicyReleaseManifest,
  policyId: string,
  nowMs: number,
): {
  active: string | null;
  announced: string[];
  recentlyEffective: string[];
  latestPublished: string | null;
  error?: "POLICY_NO_ACTIVE";
} {
  const releases = ordered(eligible(releasesFor(manifest, policyId)));
  const activeCandidates = releases.filter((release) => release.effectiveAtMs <= nowMs);
  const announced = releases.filter((release) => release.noticeAtMs <= nowMs && nowMs < release.effectiveAtMs);
  const recentlyEffective = releases.filter(
    (release) => release.effectiveAtMs <= nowMs && nowMs < release.effectiveAtMs + POLICY_RECENTLY_EFFECTIVE_MS,
  );

  if (activeCandidates.length === 0) {
    return {
      active: null,
      announced: [],
      recentlyEffective: [],
      latestPublished: null,
      error: "POLICY_NO_ACTIVE",
    };
  }

  const active = activeCandidates[activeCandidates.length - 1];
  const latestPublished = announced.length > 0 ? announced[announced.length - 1] : active;
  return {
    active: active.releaseId,
    announced: announced.map((release) => release.releaseId),
    recentlyEffective: recentlyEffective.map((release) => release.releaseId),
    latestPublished: latestPublished.releaseId,
  };
}

function validateScope(scope: string): ReconsentScope {
  if (scope === "account" || FEATURE_SCOPE_PATTERN.test(scope)) return scope as ReconsentScope;
  throw new Error(`유효하지 않은 reconsentScope입니다: ${scope}`);
}

function releaseInScope(release: PolicyRelease, scope: ReconsentScope): boolean {
  if (release.requiresReConsent) return release.reconsentScope === scope;
  return scope === "account";
}

export function consentCovers(
  consentRelease: PolicyRelease | null | undefined,
  anchor: PolicyRelease | null | undefined,
  scopeInput: string,
  eligibleReleases: readonly PolicyRelease[],
): boolean {
  const scope = validateScope(scopeInput);
  if (!consentRelease || !anchor) return false;
  if (consentRelease.status === "cancelled" || anchor.status === "cancelled") return false;
  if (!releaseInScope(anchor, scope)) return false;
  if (consentRelease.releaseId === anchor.releaseId) return true;
  if (consentRelease.coversReleaseIds.includes(anchor.releaseId)) return true;
  if (consentRelease.effectiveAtMs <= anchor.effectiveAtMs) return false;

  return !eligible(eligibleReleases).some(
    (release) =>
      release.requiresReConsent &&
      release.reconsentScope === scope &&
      anchor.effectiveAtMs < release.effectiveAtMs &&
      release.effectiveAtMs <= consentRelease.effectiveAtMs,
  );
}

function policyConsentReleases(
  manifest: PolicyReleaseManifest,
  policyId: string,
  consents: readonly PolicyConsent[],
): { consentKey: "terms" | "privacy" | null; releases: PolicyRelease[] } {
  const definition = policy(manifest, policyId);
  const consentKey = definition.aliases?.consentKey ?? null;
  if (!consentKey) return { consentKey, releases: [] };

  const eligibleReleases = eligible(releasesFor(manifest, policyId));
  const byVersion = new Map(eligibleReleases.map((release) => [release.version, release]));
  return {
    consentKey,
    releases: consents.flatMap((consent) => {
      const release = byVersion.get(consent.version);
      return consent.policyId === consentKey && release ? [release] : [];
    }),
  };
}

function purposeConsentReleases(
  releases: readonly PolicyRelease[],
  purposeConsents: readonly PurposeConsent[] | undefined,
  purposeId: string | null | undefined,
): PolicyRelease[] {
  if (!purposeId) return [];
  const byVersion = new Map(releases.map((release) => [release.version, release]));
  return (purposeConsents ?? []).flatMap((consent) => {
    const release = byVersion.get(consent.linkedPrivacyVersion ?? "");
    return consent.purposeId === purposeId && consent.revokedAt == null && release ? [release] : [];
  });
}

function anchorForScope(
  releases: readonly PolicyRelease[],
  nowMs: number,
  scopeInput: string,
  holds: readonly string[] = [],
  ignoreHolds = false,
): PolicyRelease | null {
  const scope = validateScope(scopeInput);
  const active = ordered(releases).filter((release) => release.effectiveAtMs <= nowMs);
  const candidates = active.filter((release) => release.requiresReConsent && release.reconsentScope === scope);
  const heldIds = new Set(holds);

  if (scope === "account") {
    const available = ignoreHolds ? candidates : candidates.filter((release) => !heldIds.has(release.releaseId));
    if (available.length > 0) return available[available.length - 1];
    const seed = active[0];
    return seed && (ignoreHolds || !heldIds.has(seed.releaseId)) ? seed : null;
  }

  return candidates.length > 0 ? candidates[candidates.length - 1] : null;
}

function scopeSatisfied(
  consentReleases: readonly PolicyRelease[],
  anchor: PolicyRelease | null,
  scope: ReconsentScope,
  eligibleReleases: readonly PolicyRelease[],
): boolean {
  if (!anchor) return true;
  return consentReleases.some((release) => consentCovers(release, anchor, scope, eligibleReleases));
}

export function consentStatus(
  manifest: PolicyReleaseManifest,
  policyId: string,
  consents: readonly PolicyConsent[],
  nowMs: number,
  holds: readonly string[] = [],
  scopeInput: string = "account",
  purposeConsents: readonly PurposeConsent[] = [],
  purposeId?: string | null,
): { anchor: string | null; satisfied: boolean; noticeRequired: boolean; enforcement: boolean } {
  const scope = validateScope(scopeInput);
  const releases = releasesFor(manifest, policyId);
  const eligibleReleases = eligible(releases);
  const { consentKey, releases: accountConsentReleases } = policyConsentReleases(manifest, policyId, consents);

  if (scope === "account" && !consentKey) {
    return { anchor: null, satisfied: true, noticeRequired: false, enforcement: false };
  }

  const orderedReleases = ordered(eligibleReleases);
  let anchor: PolicyRelease | null;
  let satisfactionReleases: PolicyRelease[];
  let satisfied: boolean;

  if (scope === "account") {
    const anchorIgnoringHold = anchorForScope(eligibleReleases, nowMs, scope, holds, true);
    anchor = anchorForScope(eligibleReleases, nowMs, scope, holds);
    satisfactionReleases = accountConsentReleases;
    satisfied =
      scopeSatisfied(satisfactionReleases, anchorIgnoringHold, scope, eligibleReleases) ||
      scopeSatisfied(satisfactionReleases, anchor, scope, eligibleReleases);
  } else {
    anchor = anchorForScope(eligibleReleases, nowMs, scope, holds);
    satisfactionReleases = purposeConsentReleases(eligibleReleases, purposeConsents, purposeId);
    satisfied = scopeSatisfied(satisfactionReleases, anchor, scope, eligibleReleases);
  }

  const announced = orderedReleases.filter(
    (release) => release.noticeAtMs <= nowMs && nowMs < release.effectiveAtMs,
  );
  const noticeRequired = announced.some(
    (release) =>
      release.requiresReConsent &&
      release.reconsentScope === scope &&
      !scopeSatisfied(satisfactionReleases, release, scope, eligibleReleases),
  );

  return {
    anchor: anchor?.releaseId ?? null,
    satisfied,
    noticeRequired,
    enforcement: scope === "account" && !satisfied,
  };
}

function releaseIndex(manifest: PolicyReleaseManifest): Map<string, { policyId: string; release: PolicyRelease }> {
  const index = new Map<string, { policyId: string; release: PolicyRelease }>();
  for (const [policyId, definition] of Object.entries(manifestWithLoosePolicyKeys(manifest).policies)) {
    for (const release of definition.releases ?? []) index.set(release.releaseId, { policyId, release });
  }
  return index;
}

export function consentWrite(
  manifest: PolicyReleaseManifest,
  releaseIds: readonly string[],
  requestedManifestRevision: string,
  nowMs: number,
): { accepted: boolean; errorCode?: "POLICY_RELEASE_MISMATCH"; warning?: "MANIFEST_REVISION_MISMATCH" } {
  const index = releaseIndex(manifest);
  const allowed = new Set<string>();
  for (const policyId of Object.keys(manifestWithLoosePolicyKeys(manifest).policies)) {
    const selection = resolvePolicy(manifest, policyId, nowMs);
    if (selection.active) allowed.add(selection.active);
    selection.announced.forEach((releaseId) => allowed.add(releaseId));
  }

  const accepted = releaseIds.every((releaseId) => {
    const entry = index.get(releaseId);
    return Boolean(entry && entry.release.status !== "cancelled" && allowed.has(releaseId));
  });
  if (!accepted) return { accepted: false, errorCode: "POLICY_RELEASE_MISMATCH" };

  return requestedManifestRevision === manifest.manifestRevision
    ? { accepted: true }
    : { accepted: true, warning: "MANIFEST_REVISION_MISMATCH" };
}

function requirementRelease(
  manifest: PolicyReleaseManifest,
  requirement: PolicyFeatureRequirement,
  nowMs: number,
): PolicyRelease | null {
  const eligibleReleases = eligible(releasesFor(manifest, requirement.policyId));
  const selection = resolvePolicy(manifest, requirement.policyId, nowMs);
  const active = eligibleReleases.find((release) => release.releaseId === selection.active);
  if (active && compareVersion(active.version, requirement.minVersion) >= 0) return active;
  if (!requirement.clauseKey) return null;

  const candidates = eligibleReleases.flatMap((release) => {
    if (release.noticeAtMs > nowMs) return [];
    return release.clauseSchedules
      .filter((clause) => clause.clauseKey === requirement.clauseKey && clause.effectiveAtMs <= nowMs)
      .map((clause) => ({ clause, release }));
  });
  candidates.sort((left, right) => {
    const byClauseTime = left.clause.effectiveAtMs - right.clause.effectiveAtMs;
    if (byClauseTime) return byClauseTime;
    const byReleaseTime = left.release.effectiveAtMs - right.release.effectiveAtMs;
    return byReleaseTime || compareVersion(left.release.version, right.release.version);
  });
  return candidates.length > 0 ? candidates[candidates.length - 1].release : null;
}

export function featureStatus(
  manifest: PolicyReleaseManifest,
  requirement: PolicyFeatureRequirement,
  nowMs: number,
  holds: readonly string[] = [],
  evidence: readonly NoticeEvidence[] = [],
  purposeConsents: readonly PurposeConsent[] = [],
  purposeId?: string | null,
): {
  satisfied: boolean;
  requirementRelease: string | null;
  errorCode?: "POLICY_RELEASE_HOLD" | "POLICY_FEATURE_RECONSENT_REQUIRED";
} {
  const release = requirementRelease(manifest, requirement, nowMs);
  const releaseId = release?.releaseId ?? null;
  if (!release) return { satisfied: false, requirementRelease: null };

  const heldIds = new Set(holds);
  const scope = validateScope(`feature:${requirement.featureKey}`);
  const eligibleReleases = eligible(releasesFor(manifest, requirement.policyId));
  const anchor = anchorForScope(eligibleReleases, nowMs, scope, holds);
  if ((anchor && heldIds.has(anchor.releaseId)) || heldIds.has(release.releaseId)) {
    return { satisfied: false, requirementRelease: releaseId, errorCode: "POLICY_RELEASE_HOLD" };
  }

  const purposeReleases = purposeConsentReleases(eligibleReleases, purposeConsents, purposeId);
  if (!scopeSatisfied(purposeReleases, anchor, scope, eligibleReleases)) {
    return {
      satisfied: false,
      requirementRelease: releaseId,
      errorCode: "POLICY_FEATURE_RECONSENT_REQUIRED",
    };
  }

  const evidenceFound = evidence.some(
    (event) => event.releaseId === releaseId && event.kind === "notice_observed",
  );
  return {
    satisfied: !requirement.requireNoticeEvidence || evidenceFound,
    requirementRelease: releaseId,
  };
}

export function purposeLink(
  manifest: PolicyReleaseManifest,
  policyId: string,
  nowMs: number,
  requirement?: PolicyFeatureRequirement,
): { linkedVersion: string | null } {
  if (requirement) {
    const release = requirementRelease(manifest, requirement, nowMs);
    return { linkedVersion: release?.version ?? null };
  }

  const selection = resolvePolicy(manifest, policyId, nowMs);
  if (!selection.latestPublished) return { linkedVersion: null };
  const release = releasesFor(manifest, policyId).find((item) => item.releaseId === selection.latestPublished);
  return { linkedVersion: release?.version ?? null };
}
