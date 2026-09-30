"use client";

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "store/auth";
import { useUserData } from "hooks/auth";
import { TopBar, SiteFooter } from "components/module/layout";
import { MiniAppDefaultLogo } from "components/module/mini-apps";
import { lang } from "components/module/i18n";
import { resolveMiniAppShellConfig, type MiniAppShellConfig } from "src/libs/apps/layout";
import { resolveServiceKeyFromPathname } from "consts/system/serviceAvailability";
import { ServiceAccessGate } from "components/module/service";

type MiniAppLayoutClientProps = {
  children: ReactNode;
  shellConfig?: MiniAppShellConfig | null;
};

export default function MiniAppLayoutClient({ children, shellConfig }: MiniAppLayoutClientProps) {
  const pathname = usePathname();
  const router = useRouter();

  const isLoggedIn = useAuthStore((s) => s.isLogged());
  const { userData, isAdministrator } = useUserData();

  const shell = useMemo(() => shellConfig || resolveMiniAppShellConfig(pathname || ""), [pathname, shellConfig]);

  const content = shell.showShell ? (
    <>
      <TopBar
        isLoggedIn={isLoggedIn}
        userName={userData?.userInfo?.name}
        canShowAdminButton={Boolean(isAdministrator)}
        onAdminClick={() => router.push("/admin")}
        onLoginSuccess={() => router.push(shell.redirectPath || pathname || "/apps")}
        logoutRedirectPage={shell.redirectPath || pathname || "/apps"}
      >
        <div className="flex items-center gap-3 sm:gap-4">
          <Link
            href="/"
            aria-label={lang({ ko: "홈으로 이동", en: "Go home" })}
            className="inline-flex rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <MiniAppDefaultLogo />
          </Link>
        </div>
      </TopBar>

      {children}

      {shell.showFooter !== false && <SiteFooter className="mt-4" layout="wide" />}
    </>
  ) : (
    <>{children}</>
  );

  const serviceKey = resolveServiceKeyFromPathname(pathname || "");
  if (serviceKey) {
    return <ServiceAccessGate serviceKey={serviceKey}>{content}</ServiceAccessGate>;
  }

  return content;
}
