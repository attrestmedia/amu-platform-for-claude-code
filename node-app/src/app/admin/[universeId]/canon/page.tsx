"use client";

import { useEffect } from "react";
import { Preloader } from "@amu-labs/ui";
import { useRouter } from "next/navigation";
import { useAuthCheck, useUserData } from "hooks/auth";
import { useAuthStore } from "store/auth";
import { CanonAdminConsole } from "components/module/admin/canon";

export default function UniverseCanonAdminPage({ params }: { params: { universeId: string } }) {
  const router = useRouter();
  const { userData, isLoading: isUserLoading } = useUserData();
  const { hasHydrated } = useAuthStore();
  const isLoggedIn = useAuthStore((state) => state.isLogged());
  useAuthCheck();

  const universeId = decodeURIComponent(params.universeId || "");
  const isAdministrator = userData?.roles?.includes("administrator") === true;

  useEffect(() => {
    if (!hasHydrated || isUserLoading) return;
    if (!isLoggedIn) {
      router.replace(`/login?next=${encodeURIComponent(`/admin/${universeId}/canon`)}`);
      return;
    }
    if (userData && !isAdministrator) router.replace("/");
  }, [hasHydrated, isAdministrator, isLoggedIn, isUserLoading, router, universeId, userData]);

  if (!hasHydrated || isUserLoading || !isLoggedIn || !isAdministrator) {
    return <Preloader variant="spin" size="lg" container fullScreen />;
  }

  return <CanonAdminConsole universeId={universeId} />;
}
