"use client";

import React, { useMemo, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { AuthSplitLayout } from "components/template/auth";
import { Login } from "components/module/auth";
import { Lang } from "components/module/i18n";
import { useAuthStore } from "store/auth";
import { resolveMagazineReturnTo } from "utils/auth/magazineReturnTo";
import { resolveSafeReturnTo } from "utils/payment";

const MAGAZINE_AUTH_PROVIDERS = ["google", "kakao", "naver"] as const;

function isMagazineAuthProvider(value: unknown): value is (typeof MAGAZINE_AUTH_PROVIDERS)[number] {
  return typeof value === "string" && (MAGAZINE_AUTH_PROVIDERS as readonly string[]).includes(value);
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isLoggedIn = useAuthStore((s) => s.isLogged());
  const signupCompleted = searchParams.get("signup") === "complete";
  const withdrawalAccepted = searchParams.get("withdrawal") === "accepted";
  const authError = searchParams.get("error");
  const cleanupIntents = searchParams.get("cleanup") === "1";
  const cleanupKey = cleanupIntents ? searchParams.toString() : "";
  const [cleanedKey, setCleanedKey] = useState("");
  const [cleanupAttempt, setCleanupAttempt] = useState(0);
  const [failedCleanupKey, setFailedCleanupKey] = useState("");
  const cleanupFailureKey = `${cleanupKey}:${cleanupAttempt}`;
  const intentsReady = !cleanupIntents || cleanedKey === cleanupKey;
  const cleanupFailed = cleanupIntents && failedCleanupKey === cleanupFailureKey;

  const magazineReturnTo = useMemo(() => {
    if (searchParams.get("source") !== "magazine") return "";
    return resolveMagazineReturnTo(searchParams.get("returnTo"));
  }, [searchParams]);
  const magazineCallback = magazineReturnTo
    ? `/auth/magazine-return?returnTo=${encodeURIComponent(magazineReturnTo)}`
    : "";
  const magazineProvider = isMagazineAuthProvider(searchParams.get("provider"))
    ? (searchParams.get("provider") as (typeof MAGAZINE_AUTH_PROVIDERS)[number])
    : "";
  const magazineRetry =
    magazineReturnTo && magazineProvider
      ? `/auth/magazine-login?provider=${encodeURIComponent(magazineProvider)}&returnTo=${encodeURIComponent(magazineReturnTo)}`
      : "";
  const magazineSignup =
    magazineReturnTo && magazineProvider
      ? `/signup?source=magazine&provider=${encodeURIComponent(magazineProvider)}&returnTo=${encodeURIComponent(magazineReturnTo)}`
      : "";
  const accountBlocked = authError === "ACCOUNT_DELETION_PENDING" || authError === "PROVIDER_LINK_AMBIGUOUS";
  const emailLinkBlocked = authError === "PROVIDER_EMAIL_UNVERIFIED" || authError === "PROVIDER_EMAIL_REQUIRED";

  // 오픈 리다이렉트 방지와 canonical 경로 정규화는 공유 구현을 사용한다.
  const safeNext = useMemo(() => {
    return resolveSafeReturnTo(magazineCallback || searchParams.get("next"), { fallback: "/" });
  }, [magazineCallback, searchParams]);

  useEffect(() => {
    if (isLoggedIn) router.replace(safeNext);
  }, [isLoggedIn, safeNext, router]);

  useEffect(() => {
    if (!cleanupIntents) return;
    let active = true;
    void fetch("/api/auth/signup-intent", { method: "DELETE", credentials: "include" })
      .then((response) => {
        if (!response.ok) throw new Error("intent cleanup failed");
        if (active) setCleanedKey(cleanupKey);
      })
      .catch(() => {
        if (active) setFailedCleanupKey(cleanupFailureKey);
      });
    return () => {
      active = false;
    };
  }, [cleanupAttempt, cleanupFailureKey, cleanupIntents, cleanupKey]);

  return (
    <AuthSplitLayout
      titleId="login-title"
      title={<>Play The Experience.</>}
      description={
        <>
          <Lang
            text={{
              ko: (
                <>
                  하나의 <strong>AMU ID</strong>로 모든 경험을 연결하세요.
                </>
              ),
              en: (
                <>
                  Connect every experience with one <strong>AMU ID</strong>.
                </>
              ),
            }}
          />
        </>
      }
      formLabel={
        <p className="text-center text-sm text-secondary-text">
          <Lang text={{ ko: "로그인 후 시작하세요.", en: "Sign in to get started" }} />
        </p>
      }
      footer={
        <p className="text-xs text-secondary-text">
          <Lang
            text={{
              ko: (
                <>
                  계정 이용 정책은
                  <br />
                  <a
                    href="https://allmyuniverse.com/terms-conditions"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    이용약관
                  </a>{" "}
                  및{" "}
                  <a
                    href="https://allmyuniverse.com/privacy-policy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    개인정보처리방침
                  </a>
                  에서
                  <br />
                  확인할 수 있습니다.
                </>
              ),
              en: (
                <>
                  Review the account policies in our{" "}
                  <a
                    href="https://allmyuniverse.com/terms-conditions"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    Terms
                  </a>{" "}
                  and{" "}
                  <a
                    href="https://allmyuniverse.com/privacy-policy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    Privacy Policy
                  </a>
                  .
                </>
              ),
            }}
          />
        </p>
      }
    >
      {intentsReady ? (
        <Login redirect={safeNext} />
      ) : cleanupFailed ? (
        <div
          className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
          role="alert"
        >
          <p>
            <Lang
              text={{
                ko: "이전 소셜 로그인 상태를 안전하게 정리하지 못했습니다.",
                en: "We could not safely clear the previous social sign-in state.",
              }}
            />
          </p>
          <button
            type="button"
            className="mt-3 min-h-11 font-semibold underline underline-offset-4"
            onClick={() => setCleanupAttempt((value) => value + 1)}
          >
            <Lang text={{ ko: "다시 시도", en: "Try again" }} />
          </button>
        </div>
      ) : (
        <p
          className="flex min-h-11 items-center justify-center gap-3 text-sm text-secondary-text"
          role="status"
          aria-live="polite"
        >
          <span
            className="h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary motion-reduce:animate-none"
            aria-hidden="true"
          />
          <Lang text={{ ko: "로그인 상태를 정리하고 있습니다.", en: "Preparing a safe sign-in retry." }} />
        </p>
      )}

      {signupCompleted ? (
        <p className="mt-4 rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm" role="status">
          <Lang
            text={{
              ko: "통합회원가입이 완료되었습니다. 새 계정으로 로그인해 주세요.",
              en: "Your integrated account is ready. Please sign in.",
            }}
          />
        </p>
      ) : null}
      {withdrawalAccepted ? (
        <p className="mt-4 rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm" role="status">
          <Lang
            text={{
              ko: "회원탈퇴가 접수되어 두 사이트의 계정 접근이 중지되었습니다.",
              en: "Withdrawal was accepted and account access to both sites has stopped.",
            }}
          />
        </p>
      ) : null}
      {authError ? (
        <div
          className="mt-4 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
          role="alert"
        >
          <Lang
            text={
              accountBlocked
                ? {
                    ko: "계정 상태 또는 소셜 연결 정보를 자동으로 확인할 수 없습니다. 신규 가입을 반복하지 말고 고객지원에 문의해 주세요.",
                    en: "We could not safely resolve the account status or social link. Do not create another account; please contact support.",
                  }
                : emailLinkBlocked
                  ? {
                      ko: "소셜 계정의 이메일을 기존 AMU 계정과 안전하게 연결할 수 없습니다. 아래 All My Universe 로그인을 이용해 주세요.",
                      en: "We could not safely link the social email to an existing AMU account. Please use All My Universe login below.",
                    }
                  : {
                      ko: "소셜 로그인을 완료하지 못했습니다. 다시 시도하거나 신규 회원가입을 진행해 주세요.",
                      en: "Social sign-in could not be completed. Try again or continue with signup.",
                    }
            }
          />
          {intentsReady && magazineRetry && !accountBlocked && !emailLinkBlocked ? (
            <div className="mt-3 flex flex-wrap gap-3">
              <Link href={magazineRetry} className="font-semibold underline underline-offset-4">
                <Lang text={{ ko: "소셜 로그인 다시 시도", en: "Retry social login" }} />
              </Link>
              <Link href={magazineSignup} className="font-semibold underline underline-offset-4">
                <Lang text={{ ko: "신규 회원가입", en: "Create an account" }} />
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}
    </AuthSplitLayout>
  );
}
