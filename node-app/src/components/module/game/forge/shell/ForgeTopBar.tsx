"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Gamepad2 } from "lucide-react";
import { Lang } from "components/module/i18n";
import { useUserData } from "hooks/auth";
import { useAuthStore } from "store/auth";
import { TopBar } from "components/module/layout/TopBar";
import { WorkspaceSidebarToggle } from "components/module/layout/WorkspaceSidebarToggle";
import { FORGE_GLOSSARY } from "../model/forgeGlossary";

type ForgeTopBarProps = {
  onToggleSidebar: () => void;
  sidebarExpanded: boolean;
  sidebarControlsId?: string;
};

export function ForgeTopBar({ onToggleSidebar, sidebarExpanded, sidebarControlsId }: ForgeTopBarProps) {
  const router = useRouter();
  const isLoggedIn = useAuthStore((state) => state.isLogged());
  const { userData, isAdministrator } = useUserData();

  return (
    <TopBar
      variant="workspace"
      isLoggedIn={isLoggedIn}
      userName={userData?.userInfo?.name}
      canShowAdminButton={Boolean(isAdministrator)}
      onAdminClick={() => router.push("/admin")}
      leading={
        <WorkspaceSidebarToggle
          expanded={sidebarExpanded}
          controlsId={sidebarControlsId}
          onToggle={onToggleSidebar}
        />
      }
    >
      <Link
        href="/assets-studio"
        className="flex min-h-11 items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Gamepad2 className="h-4 w-4" aria-hidden />
        </span>
        <span className="text-[15px] font-semibold"><Lang text={FORGE_GLOSSARY.service} /></span>
      </Link>
    </TopBar>
  );
}
