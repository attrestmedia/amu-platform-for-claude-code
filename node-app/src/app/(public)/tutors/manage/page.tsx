"use client";

import { useEffect } from "react";
import Link from "next/link";
import { TutorsHome } from "components/template/tutors";
import { TopBar } from "components/module/layout";
import { useRouter } from "next/navigation";
import { useAuthStore } from "store/auth";
import { useUserData } from "hooks/auth";
import { ServiceManagementAddon } from "components/module/layout";
import { TutorsLogo } from "@amu-labs/ui/icons/brand/tutors";
import { Preloader } from "@amu-labs/ui";

export default function TutorsManagePage() {
  const router = useRouter();
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const isLoggedIn = useAuthStore((s) => s.isLogged());
  const { userData, isAdministrator } = useUserData();
  const redirectPage = "/tutors/manage";

  useEffect(() => {
    if (!hasHydrated) return;
    if (!isLoggedIn) {
      router.replace(`/login?next=${encodeURIComponent("/tutors/manage")}`);
    }
  }, [hasHydrated, isLoggedIn, router]);

  if (!hasHydrated || !isLoggedIn) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background">
        <Preloader variant="spin" size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-background text-primary-text">
      <TopBar
        isLoggedIn={isLoggedIn}
        userName={userData?.userInfo?.name}
        canShowAdminButton={Boolean(isAdministrator)}
        onAdminClick={() => router.push("/admin")}
        onLoginSuccess={() => router.push(redirectPage)}
        logoutRedirectPage={redirectPage}
        serviceAddon={<ServiceManagementAddon variant="tutors" />}
      >
        <Link href="/tutors" className="flex gap-1 items-center">
          <TutorsLogo className="w-26 h-5 mt-1" />
        </Link>
      </TopBar>

      <main>
        <TutorsHome />
      </main>
    </div>
  );
}