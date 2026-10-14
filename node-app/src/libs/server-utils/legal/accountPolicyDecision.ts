/**
 * @docHint
 * @purpose 계정 정책 버전·동의 상태를 legacy와 manifest runtime 위에서 제공한다.
 * @process runtime 선택  정책별 resolver 호출  호환 상태와 release 목록 구성
 * @domain legal-policy
 * @scope account-policy-decision
 */

import "server-only";

import {
  CURRENT_ACCOUNT_POLICY,
  currentPolicyConsents,
  resolveAccountPolicyConsentStatus,
  type AccountPolicyConsentStatus,
  type AccountPolicyConfiguration,
  type AccountPolicyId,
  type PolicyConsentMethod,
  type PolicyConsentRecord,
} from "consts/legal/accountPolicy";
import { consentCovers, consentStatus, consentWrite, resolvePolicy } from "consts/legal/policyRelease/resolver";
import type { ManifestPolicyId, PolicyRelease, PolicyReleaseManifest, ReconsentScope } from "consts/legal/policyRelease/types";
import {
  PolicyReleaseUnavailableError,
  getPolicyReleaseRuntime,
  toConsentKey,
  toManifestPolicyId,
  type PolicyReleaseRuntime,
} from "./policyReleaseRuntime";
import { getActivePolicyReleaseHolds } from "./policyReleaseSignals";

export type AccountPolicyView = {
  policyId: AccountPolicyId;
  currentVersion: string;
  currentReleaseId: string | null;
  noticeDate: string;
  effectiveDate: string;
  requiredConsentVersion: string | null;
  requiredConsentReleaseId: string | null;
};

export type AccountReleaseItem = {
  releaseId: string;
  policyId: AccountPolicyId;
  version: string;
  noticeAt: string;
  effectiveAt: string;
  requiresReConsent: boolean;
  reconsentScope: ReconsentScope | null;
  contentSha256: string;
  kind: "required" | "announced" | "feature_notice";
};

export type AccountPolicyConsentDecision = AccountPolicyConsentStatus & {
  mode: "legacy" | "manifest";
  manifestRevision: string | null;
  policies: Record<AccountPolicyId, AccountPolicyView>;
  releases: AccountReleaseItem[];
};

export type AccountPolicyRuntimeOptions = {
  runtime?: PolicyReleaseRuntime;
  holds?: readonly string[];
};

type AccountPolicySet = AccountPolicyConfiguration;

const ACCOUNT_POLICY_IDS: readonly AccountPolicyId[] = ["terms", "privacy"];

function runtimeFrom(options?: AccountPolicyRuntimeOptions): PolicyReleaseRuntime {
  return options?.runtime ?? getPolicyReleaseRuntime();
}

function manifestFrom(runtime: PolicyReleaseRuntime): PolicyReleaseManifest {
  if (runtime.mode === "unavailable") throw new PolicyReleaseUnavailableError(runtime.reason);
  if (runtime.mode !== "manifest") throw new Error("manifest runtime이 필요합니다");
  return runtime.manifest;
}

function accountPolicyIdsForManifest(): Array<[AccountPolicyId, ManifestPolicyId]> {
  return ACCOUNT_POLICY_IDS.map((accountId) => [accountId, toManifestPolicyId(accountId)]);
}

function releaseById(manifest: PolicyReleaseManifest, policyId: ManifestPolicyId, releaseId: string | null | undefined): PolicyRelease | null {
  if (!releaseId) return null;
  return manifest.policies[policyId].releases.find((release) => release.releaseId === releaseId) ?? null;
}

function latestPublishedRelease(
  manifest: PolicyReleaseManifest,
  policyId: ManifestPolicyId,
  nowMs: number,
): PolicyRelease {
  const selection = resolvePolicy(manifest, policyId, nowMs);
  const release = releaseById(manifest, policyId, selection.latestPublished);
  if (!release) throw new PolicyReleaseUnavailableError(`정책 릴리스를 확인할 수 없습니다: ${policyId}`);
  return release;
}

