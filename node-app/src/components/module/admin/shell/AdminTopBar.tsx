"use client";

import Link from "next/link";
import { Shield } from "lucide-react";
import { Lang } from "components/module/i18n";
import { useUserData } from "hooks/auth";
import { useAuthStore } from "store/auth";
import { TopBar, WorkspaceSidebarToggle } from "components/module/layout";

type AdminTopBarProps = {
  onToggleSidebar: () => void;
  sidebarExpanded: boolean;
  sidebarControlsId?: string;
  sidebarToggleId: string;
};

export function AdminTopBar({ onToggleSidebar, sidebarExpanded, sidebarControlsId, sidebarToggleId }: AdminTopBarProps) {
  const isLoggedIn = useAuthStore((state) => state.isLogged());
  const { userData } = useUserData();

  return (
    <TopBar
      variant="workspace"
      isLoggedIn={isLoggedIn}
      userName={userData?.userInfo?.name}
      leading={
        <WorkspaceSidebarToggle
          id={sidebarToggleId}
          expanded={sidebarExpanded}
          controlsId={sidebarControlsId}
          onToggle={onToggleSidebar}
        />
      }
    >
      <Link href="/admin" className="flex min-h-11 items-center gap-2 rounded-md focus-visible-ring">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Shield className="icon-xs" aria-hidden />
        </span>
        <span className="text-[15px] font-semibold"><Lang text={{ ko: "관리자", en: "Admin" }} /></span>
      </Link>
    </TopBar>
  );
}
