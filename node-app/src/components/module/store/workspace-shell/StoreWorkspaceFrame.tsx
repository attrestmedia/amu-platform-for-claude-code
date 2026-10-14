"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { usePathname, useRouter, useParams } from "next/navigation";
import { Preloader } from "@amu-labs/ui";
import { useAuthCheck, useUserData } from "hooks/auth";
import { useAuthStore } from "store/auth";
import { StoreWorkspaceShell } from "./StoreWorkspaceShell";

export function StoreWorkspaceFrame({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() || "";
  const params = useParams<{ universeId: string }>();
  const universeId = params?.universeId ?? "";
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const isLoggedIn = useAuthStore((state) => state.isLogged());
  const { userData, isLoading: isUserLoading } = useUserData();

  useAuthCheck();

  useEffect(
    function redirectUnauthenticatedStoreManager() {
      if (!hasHydrated || isLoggedIn) return;
      router.replace(`/login?next=${encodeURIComponent(pathname || `/store/${universeId}/manage`)}`);
    },
    [hasHydrated, isLoggedIn, pathname, router, universeId],
  );

  if (!hasHydrated || !isLoggedIn || isUserLoading || !userData) {
    return <Preloader variant="spin" size="lg" container fullScreen />;
  }

  return <StoreWorkspaceShell>{children}</StoreWorkspaceShell>;
}