function toLegacyPolicyViews(): Record<AccountPolicyId, AccountPolicyView> {
  return {
    terms: {
      policyId: "terms",
      currentVersion: CURRENT_ACCOUNT_POLICY.terms.version,
      currentReleaseId: null,
      noticeDate: CURRENT_ACCOUNT_POLICY.terms.noticeDate,
      effectiveDate: CURRENT_ACCOUNT_POLICY.terms.effectiveDate,
      requiredConsentVersion: CURRENT_ACCOUNT_POLICY.terms.version,
      requiredConsentReleaseId: null,
    },
    privacy: {
      policyId: "privacy",
      currentVersion: CURRENT_ACCOUNT_POLICY.privacy.version,
      currentReleaseId: null,
      noticeDate: CURRENT_ACCOUNT_POLICY.privacy.noticeDate,
      effectiveDate: CURRENT_ACCOUNT_POLICY.privacy.effectiveDate,
      requiredConsentVersion: CURRENT_ACCOUNT_POLICY.privacy.version,
      requiredConsentReleaseId: null,
    },
  };
}

function unavailableForNoActive(policyId: ManifestPolicyId): never {
  throw new PolicyReleaseUnavailableError(`시행 중인 정책 릴리스가 없습니다: ${policyId}`);
}

export function getCurrentAccountPolicy(now: Date = new Date(), options?: AccountPolicyRuntimeOptions): AccountPolicySet {
  const runtime = runtimeFrom(options);
  if (runtime.mode === "legacy") return CURRENT_ACCOUNT_POLICY;
  const manifest = manifestFrom(runtime);
  const nowMs = now.getTime();

  const result = Object.fromEntries(
    accountPolicyIdsForManifest().map(([accountId, policyId]) => {
      const selection = resolvePolicy(manifest, policyId, nowMs);
      if (selection.error || !selection.latestPublished) unavailableForNoActive(policyId);
      const release = releaseById(manifest, policyId, selection.latestPublished);
      if (!release) unavailableForNoActive(policyId);
      return [accountId, {
        policyId: accountId,
        version: release.version,
        noticeDate: release.noticeAt,
        effectiveDate: release.effectiveAt,
      }];
    }),
  ) as AccountPolicySet;

  return result;
}

export function getAccountPolicyViews(
  now: Date = new Date(),
  options?: AccountPolicyRuntimeOptions,
): Record<AccountPolicyId, AccountPolicyView> {
  const runtime = runtimeFrom(options);
  if (runtime.mode === "legacy") return toLegacyPolicyViews();
  const manifest = manifestFrom(runtime);
  const holds = options?.holds ?? [];
  const nowMs = now.getTime();

  return Object.fromEntries(accountPolicyIdsForManifest().map(([accountId, policyId]) => {
    const current = latestPublishedRelease(manifest, policyId, nowMs);
    const accountStatus = consentStatus(manifest, policyId, [], nowMs, holds, "account");
    const required = releaseById(manifest, policyId, accountStatus.anchor);
    return [accountId, {
      policyId: accountId,
      currentVersion: current.version,
      currentReleaseId: current.releaseId,
      noticeDate: current.noticeAt,
      effectiveDate: current.effectiveAt,
      requiredConsentVersion: required?.version ?? null,
      requiredConsentReleaseId: required?.releaseId ?? null,
    }];
  })) as Record<AccountPolicyId, AccountPolicyView>;
}

function accountConsentReleases(
  manifest: PolicyReleaseManifest,
  policyId: ManifestPolicyId,
  nowMs: number,
): { active: PolicyRelease | null; announced: PolicyRelease[] } {
  const definition = manifest.policies[policyId];
  if (!definition.aliases.consentKey) return { active: null, announced: [] };
  const selection = resolvePolicy(manifest, policyId, nowMs);
  return {
    active: releaseById(manifest, policyId, selection.active),
    announced: selection.announced
      .map((releaseId) => releaseById(manifest, policyId, releaseId))
      .filter((release): release is PolicyRelease => Boolean(
        release?.requiresReConsent && release.reconsentScope === "account",
      )),
  };
}

