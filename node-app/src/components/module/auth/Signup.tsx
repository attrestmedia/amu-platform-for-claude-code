"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { Button, Checkbox, Input } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";

const SOCIAL_PROVIDERS = [
  { id: "google", label: "Google", className: "bg-white text-gray-700 ring-gray-300 hover:bg-gray-50" },
  { id: "naver", label: "Naver", className: "bg-[#03C75A] text-white hover:bg-[#02B350]" },
  { id: "kakao", label: "Kakao", className: "bg-[#FEE500] text-black hover:bg-[#FDD835]" },
] as const;

type SignupOfferRelease = {
  releaseId: string;
  policyId: "terms" | "privacy";
  version: string;
  effectiveAt: string;
  kind: "active" | "announced";
};

type SignupPolicyOffer = {
  mode: "legacy" | "manifest";
  manifestRevision: string | null;
  releaseIds: string[];
  releases: SignupOfferRelease[];
};

function isSignupPolicyOfferResponse(value: unknown): value is { ok: true; offer: SignupPolicyOffer } {
  if (!value || typeof value !== "object") return false;
  const response = value as { ok?: unknown; offer?: unknown };
  if (response.ok !== true || !response.offer || typeof response.offer !== "object") return false;
  const offer = response.offer as Record<string, unknown>;
  return (offer.mode === "legacy" || offer.mode === "manifest") &&
    (typeof offer.manifestRevision === "string" || offer.manifestRevision === null) &&
    Array.isArray(offer.releaseIds) && offer.releaseIds.every((releaseId) => typeof releaseId === "string") &&
    Array.isArray(offer.releases) && offer.releases.every((release) => {
      if (!release || typeof release !== "object") return false;
      const item = release as Record<string, unknown>;
      return typeof item.releaseId === "string" &&
        (item.policyId === "terms" || item.policyId === "privacy") &&
        typeof item.version === "string" &&
        typeof item.effectiveAt === "string" &&
        (item.kind === "active" || item.kind === "announced");
    });
}

