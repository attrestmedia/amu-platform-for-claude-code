"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";
import { useAuthStore } from "store/auth";
import { Preloader } from "@amu-labs/ui";
import { CoinChargeWidget } from "components/module/commerce";
import { lang } from "components/module/i18n";
import { resolveSafeReturnTo } from "utils/payment";
import { trackGaEvent } from "utils/analytics/ga4";

export default function PaymentPage() {
  const router = useRouter();
  const isLoggedIn = useAuthStore((s) => s.isLogged());
  const uid = useAuthStore((s) => s.user?.id || "");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rechargeStartTrackedRef = useRef(false);

  // /payment에 returnTo가 없으면 referrer(동일 origin)에서 추론해서 세팅
  const autoReturnTo = useMemo(() => {
    const existing = searchParams.get("returnTo");
    if (existing) {
      if (typeof window === "undefined") return existing;
      return resolveSafeReturnTo(existing, { fallback: "/", origin: window.location.origin });
    }
    if (typeof window === "undefined") return null;

    const origin = window.location.origin;
    let candidate = "";
    const ref = document.referrer;
    if (ref) {
      try {
        const u = new URL(ref);
        if (u.origin === origin) candidate = `${u.pathname}${u.search}${u.hash}`;
      } catch {
        // ignore
      }
    }
    return resolveSafeReturnTo(candidate, {
      fallback: "/",
      origin,
      // /payment로 돌아가면 의미가 없고 루프 가능성이 있어 차단
      blockPrefixes: ["/payment", "/payment/success", "/payment/fail"],
    });
  }, [searchParams]);

  const nextUrl = useMemo(() => {
    const sp = new URLSearchParams(searchParams.toString());
    if (!sp.get("returnTo") && autoReturnTo) sp.set("returnTo", autoReturnTo);
    const qs = sp.toString();
    return `${pathname}${qs ? `?${qs}` : ""}`;
  }, [pathname, searchParams, autoReturnTo]);

  // 로그인 전/후 모두 URL에 returnTo를 실제로 주입해서 TossPaymentDialog가 그대로 읽게 함
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (searchParams.get("returnTo")) return;
    if (!autoReturnTo) return;

    const sp = new URLSearchParams(searchParams.toString());
    sp.set("returnTo", autoReturnTo);
    router.replace(`${pathname}?${sp.toString()}`);
  }, [autoReturnTo, pathname, router, searchParams]);

  // 비로그인 시 로그인 페이지로 리다이렉트
  useEffect(() => {
    if (!isLoggedIn) {
      router.replace(`/login?next=${encodeURIComponent(nextUrl)}`);
    }
  }, [isLoggedIn, nextUrl, router]);

  useEffect(() => {
    if (!isLoggedIn || !uid || rechargeStartTrackedRef.current) return;
    rechargeStartTrackedRef.current = true;
    trackGaEvent("coin_recharge_start", { scope: searchParams.get("scope") || "user" });
  }, [isLoggedIn, searchParams, uid]);

  if (!isLoggedIn || !uid) {
    return (
      <Preloader
        variant="spin"
        size="lg"
        container
        fullScreen
        text={lang({
          ko: "결제를 진행하려면 로그인이 필요합니다. 로그인 화면으로 이동 중...",
          en: "You must log in to proceed with payment. Going to the login screen...",
        })}
      />
    );
  }

  return (
    <div className="p-4 flex justify-center">
      <CoinChargeWidget uid={uid} />
    </div>
  );
}