export function getSignupPolicyOffer(
  now: Date = new Date(),
  options?: AccountPolicyRuntimeOptions,
): {
  mode: "legacy" | "manifest";
  manifestRevision: string | null;
  releaseIds: string[];
  termsVersion: string;
  privacyVersion: string;
  policy: AccountPolicySet;
  policies: Record<AccountPolicyId, AccountPolicyView>;
} {
  const runtime = runtimeFrom(options);
  if (runtime.mode === "legacy") {
    return {
      mode: "legacy",
      manifestRevision: null,
      releaseIds: [],
      termsVersion: CURRENT_ACCOUNT_POLICY.terms.version,
      privacyVersion: CURRENT_ACCOUNT_POLICY.privacy.version,
      policy: CURRENT_ACCOUNT_POLICY,
      policies: toLegacyPolicyViews(),
    };
  }

  const manifest = manifestFrom(runtime);
  const nowMs = now.getTime();
  const releaseIds: string[] = [];
  const activeVersions = new Map<AccountPolicyId, string>();
  for (const [accountId, policyId] of accountPolicyIdsForManifest()) {
    const selection = accountConsentReleases(manifest, policyId, nowMs);
    if (!selection.active) unavailableForNoActive(policyId);
    activeVersions.set(accountId, selection.active.version);
    releaseIds.push(selection.active.releaseId, ...selection.announced.map((release) => release.releaseId));
  }

  const currentPolicy = getCurrentAccountPolicy(now, { runtime });
  return {
    mode: "manifest",
    manifestRevision: manifest.manifestRevision,
    releaseIds,
    termsVersion: activeVersions.get("terms") ?? unavailableForNoActive("terms-of-service"),
    privacyVersion: activeVersions.get("privacy") ?? unavailableForNoActive("privacy-policy"),
    policy: currentPolicy,
    policies: getAccountPolicyViews(now, { runtime, holds: options?.holds }),
  };
}

function throwConsentMismatch(): never {
  const error = new Error("정책 릴리스가 현재 manifest와 일치하지 않습니다.") as Error & {
    errorCode: "POLICY_RELEASE_MISMATCH";
    status: 409;
  };
  error.errorCode = "POLICY_RELEASE_MISMATCH";
  error.status = 409;
  throw error;
}

export function buildAccountConsentRecords(
  args: {
    method: PolicyConsentMethod;
    provider?: string;
    agreedAt: Date;
    releaseIds?: readonly string[];
    manifestRevision?: string | null;
    policyIds?: readonly AccountPolicyId[];
  },
  options?: AccountPolicyRuntimeOptions,
): { records: PolicyConsentRecord[]; warning?: "MANIFEST_REVISION_MISMATCH" } {
  const runtime = runtimeFrom(options);
  if (runtime.mode === "legacy") {
    const ids = args.policyIds ?? ACCOUNT_POLICY_IDS;
    const generated = currentPolicyConsents(args.method, args.provider, ids);
    return {
      records: generated.map((record) => ({ ...record, agreedAt: args.agreedAt })),
    };
  }

  const manifest = manifestFrom(runtime);
  const releaseIds = args.releaseIds ?? [];
  const write = consentWrite(manifest, releaseIds, args.manifestRevision ?? "", args.agreedAt.getTime());
  if (!write.accepted) throwConsentMismatch();

  const records = releaseIds.flatMap((releaseId) => {
    const matched = Object.entries(manifest.policies).flatMap(([policyId, definition]) =>
      definition.releases
        .filter((release) => release.releaseId === releaseId && release.status !== "cancelled")
        .map((release) => ({ policyId: policyId as ManifestPolicyId, release, definition })),
    )[0];
    if (!matched) throwConsentMismatch();
    const policyId = toConsentKey(matched.policyId);
    if (!policyId) return [];
    const displayed = latestPublishedRelease(manifest, matched.policyId, args.agreedAt.getTime());
    return [{
      policyId,
      version: matched.release.version,
      agreedAt: args.agreedAt,
      method: args.method,
      ...(args.provider ? { provider: args.provider } : {}),
      displayedReleaseId: displayed.releaseId,
      displayedContentSha256: displayed.contentSha256,
    }];
  });

  return { records, ...(write.warning ? { warning: write.warning } : {}) };
}

