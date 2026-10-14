"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Preloader } from "@amu-labs/ui";
import { AdminWorkspaceShell } from "components/module/admin/shell";
import { useAuthCheck, useUserData } from "hooks/auth";
import { useAuthStore } from "store/auth";

function AuthenticatedAdminLayout({ children, pathname }: { children: ReactNode; pathname: string }) {
  const router = useRouter();
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const isLoggedIn = useAuthStore((state) => state.isLogged());
  const { userData, isLoading: isUserLoading } = useUserData();

  useAuthCheck();

  useEffect(
    function redirectUnauthenticatedAdminUser() {
      if (!hasHydrated || isLoggedIn) return;
      router.replace(`/login?next=${encodeURIComponent(pathname || "/admin")}`);
    },
    [hasHydrated, isLoggedIn, pathname, router],
  );

  if (!hasHydrated || !isLoggedIn || isUserLoading || !userData) {
    return <Preloader variant="spin" size="lg" container fullScreen />;
  }

  return <AdminWorkspaceShell>{children}</AdminWorkspaceShell>;
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "";

  if (pathname.startsWith("/admin/stagemap")) {
    // StageMap is a canvas editor outside the §11.6 workspace shell and retains its existing auth flow.
    return children;
  }

  return <AuthenticatedAdminLayout pathname={pathname}>{children}</AuthenticatedAdminLayout>;
}
