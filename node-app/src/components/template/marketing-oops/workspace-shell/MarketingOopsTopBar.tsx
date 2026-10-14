"use client";

import Link from "next/link";
import { lang } from "components/module/i18n";
import { TopBar, WorkspaceSidebarToggle } from "components/module/layout";
import { MarketingOopsLogo } from "components/template/marketing-oops/modules/brand";
import { useUserData } from "hooks/auth";
import { useAuthStore } from "store/auth";

type MarketingOopsTopBarProps = {
  onToggleSidebar: () => void;
  sidebarExpanded: boolean;
  sidebarControlsId?: string;
  sidebarToggleId: string;
};

export function MarketingOopsTopBar({
  onToggleSidebar,
  sidebarExpanded,
  sidebarControlsId,
  sidebarToggleId,
}: MarketingOopsTopBarProps) {
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
      <Link
        href="/marketing-oops"
        aria-label={lang({ ko: "Marketing Oops 홈", en: "Marketing Oops home" })}
        className="flex min-h-11 items-center rounded-md focus-visible-ring"
      >
        <MarketingOopsLogo className="h-8" />
      </Link>
    </TopBar>
  );
}
