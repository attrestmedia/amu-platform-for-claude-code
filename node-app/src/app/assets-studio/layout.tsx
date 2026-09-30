"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Preloader } from "@amu-labs/ui";
import { PlayForgeShell } from "components/module/game/forge/shell/PlayForgeShell";
import { ServiceThemeScope } from "components/module/theme/ServiceThemeScope";
import { useAuthCheck, useUserData } from "hooks/auth";
import { useAuthStore } from "store/auth";

export default function ForgeLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const isLoggedIn = useAuthStore((state) => state.isLogged());
  const { userData, isLoading: isUserLoading } = useUserData();

  useAuthCheck();

  useEffect(() => {
    if (!hasHydrated || isLoggedIn) return;
    router.replace(`/login?next=${encodeURIComponent(pathname || "/assets-studio")}`);
  }, [hasHydrated, isLoggedIn, router, pathname]);

  if (!hasHydrated || !isLoggedIn || isUserLoading || !userData) {
    return <Preloader variant="spin" size="lg" container fullScreen />;
  }

  return (
    <ServiceThemeScope service="play-forge">
      <PlayForgeShell>{children}</PlayForgeShell>
    </ServiceThemeScope>
  );
}
