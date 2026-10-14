"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Preloader } from "@amu-labs/ui";
import { useAuthCheck, useUserData } from "hooks/auth";
import { useAuthStore } from "store/auth";
import { MarketingOopsWorkspaceShell } from "./MarketingOopsWorkspaceShell";

function AuthenticatedMarketingOopsWorkspaceFrame({ children, pathname }: { children: ReactNode; pathname: string }) {
  const router = useRouter();
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const isLoggedIn = useAuthStore((state) => state.isLogged());
  const { userData, isLoading: isUserLoading } = useUserData();

  useAuthCheck();

  useEffect(
    function redirectUnauthenticatedMarketingWorkspaceUser() {
      if (!hasHydrated || isLoggedIn) return;
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    },
    [hasHydrated, isLoggedIn, pathname, router],
  );

  if (!hasHydrated || !isLoggedIn || isUserLoading || !userData) {
    return <Preloader variant="spin" size="lg" container fullScreen />;
  }

  return <MarketingOopsWorkspaceShell>{children}</MarketingOopsWorkspaceShell>;
}

export function MarketingOopsWorkspaceFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "";

  if (pathname === "/marketing-oops") {
    // Marketing Oops landing pages are consumer-facing and stay outside the §11.6 workspace shell.
    return children;
  }

  return (
    <AuthenticatedMarketingOopsWorkspaceFrame pathname={pathname || "/marketing-oops/workspace"}>
      {children}
    </AuthenticatedMarketingOopsWorkspaceFrame>
  );
}