function accountConsentReleaseRecords(
  manifest: PolicyReleaseManifest,
  policyId: ManifestPolicyId,
  accountPolicyId: AccountPolicyId,
  consents: readonly PolicyConsentRecord[],
): PolicyRelease[] {
  const versions = new Set(
    consents.filter((consent) => consent.policyId === accountPolicyId).map((consent) => consent.version),
  );
  return manifest.policies[policyId].releases.filter(
    (release) => release.status !== "cancelled" && versions.has(release.version),
  );
}

function releaseItem(
  release: PolicyRelease,
  policyId: AccountPolicyId,
  kind: AccountReleaseItem["kind"],
): AccountReleaseItem {
  return {
    releaseId: release.releaseId,
    policyId,
    version: release.version,
    noticeAt: release.noticeAt,
    effectiveAt: release.effectiveAt,
    requiresReConsent: release.requiresReConsent,
    reconsentScope: release.reconsentScope,
    contentSha256: release.contentSha256,
    kind,
  };
}

export async function decideAccountPolicyConsent(
  consents: readonly PolicyConsentRecord[],
  now: Date = new Date(),
  options?: AccountPolicyRuntimeOptions,
): Promise<AccountPolicyConsentDecision> {
  const runtime = runtimeFrom(options);
  if (runtime.mode === "unavailable") throw new PolicyReleaseUnavailableError(runtime.reason);
  if (runtime.mode === "legacy") {
    const status = resolveAccountPolicyConsentStatus(consents, now);
    return {
      ...status,
      mode: "legacy",
      manifestRevision: null,
      policies: toLegacyPolicyViews(),
      releases: [],
    };
  }

  const manifest = runtime.manifest;
  const holds = options?.holds ?? await getActivePolicyReleaseHolds();
  const nowMs = now.getTime();
  const currentPolicies = getCurrentAccountPolicy(now, { runtime });
  const policies = getAccountPolicyViews(now, { runtime, holds });
  const noticePolicyIds: AccountPolicyId[] = [];
  const enforcementPolicyIds: AccountPolicyId[] = [];
  const releases: AccountReleaseItem[] = [];

  for (const [accountId, policyId] of accountPolicyIdsForManifest()) {
    const status = consentStatus(
      manifest,
      policyId,
      consents.map(({ policyId: key, version }) => ({ policyId: key, version })),
      nowMs,
      holds,
      "account",
    );
    if (status.enforcement) enforcementPolicyIds.push(accountId);
    if (status.enforcement || status.noticeRequired) noticePolicyIds.push(accountId);

    const selection = resolvePolicy(manifest, policyId, nowMs);
    const active = releaseById(manifest, policyId, selection.active);
    if (active && !status.satisfied) releases.push(releaseItem(active, accountId, "required"));

    const knownAccountConsents = accountConsentReleaseRecords(manifest, policyId, accountId, consents);
    for (const releaseId of selection.announced) {
      const announced = releaseById(manifest, policyId, releaseId);
      if (!announced || !announced.requiresReConsent || announced.reconsentScope !== "account") continue;
      const covered = knownAccountConsents.some((consent) =>
        consentCovers(consent, announced, "account", manifest.policies[policyId].releases),
      );
      if (!covered) releases.push(releaseItem(announced, accountId, "announced"));
    }

    if (accountId === "privacy") {
      for (const releaseId of selection.announced) {
        const announced = releaseById(manifest, policyId, releaseId);
        if (announced?.requiresReConsent && announced.reconsentScope?.startsWith("feature:")) {
          releases.push(releaseItem(announced, accountId, "feature_notice"));
        }
      }
    }
  }

  return {
    required: noticePolicyIds.length > 0,
    missingPolicyIds: noticePolicyIds,
    noticePolicyIds,
    enforcementPolicyIds,
    noticeActive: noticePolicyIds.length > 0,
    enforcementActive: enforcementPolicyIds.length > 0,
    currentPolicies,
    mode: "manifest",
    manifestRevision: manifest.manifestRevision,
    policies,
    releases,
  };
}
