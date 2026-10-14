/**
 * @docHint
 * @purpose 생성된 정책 manifest의 런타임 모드와 fail-closed 오류를 제공한다.
 * @process placeholder·manifest·손상 manifest 판별  memoized runtime 반환
 * @domain legal-policy
 * @scope policy-release-runtime
 */

import "server-only";

import { POLICY_RELEASE_MANIFEST } from "consts/legal/generated/policyReleaseManifest.generated";
import type { ManifestPolicyId, PolicyRelease, PolicyReleaseManifest } from "consts/legal/policyRelease/types";

export type PolicyReleaseRuntime =
  | { mode: "legacy" }
  | { mode: "manifest"; manifest: PolicyReleaseManifest }
  | { mode: "unavailable"; reason: string };

const POLICY_IDS: readonly ManifestPolicyId[] = ["terms-of-service", "privacy-policy", "refund-return-policy"];
const FEATURE_SCOPE_PATTERN = /^feature:[a-z0-9.-]+$/;
const VERSION_PATTERN = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNullableBoolean(value: unknown): value is boolean | null {
  return value === null || typeof value === "boolean";
}

function validateRelease(policyId: ManifestPolicyId, value: unknown): value is PolicyRelease {
  if (!isRecord(value)) return false;
  if (typeof value.version !== "string" || !VERSION_PATTERN.test(value.version)) return false;
  if (value.releaseId !== `${policyId}@${value.version}`) return false;
  if (typeof value.noticeAt !== "string" || !Number.isSafeInteger(value.noticeAtMs)) return false;
  if (typeof value.effectiveAt !== "string" || !Number.isSafeInteger(value.effectiveAtMs)) return false;
  if (typeof value.material !== "boolean" || typeof value.requiresReConsent !== "boolean") return false;
  if (!Array.isArray(value.coversReleaseIds) || !value.coversReleaseIds.every((id) => typeof id === "string")) return false;
  if (value.reconsentScope !== null && value.reconsentScope !== "account" &&
      !(typeof value.reconsentScope === "string" && FEATURE_SCOPE_PATTERN.test(value.reconsentScope))) return false;
  if (value.requiresReConsent && value.reconsentScope === null) return false;
  if (!value.requiresReConsent && value.reconsentScope !== null) return false;
  if (!isNullableBoolean(value.adverseToUsers) || !isNullableBoolean(value.materialRightsOrObligationsChange)) return false;
  if (!Array.isArray(value.clauseSchedules) || !value.clauseSchedules.every((clause) => {
    return isRecord(clause) &&
      typeof clause.clauseKey === "string" &&
      typeof clause.effectiveAt === "string" &&
      Number.isSafeInteger(clause.effectiveAtMs) &&
      typeof clause.label === "string" &&
      isNullableBoolean(clause.adverseToUsers) &&
      isNullableBoolean(clause.materialRightsOrObligationsChange);
  })) return false;
  if (value.status !== "scheduled" && value.status !== "cancelled") return false;
  if (!isNullableString(value.cancelledAt)) return false;
  if (typeof value.contentSha256 !== "string" || !SHA256_PATTERN.test(value.contentSha256)) return false;
  if (value.summarySha256 !== null && (typeof value.summarySha256 !== "string" || !SHA256_PATTERN.test(value.summarySha256))) return false;
  if (typeof value.moduleFile !== "string" || value.moduleFile.length === 0) return false;
  if (!isNullableString(value.summaryFile)) return false;
  return true;
}

function validateManifest(value: unknown): value is PolicyReleaseManifest {
  if (!isRecord(value) || value.schemaVersion !== 2 || typeof value.manifestRevision !== "string") return false;
  const policies = value.policies;
  if (!isRecord(policies) || Object.keys(policies).length !== POLICY_IDS.length) return false;

  const expectedConsentKeys: Record<ManifestPolicyId, "terms" | "privacy" | null> = {
    "terms-of-service": "terms",
    "privacy-policy": "privacy",
    "refund-return-policy": null,
  };

  return POLICY_IDS.every((policyId) => {
    const definition = policies[policyId];
    if (!isRecord(definition) || !Array.isArray(definition.releases) || !isRecord(definition.aliases)) return false;
    if (definition.aliases.consentKey !== expectedConsentKeys[policyId]) return false;
    if (typeof definition.aliases.shortcodeType !== "string" || typeof definition.aliases.wpSlug !== "string") return false;
    return definition.releases.every((release) => validateRelease(policyId, release));
  });
}

export function createPolicyReleaseRuntime(source: unknown): PolicyReleaseRuntime {
  if (source === null) return { mode: "legacy" };
  if (!validateManifest(source)) return { mode: "unavailable", reason: "POLICY_RELEASE_MANIFEST_INVALID" };
  return { mode: "manifest", manifest: source };
}

let memoizedRuntime: PolicyReleaseRuntime | undefined;

export function getPolicyReleaseRuntime(): PolicyReleaseRuntime {
  memoizedRuntime ??= createPolicyReleaseRuntime(POLICY_RELEASE_MANIFEST);
  return memoizedRuntime;
}

export class PolicyReleaseUnavailableError extends Error {
  readonly errorCode = "POLICY_RELEASE_UNAVAILABLE" as const;
  readonly status = 503 as const;

  constructor(message = "정책 정보를 일시적으로 확인할 수 없습니다.") {
    super(message);
    this.name = "PolicyReleaseUnavailableError";
  }
}

export function toManifestPolicyId(key: "terms" | "privacy"): ManifestPolicyId {
  return key === "terms" ? "terms-of-service" : "privacy-policy";
}

export function toConsentKey(policyId: ManifestPolicyId): "terms" | "privacy" | null {
  const map: Record<ManifestPolicyId, "terms" | "privacy" | null> = {
    "terms-of-service": "terms",
    "privacy-policy": "privacy",
    "refund-return-policy": null,
  };
  return map[policyId];
}
