"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { ExternalLink } from "lucide-react";
import { ACCOUNT_POLICY_LINKS, type AccountPolicyConsentStatus, type AccountPolicyId } from "consts/legal/accountPolicy";
import { Button, Checkbox, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@amu-labs/ui";
import { lang } from "components/module/i18n";
import { useAuthStore } from "store/auth";

type AccountPolicyDisplayRelease = {
  releaseId: string;
  policyId: AccountPolicyId;
  version: string;
  effectiveAt: string;
  kind: "required" | "announced" | "feature_notice";
};

type AccountPolicyDisplay = AccountPolicyConsentStatus & (
  | { mode: "legacy"; manifestRevision: null; releases: [] }
  | { mode: "manifest"; manifestRevision: string; releases: AccountPolicyDisplayRelease[] }
  | { mode?: undefined; manifestRevision?: undefined; releases?: undefined }
);

type PolicyResponse = { ok?: boolean; policy?: AccountPolicyDisplay; error?: string; errorCode?: string };

export function shouldShowPolicyReconsentGate(policy: AccountPolicyDisplay | null | undefined): boolean {
  if (!policy) return false;
  const hasAccountNotice = policy.required && policy.noticeActive;
  const hasFeatureNotice = policy.mode === "manifest" && policy.releases.some((release) => release.kind === "feature_notice");
  return hasAccountNotice || hasFeatureNotice;
}

export function canSubmitPolicyConsent(policy: AccountPolicyDisplay | null | undefined): boolean {
  if (!policy) return false;
  if (policy.mode === "manifest") {
    return policy.required && policy.noticeActive && policy.releases.some((release) => release.kind !== "feature_notice");
  }
  return policy.required && policy.noticeActive;
}

const BYPASS_PATHS = ["/account", "/login", "/signup"];

export default function PolicyReconsentGate() {
  const pathname = usePathname();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const logout = useAuthStore((state) => state.logout);
  const [policy, setPolicy] = useState<AccountPolicyDisplay | null>(null);
  const [open, setOpen] = useState(false);
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [privacyAgreed, setPrivacyAgreed] = useState(false);
  const [selectedReleaseIds, setSelectedReleaseIds] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const bypassed = BYPASS_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  const needsTerms = policy?.noticePolicyIds.includes("terms") === true;
  const needsPrivacy = policy?.noticePolicyIds.includes("privacy") === true;
  const consentReleases = policy?.mode === "manifest"
    ? (policy.releases ?? []).filter((release) => release.kind !== "feature_notice")
    : [];
  const featureNotices = policy?.mode === "manifest"
    ? policy.releases.filter((release) => release.kind === "feature_notice")
    : [];
  const showConsentAction = canSubmitPolicyConsent(policy);
  const firstConsentReleaseIndex = policy?.mode === "manifest"
    ? policy.releases.findIndex((release) => release.kind !== "feature_notice")
    : -1;
  const firstConsentId = policy?.mode === "manifest" && firstConsentReleaseIndex >= 0
    ? `policy-release-consent-${firstConsentReleaseIndex}`
    : needsTerms
      ? "policy-terms-consent"
      : "policy-privacy-consent";

  useEffect(() => {
    if (!isAuthenticated || bypassed) {
      return;
    }

    let cancelled = false;
    void fetch("/api/account/policy-consent", { credentials: "include", cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json()) as PolicyResponse;
        if (!response.ok) throw new Error(data.error || "policy status request failed");
        if (cancelled || !data.policy) return;
        setPolicy(data.policy);
        setSelectedReleaseIds(new Set());
        setOpen(shouldShowPolicyReconsentGate(data.policy));
      })
      .catch(() => {
        if (!cancelled) {
          setError(
            lang({
              ko: "정책 동의 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
              en: "We could not check your policy consent. Please try again shortly.",
            }),
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [bypassed, isAuthenticated]);

  if (!isAuthenticated || bypassed || !policy || !shouldShowPolicyReconsentGate(policy)) return null;

  const submit = async () => {
    if (!showConsentAction) {
      setOpen(false);
      return;
    }

    const isManifest = policy.mode === "manifest";
    if (isManifest && consentReleases.some((release) => !selectedReleaseIds.has(release.releaseId))) {
      setError(
        lang({
          ko: "표시된 개정 정책의 필수 동의 항목을 확인해 주세요.",
          en: "Please accept each updated policy shown below.",
        }),
      );
      document.getElementById(firstConsentId)?.focus();
      return;
    }

    if (!isManifest && ((needsTerms && !termsAgreed) || (needsPrivacy && !privacyAgreed))) {
      setError(
        lang({
          ko: "표시된 개정 정책의 필수 동의 항목을 확인해 주세요.",
          en: "Please accept each updated policy shown below.",
        }),
      );
      document.getElementById(firstConsentId)?.focus();
      return;
    }

    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/account/policy-consent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify(
          isManifest
            ? {
                releaseIds: consentReleases
                  .filter((release) => selectedReleaseIds.has(release.releaseId))
                  .map((release) => release.releaseId),
                manifestRevision: policy.manifestRevision,
              }
            : {
                termsAgreed: needsTerms && termsAgreed,
                privacyAgreed: needsPrivacy && privacyAgreed,
              },
        ),
      });
      const data = (await response.json()) as PolicyResponse;
      if (!response.ok || !data.policy || data.policy.noticeActive) {
        throw Object.assign(new Error("policy consent update failed"), {
          status: response.status,
          errorCode: data.errorCode,
        });
      }
      setPolicy(data.policy);
      setOpen(false);
    } catch (submitError) {
      const errorStatus = typeof submitError === "object" && submitError !== null && "status" in submitError
        ? Number(submitError.status)
        : 0;
      const errorCode = typeof submitError === "object" && submitError !== null && "errorCode" in submitError
        ? String(submitError.errorCode)
        : "";
      setError(errorStatus === 409 || errorCode === "POLICY_RELEASE_MISMATCH"
        ? lang({
            ko: "정책 버전이 변경되었습니다. 새로고침한 뒤 다시 확인해 주세요.",
            en: "The policy version changed. Refresh the page and try again.",
          })
        : errorStatus === 503 || errorCode === "POLICY_RELEASE_UNAVAILABLE"
          ? lang({
              ko: "정책 정보를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.",
              en: "Policy information is unavailable. Please try again shortly.",
            })
          : lang({
              ko: "동의 기록을 저장하지 못했습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.",
              en: "We could not save your consent. Check your connection and try again.",
            }));
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOut({ redirect: false }).catch(() => undefined);
    logout();
    window.location.href = "/";
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && policy.enforcementActive) return;
        setOpen(nextOpen);
      }}
    >
      <DialogContent
        hideClose={policy.enforcementActive}
        disableOutsideClick={policy.enforcementActive}
        onEscapeKeyDown={(event) => {
          if (policy.enforcementActive) event.preventDefault();
        }}
        onOpenAutoFocus={(event) => {
          const focusTarget = document.getElementById(firstConsentId) ?? document.getElementById("policy-feature-notice-heading");
          if (focusTarget) {
            event.preventDefault();
            focusTarget.focus();
          }
        }}
        className="motion-reduce:transition-none motion-reduce:animate-none"
        innerWrapClassName="max-w-full max-h-[calc(100dvh-2rem)] overflow-y-auto overflow-x-hidden"
      >
        <DialogHeader className="pr-8">
          <DialogTitle>
            {showConsentAction
              ? lang({ ko: "개정 정책 동의 안내", en: "Updated policy consent" })
              : lang({ ko: "정책 개정 안내", en: "Policy update notice" })}
          </DialogTitle>
          <DialogDescription className="leading-6">
            {lang({
              ko: "표시된 개정 정책은 각 안내된 시행일부터 적용됩니다.",
              en: "Each updated policy below applies from its stated effective date.",
            })}
          </DialogDescription>
        </DialogHeader>

        {policy.mode === "manifest" ? (
          <div className="space-y-3">
            {policy.releases.map((release, index) => {
              const policyName = release.policyId === "terms"
                ? lang({ ko: "이용약관", en: "Terms" })
                : lang({ ko: "개인정보처리방침", en: "Privacy Policy" });
              const consentRequired = release.kind !== "feature_notice";
              const checkboxId = `policy-release-consent-${index}`;
              const kindLabel = release.kind === "required"
                ? lang({ ko: "필수", en: "Required" })
                : lang({ ko: "개정 예정", en: "Upcoming change" });

              return (
                <div key={release.releaseId} className="flex min-h-11 items-start gap-3 rounded-lg border border-surface-2 px-3 py-2 text-sm leading-6">
                  {consentRequired ? (
                    <Checkbox
                      id={checkboxId}
                      checked={selectedReleaseIds.has(release.releaseId)}
                      onCheckedChange={(checked) => {
                        setSelectedReleaseIds((current) => {
                          const next = new Set(current);
                          if (checked === true) next.add(release.releaseId);
                          else next.delete(release.releaseId);
                          return next;
                        });
                      }}
                      aria-describedby={`${checkboxId}-label`}
                      className="icon-xs mt-1"
                    />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    {consentRequired ? (
                      <label id={`${checkboxId}-label`} htmlFor={checkboxId} className="block min-h-11 cursor-pointer">
                        <span className="font-semibold">[{kindLabel}] {policyName} v{release.version}</span>
                        <span className="block text-xs text-secondary-text">
                          {lang({ ko: "시행일", en: "Effective" })}: {release.effectiveAt.slice(0, 10)}
                        </span>
                      </label>
                      ) : (
                      <div>
                        <p
                          id={consentReleases.length === 0 && release.releaseId === featureNotices[0]?.releaseId
                            ? "policy-feature-notice-heading"
                            : undefined}
                          tabIndex={consentReleases.length === 0 && release.releaseId === featureNotices[0]?.releaseId ? -1 : undefined}
                          className="font-semibold"
                        >
                          [{kindLabel}] {policyName} v{release.version}
                        </p>
                        <p className="text-xs text-secondary-text">
                          {lang({ ko: "시행일", en: "Effective" })}: {release.effectiveAt.slice(0, 10)}
                        </p>
                        {/* TODO(법무 승인): feature scope 안내 문안을 최종 확정한다. */}
                        <p className="mt-1 text-sm leading-6">
                          {lang({
                            ko: "동의하지 않아도 해당 기능 외 이용에는 영향이 없습니다.",
                            en: "Declining this consent will not affect use outside the related feature.",
                          })}
                        </p>
                      </div>
                    )}
                  </div>
                  <a
                    href={ACCOUNT_POLICY_LINKS[release.policyId]}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center text-primary underline focus-visible-ring"
                    aria-label={lang({ ko: `${policyName} 새 창에서 보기`, en: `Open ${policyName} in a new tab` })}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  </a>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-3">
          {needsTerms ? (
            <div className="flex min-h-11 items-center gap-3 rounded-lg border border-surface-2 px-3 py-2 text-sm leading-6">
              <Checkbox
                id="policy-terms-consent"
                checked={termsAgreed}
                onCheckedChange={(checked) => setTermsAgreed(checked === true)}
                aria-describedby="policy-terms-label"
                className="icon-xs"
              />
              <label
                id="policy-terms-label"
                htmlFor="policy-terms-consent"
                className="min-w-0 flex-1 cursor-pointer"
              >
                <span className="font-semibold">
                  {lang({ ko: "[필수] 이용약관 동의", en: "[Required] Terms" })}
                </span>
                <span className="block text-xs text-secondary-text">
                  {lang({ ko: "시행일", en: "Effective" })}: {policy.currentPolicies.terms.effectiveDate.slice(0, 10)}
                </span>
              </label>
              <a
                href={ACCOUNT_POLICY_LINKS.terms}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 min-w-11 items-center justify-center text-primary underline focus-visible-ring"
                aria-label={lang({ ko: "이용약관 새 창에서 보기", en: "Open Terms in a new tab" })}
                onClick={(event) => event.stopPropagation()}
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>
          ) : null}
          {needsPrivacy ? (
            <div className="flex min-h-11 items-center gap-3 rounded-lg border border-surface-2 px-3 py-2 text-sm leading-6">
              <Checkbox
                id="policy-privacy-consent"
                checked={privacyAgreed}
                onCheckedChange={(checked) => setPrivacyAgreed(checked === true)}
                aria-describedby="policy-privacy-label"
                className="icon-xs"
              />
              <label
                id="policy-privacy-label"
                htmlFor="policy-privacy-consent"
                className="min-w-0 flex-1 cursor-pointer"
              >
                <span className="font-semibold">
                  {lang({ ko: "[필수] 개인정보처리방침 동의", en: "[Required] Privacy Policy" })}
                </span>
                <span className="block text-xs text-secondary-text">
                  {lang({ ko: "시행일", en: "Effective" })}: {policy.currentPolicies.privacy.effectiveDate.slice(0, 10)}
                </span>
              </label>
              <a
                href={ACCOUNT_POLICY_LINKS.privacy}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 min-w-11 items-center justify-center text-primary underline focus-visible-ring"
                aria-label={lang({ ko: "개인정보처리방침 새 창에서 보기", en: "Open Privacy Policy in a new tab" })}
                onClick={(event) => event.stopPropagation()}
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>
          ) : null}
          </div>
        )}

        {error ? (
          <p className="text-sm leading-6 text-danger break-words" role="alert">
            {error}
          </p>
        ) : null}

        {showConsentAction ? (
          <p className="text-xs leading-5 text-secondary-text break-words">
            {policy.enforcementActive
              ? lang({
                  ko: "동의하지 않으면 회원 기능은 제한됩니다. 로그아웃 후 공개 콘텐츠는 계속 볼 수 있으며, 계정 관리에서 회원탈퇴를 요청할 수 있습니다.",
                  en: "Member features require consent. You may sign out to keep browsing public content or request deletion from Account management.",
                })
              : lang({
                  ko: "시행일 전에는 나중에 동의할 수 있습니다. 시행일부터 동의 전까지 회원 기능이 제한됩니다.",
                  en: "You may decide later before the effective date. Member features will be limited after that date until consent.",
                })}
          </p>
        ) : null}

        <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" className="min-h-11" onClick={handleLogout}>
            {lang({ ko: "로그아웃하고 계속 보기", en: "Sign out and keep browsing" })}
          </Button>
          <Button asChild variant="outline" className="min-h-11">
            <Link href="/account">{lang({ ko: "계정 관리", en: "Account management" })}</Link>
          </Button>
          {!policy.enforcementActive ? (
            <Button variant="outline" className="min-h-11" onClick={() => setOpen(false)}>
              {lang({ ko: "나중에", en: "Later" })}
            </Button>
          ) : null}
          {showConsentAction ? (
            <Button
              className="min-h-11"
              loading={loading}
              loadingText={lang({ ko: "저장 중", en: "Saving" })}
              onClick={submit}
            >
              {lang({ ko: "동의하고 계속", en: "Agree and continue" })}
            </Button>
          ) : (
            <Button variant="outline" className="min-h-11" onClick={() => setOpen(false)}>
              {lang({ ko: "확인", en: "Got it" })}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