export default function Signup({
  redirect = "/",
  intentSource = "platform",
  preferredProvider,
  returnTo = "/",
  cleanupIntents = false,
}: {
  redirect?: string;
  intentSource?: "platform" | "magazine";
  preferredProvider?: string;
  returnTo?: string;
  cleanupIntents?: boolean;
}) {
  const [form, setForm] = useState({ name: "", email: "", password: "", terms: false, privacy: false });
  const [loading, setLoading] = useState(cleanupIntents);
  const [error, setError] = useState("");
  const [policyOffer, setPolicyOffer] = useState<SignupPolicyOffer | null>(null);
  const [policyOfferStatus, setPolicyOfferStatus] = useState<"none" | "loading" | "ready" | "error">("none");
  const [policyOfferError, setPolicyOfferError] = useState("");
  const [cleanupAttempt, setCleanupAttempt] = useState(0);
  const [cleanupFailed, setCleanupFailed] = useState(false);
  const policyAccepted = form.terms && form.privacy;

  const fetchPolicyOffer = useCallback(async () => {
    const response = await fetch("/api/auth/signup-intent", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !isSignupPolicyOfferResponse(data)) throw new Error("offer unavailable");
    return data.offer;
  }, []);

  const loadPolicyOffer = async () => {
    try {
      const offer = await fetchPolicyOffer();
      setPolicyOffer(offer);
      setPolicyOfferError("");
      setPolicyOfferStatus("ready");
      return true;
    } catch {
      setPolicyOffer(null);
      setPolicyOfferStatus("error");
      setPolicyOfferError(lang({
        ko: "정책 안내를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        en: "Could not load the policy notice. Please try again shortly.",
      }));
      return false;
    }
  };

  useEffect(() => {
    let mounted = true;
    void fetchPolicyOffer().then((offer) => {
      if (!mounted) return;
      setPolicyOffer(offer);
      setPolicyOfferError("");
      setPolicyOfferStatus("ready");
    }).catch(() => {
      if (!mounted) return;
      setPolicyOffer(null);
      setPolicyOfferStatus("error");
      setPolicyOfferError(lang({
        ko: "정책 안내를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        en: "Could not load the policy notice. Please try again shortly.",
      }));
    });
    return () => { mounted = false; };
  }, [fetchPolicyOffer]);

  useEffect(() => {
    if (!cleanupIntents) return;
    void fetch("/api/auth/signup-intent", { method: "DELETE", credentials: "include" })
      .then((response) => {
        if (!response.ok) throw new Error("intent cleanup failed");
        setLoading(false);
      })
      .catch(() => {
        setError(lang({ ko: "이전 소셜 로그인 상태를 안전하게 정리하지 못했습니다.", en: "Could not safely clear the previous social sign-in state." }));
        setCleanupFailed(true);
      });
  }, [cleanupAttempt, cleanupIntents]);

  if (cleanupIntents && cleanupFailed) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive" role="alert">
        <p>{error}</p>
        <Button
          type="button"
          variant="outline"
          className="mt-3 min-h-11"
          onClick={() => {
            setCleanupFailed(false);
            setError("");
            setCleanupAttempt((value) => value + 1);
          }}
        >
          <Lang text={{ ko: "다시 시도", en: "Try again" }} />
        </Button>
      </div>
    );
  }

  const beginSocialSignup = async (provider: string) => {
    setError("");
    if (policyOfferStatus !== "ready" || !policyOffer) {
      setError(lang({ ko: "정책 안내를 확인한 뒤 다시 시도해 주세요.", en: "Please wait for the policy notice to load." }));
      return;
    }
    if (!policyAccepted) {
      setError(lang({ ko: "이용약관과 개인정보처리방침에 모두 동의해 주세요.", en: "Please accept both required policies." }));
      return;
    }
    setLoading(true);
    const response = await fetch("/api/auth/signup-intent", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        terms: true,
        privacy: true,
        source: intentSource,
        provider,
        returnTo,
        ...(policyOffer.mode === "manifest"
          ? { releaseIds: policyOffer.releaseIds, manifestRevision: policyOffer.manifestRevision }
          : {}),
      }),
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { error?: string; errorCode?: string } | null;
      if (response.status === 409 && data?.errorCode === "POLICY_RELEASE_MISMATCH") {
        setForm((prev) => ({ ...prev, terms: false, privacy: false }));
        setError(lang({
          ko: "정책 안내가 갱신되었습니다. 내용을 다시 확인하고 동의해 주세요.",
          en: "The policy notice changed. Please review it and confirm your consent again.",
        }));
        setPolicyOfferStatus("loading");
        await loadPolicyOffer();
        setLoading(false);
        return;
      }
      setError(data?.error || lang({ ko: "가입 동의를 확인하지 못했습니다.", en: "Could not verify consent." }));
      setLoading(false);
      return;
    }
    const callbackUrl = `/auth/signup-return?next=${encodeURIComponent(redirect)}`;
    await signIn(provider, { callbackUrl });
  };

  const submitEmailSignup = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (policyOfferStatus !== "ready" || !policyOffer) {
      setError(lang({ ko: "정책 안내를 확인한 뒤 다시 시도해 주세요.", en: "Please wait for the policy notice to load." }));
      return;
    }
    if (!policyAccepted) {
      setError(lang({ ko: "이용약관과 개인정보처리방침에 모두 동의해 주세요.", en: "Please accept both required policies." }));
      return;
    }
    setLoading(true);
    const response = await fetch("/api/auth/register", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...form,
        ...(policyOffer.mode === "manifest"
          ? { releaseIds: policyOffer.releaseIds, manifestRevision: policyOffer.manifestRevision }
          : {}),
      }),
    });
    const data = (await response.json().catch(() => null)) as { error?: string; errorCode?: string } | null;
    if (!response.ok) {
      if (response.status === 409 && data?.errorCode === "POLICY_RELEASE_MISMATCH") {
        setForm((prev) => ({ ...prev, terms: false, privacy: false }));
        setError(lang({
          ko: "정책 안내가 갱신되었습니다. 내용을 다시 확인하고 동의해 주세요.",
          en: "The policy notice changed. Please review it and confirm your consent again.",
        }));
        setPolicyOfferStatus("loading");
        await loadPolicyOffer();
        setLoading(false);
        return;
      }
      setError(data?.error || lang({ ko: "회원가입을 완료하지 못했습니다.", en: "Could not complete signup." }));
      setLoading(false);
      return;
    }
    const login = await fetch("/api/auth/login", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: form.email, password: form.password }),
    });
    window.location.assign(login.ok ? redirect : `/login?signup=complete&next=${encodeURIComponent(redirect)}`);
  };

  return (
    <div className="space-y-5">
      <div className="space-y-3" aria-label={lang({ ko: "소셜 통합회원가입", en: "Social signup" })}>
        {[...SOCIAL_PROVIDERS]
          .sort((a, b) => Number(b.id === preferredProvider) - Number(a.id === preferredProvider))
          .map((provider) => (
          <Button
            key={provider.id}
            type="button"
            size="lg"
            className={`min-h-11 w-full font-medium ${provider.className}`}
            disabled={loading || policyOfferStatus !== "ready"}
            onClick={() => void beginSocialSignup(provider.id)}
          >
            <Lang text={{ ko: `${provider.label}로 가입`, en: `Sign up with ${provider.label}` }} />
          </Button>
          ))}
      </div>

      <div className="flex items-center gap-3 text-xs text-secondary-text" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        <Lang text={{ ko: "또는 이메일로 가입", en: "or sign up with email" }} />
        <span className="h-px flex-1 bg-border" />
      </div>

      <form className="space-y-3" onSubmit={submitEmailSignup}>
        <Input
          type="text"
          autoComplete="name"
          placeholder={lang({ ko: "이름(선택)", en: "Name (optional)" })}
          value={form.name}
          onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
        />
        <Input
          type="email"
          autoComplete="email"
          placeholder={lang({ ko: "이메일", en: "Email" })}
          value={form.email}
          required
          onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
        />
        <Input
          type="password"
          autoComplete="new-password"
          placeholder={lang({ ko: "비밀번호(영문·숫자 포함 10자 이상)", en: "Password (10+ letters and numbers)" })}
          value={form.password}
          minLength={10}
          required
          allowPasswordReveal
          onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
        />

        <fieldset className="space-y-2 rounded-xl border border-border p-3">
          <legend className="px-1 text-sm font-semibold">
            <Lang text={{ ko: "필수 동의", en: "Required consent" }} />
          </legend>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
            <Checkbox
              checked={form.terms}
              onCheckedChange={(checked) => setForm((prev) => ({ ...prev, terms: checked === true }))}
            />
            <span>
              <Link className="text-primary underline" href="https://allmyuniverse.com/terms-conditions/" target="_blank" rel="noopener noreferrer">
                <Lang text={{ ko: "이용약관", en: "Terms of Service" }} />
              </Link>
              <Lang text={{ ko: "에 동의합니다.", en: " accepted." }} />
              {policyOffer?.mode === "manifest" ? policyOffer.releases
                .filter((release) => release.policyId === "terms")
                .map((release) => (
                  <span key={release.releaseId} className="mt-1 block text-xs text-secondary-text">
                    <Lang text={{
                      ko: `${release.kind === "announced" ? "개정 예정 · " : "시행 중 · "}v${release.version} · 시행일 ${release.effectiveAt.slice(0, 10)}`,
                      en: `${release.kind === "announced" ? "Upcoming revision · " : "Current · "}v${release.version} · Effective ${release.effectiveAt.slice(0, 10)}`,
                    }} />
                  </span>
                )) : null}
            </span>
          </label>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
            <Checkbox
              checked={form.privacy}
              onCheckedChange={(checked) => setForm((prev) => ({ ...prev, privacy: checked === true }))}
            />
            <span>
              <Link className="text-primary underline" href="https://allmyuniverse.com/privacy-policy/" target="_blank" rel="noopener noreferrer">
                <Lang text={{ ko: "개인정보처리방침", en: "Privacy Policy" }} />
              </Link>
              <Lang text={{ ko: "에 동의합니다.", en: " accepted." }} />
              {policyOffer?.mode === "manifest" ? policyOffer.releases
                .filter((release) => release.policyId === "privacy")
                .map((release) => (
                  <span key={release.releaseId} className="mt-1 block text-xs text-secondary-text">
                    <Lang text={{
                      ko: `${release.kind === "announced" ? "개정 예정 · " : "시행 중 · "}v${release.version} · 시행일 ${release.effectiveAt.slice(0, 10)}`,
                      en: `${release.kind === "announced" ? "Upcoming revision · " : "Current · "}v${release.version} · Effective ${release.effectiveAt.slice(0, 10)}`,
                    }} />
                  </span>
                )) : null}
            </span>
          </label>
          {policyOfferStatus === "loading" || policyOfferStatus === "none" ? (
            <p className="text-xs text-secondary-text" role="status" aria-live="polite">
              <Lang text={{ ko: "정책 안내를 확인하고 있습니다.", en: "Loading policy notices." }} />
            </p>
          ) : null}
          {policyOfferStatus === "error" ? (
            <div className="space-y-2">
              <p className="text-xs text-destructive" role="alert">{policyOfferError}</p>
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={() => {
                  setPolicyOfferStatus("loading");
                  void loadPolicyOffer();
                }}
              >
                <Lang text={{ ko: "다시 확인", en: "Retry" }} />
              </Button>
            </div>
          ) : null}
        </fieldset>

        {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
        <Button type="submit" size="lg" className="min-h-11 w-full" loading={loading} disabled={loading || policyOfferStatus !== "ready"}>
          <Lang text={{ ko: "통합회원가입", en: "Create integrated account" }} />
        </Button>
      </form>
      <p className="text-center text-sm text-secondary-text">
        <Lang text={{ ko: "이미 회원이신가요?", en: "Already have an account?" }} />{" "}
        <Link href={`/login?next=${encodeURIComponent(redirect)}`} className="text-primary underline">
          <Lang text={{ ko: "로그인", en: "Log in" }} />
        </Link>
      </p>
    </div>
  );
}
