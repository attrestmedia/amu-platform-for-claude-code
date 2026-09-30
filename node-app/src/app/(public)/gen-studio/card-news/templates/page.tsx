"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lang, lang } from "components/module/i18n";
import { ServiceManagementAddon, SiteFooter, TopBar } from "components/module/layout";
import { GenStudioLogo } from "components/template/gen-studio/modules/GenStudioLogo";
import { CardNewsTemplateAdminPanel } from "components/template/card-news";
import { useAuthStore } from "store/auth";
import { useAuthCheck, useUserData } from "hooks/auth";
import { Preloader } from "@amu-labs/ui";

export default function CardNewsTemplateAdminPage() {
  const router = useRouter();
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const isLoggedIn = useAuthStore((state) => state.isLogged());
  const { userData, isAdministrator, isLoading } = useUserData();
  useAuthCheck();

  useEffect(() => {
    if (!hasHydrated || isLoading) return;
    if (!isLoggedIn) {
      router.replace(`/login?next=${encodeURIComponent("/gen-studio/card-news/templates")}`);
      return;
    }
    if (!isAdministrator) router.replace("/gen-studio/card-news");
  }, [hasHydrated, isAdministrator, isLoading, isLoggedIn, router]);

  if (!hasHydrated || isLoading || !isLoggedIn || !isAdministrator) {
    return <Preloader variant="spin" size="lg" container fullScreen />;
  }

  return (
    <div className="flex min-h-[100dvh] w-full flex-col bg-background text-primary-text">
      <TopBar
        isLoggedIn={isLoggedIn}
        userName={userData?.userInfo?.name}
        canShowAdminButton
        onAdminClick={() => router.push("/admin")}
        onLoginSuccess={() => router.refresh()}
        logoutRedirectPage="/gen-studio/card-news"
        serviceAddon={<ServiceManagementAddon variant="genstudio" />}
        serviceName="gen-studio"
      >
        <Link href="/gen-studio" aria-label={lang({ ko: "Gen Studio 홈으로 이동", en: "Go to Gen Studio home" })}>
          <GenStudioLogo />
        </Link>
      </TopBar>

      <main className="flex-1">
        <div className="border-b border-border bg-surface/60 px-4 py-3 sm:px-6">
          <div className="mx-auto flex w-full max-w-[1440px] items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-text">Gen Studio · CardNews</p>
              <p className="mt-1 truncate text-sm text-secondary-text">
                <Lang text={{ ko: "운영자 템플릿 관리", en: "Operator template management" }} />
              </p>
            </div>
            <Link href="/gen-studio/card-news" className="min-h-11 rounded-md px-3 py-2 text-sm text-secondary-text underline-offset-4 hover:text-primary-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Lang text={{ ko: "카드뉴스 편집기로 돌아가기", en: "Back to card news editor" }} />
            </Link>
          </div>
        </div>
        <div className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6">
          <CardNewsTemplateAdminPanel />
        </div>
      </main>

      <SiteFooter className="mt-4" layout="wide" />
    </div>
  );
}
