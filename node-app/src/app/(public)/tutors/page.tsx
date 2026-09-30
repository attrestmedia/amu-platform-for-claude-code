"use client";

import Link from "next/link";
import { TopBar } from "components/module/layout";
import { useRouter } from "next/navigation";
import { useAuthStore } from "store/auth";
import { useUserData } from "hooks/auth";
import { ServiceManagementAddon } from "components/module/layout";
import { TutorsLogo } from "@amu-labs/ui/icons/brand/tutors";
import TutorsLandingHero from "components/template/tutors/modules/TutorsLandingHero";

export default function TutorsPage() {
  const router = useRouter();
  const isLoggedIn = useAuthStore((s) => s.isLogged());
  const { userData, isAdministrator } = useUserData();
  const redirectPage = "/tutors";

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
        <TutorsLandingHero isLoggedIn={isLoggedIn} />
      </main>
    </div>
  );
}
