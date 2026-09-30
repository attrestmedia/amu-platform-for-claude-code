"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { Button, Checkbox, Input } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";

const SOCIAL_PROVIDERS = [
  { id: "google", label: "Google", className: "bg-white text-gray-700 ring-gray-300 hover:bg-gray-50" },
  { id: "naver", label: "Naver", className: "bg-[#03C75A] text-white hover:bg-[#02B350]" },
  { id: "kakao", label: "Kakao", className: "bg-[#FEE500] text-black hover:bg-[#FDD835]" },
] as const;

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
  const [cleanupAttempt, setCleanupAttempt] = useState(0);
  const [cleanupFailed, setCleanupFailed] = useState(false);
  const policyAccepted = form.terms && form.privacy;

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
    if (!policyAccepted) {
      setError(lang({ ko: "이용약관과 개인정보처리방침에 모두 동의해 주세요.", en: "Please accept both required policies." }));
      return;
    }
    setLoading(true);
    const response = await fetch("/api/auth/signup-intent", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ terms: true, privacy: true, source: intentSource, provider, returnTo }),
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
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
    if (!policyAccepted) {
      setError(lang({ ko: "이용약관과 개인정보처리방침에 모두 동의해 주세요.", en: "Please accept both required policies." }));
      return;
    }
    setLoading(true);
    const response = await fetch("/api/auth/register", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
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
            disabled={loading}
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
            </span>
          </label>
        </fieldset>

        {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
        <Button type="submit" size="lg" className="min-h-11 w-full" loading={loading} disabled={loading}>
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
