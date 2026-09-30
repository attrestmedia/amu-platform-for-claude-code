"use client";

import { use } from "react";
import { TopBar } from "components/module/layout";
import { TutorsChatClient } from "components/template/tutors";
import { useRouter } from "next/navigation";
import { useAuthStore } from "store/auth";
import { useUserData } from "hooks/auth";
import { Lang } from "components/module/i18n";
import { ServiceManagementAddon } from "components/module/layout";

export default function TutorsChatPage({ params }: { params: Promise<{ pid: string }> }) {
  const resolvedParams = use(params);
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
        <span className="text-base sm:text-lg">
          <Lang text={{ ko: "Tutors", en: "Tutors" }} />
        </span>
      </TopBar>

      <main>
        <TutorsChatClient pid={resolvedParams.pid} />
      </main>
    </div>
  );
}
