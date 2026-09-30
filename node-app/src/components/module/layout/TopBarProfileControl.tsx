"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button, Popover, PopoverContent, PopoverTrigger } from "@amu-labs/ui";
import { AvatarThumbnail } from "components/module/image";
import { Logout } from "components/module/auth";
import { Lang, lang } from "components/module/i18n";
import { FriendsMenuRow, FriendsPanel } from "components/module/social/FriendsPanel";
import { TopBarAppLauncher } from "./TopBarAppLauncher";
import { ChevronRight, Edit2, Images, LayoutGrid, Loader2, Menu, Settings, Shield, User } from "lucide-react";
import { cn } from "src/utils/common";
import { USER_CREATION_LIBRARY_PATH } from "consts/app";
import type { AdminUniverseLink } from "hooks/admin";

type TopBarProfileControlProps = {
  userName?: string;
  userEmail?: string | null;
  profileImageUrl?: string;
  birthdate?: string;
  age?: number;
  gender?: string;
  language?: string;
  open: boolean;
  triggerClassName?: string;
  triggerType?: "profile" | "menu";
  canShowAdminButton?: boolean;
  adminUniverses?: AdminUniverseLink[];
  isAdminUniverseLoading?: boolean;
  logoutRedirectPage?: string;
  onOpenChange: (open: boolean) => void;
  onEditClick: () => void;
  onAdminClick?: () => void;
};

export default function TopBarProfileControl({
  userName,
  userEmail,
  profileImageUrl,
  open,
  triggerClassName,
  triggerType = "profile",
  canShowAdminButton,
  adminUniverses = [],
  isAdminUniverseLoading = false,
  logoutRedirectPage,
  onOpenChange,
  onEditClick,
  onAdminClick,
}: TopBarProfileControlProps) {
  const router = useRouter();
  const pathname = usePathname();
  const resolvedUserName = userName?.trim() || lang({ ko: "프로필 설정", en: "Set profile" });
  const [isFriendsPanelOpen, setIsFriendsPanelOpen] = useState(false);
  const [isServicesOpen, setIsServicesOpen] = useState(false);

  const handleFriendsClick = () => {
    onOpenChange(false);
    setIsFriendsPanelOpen(true);
  };

  const handleEditClick = () => {
    onOpenChange(false);
    onEditClick();
  };

  const handleAdminClick = () => {
    onOpenChange(false);
    onAdminClick?.();
  };

  const handleServicesClick = () => {
    onOpenChange(false);
    setIsServicesOpen(true);
  };

  const handleLibraryClick = () => {
    onOpenChange(false);
    router.push(USER_CREATION_LIBRARY_PATH);
  };

  const handleAccountClick = () => {
    onOpenChange(false);
    router.push("/account");
  };

  const closeProfileMenu = () => {
    onOpenChange(false);
  };

  const renderAdminUniverseLink = (universe: AdminUniverseLink, showManagementLabel = false) => {
    const href = `/admin/${encodeURIComponent(universe.id)}`;
    const isActive = pathname === href;

    return (
      <Button
        key={universe.id}
        asChild
        variant="blank"
        className={cn(
          "flex min-h-11 w-full items-center justify-between px-4 py-2.5 text-primary-text transition-colors hover:bg-muted/60",
          isActive && "bg-muted/60",
        )}
      >
        <Link
          href={href}
          onClick={closeProfileMenu}
          aria-current={isActive ? "page" : undefined}
          aria-label={lang({
            ko: `${universe.name} 관리자 화면으로 이동`,
            en: `Open the ${universe.name} admin page`,
          })}
        >
          <span className="flex min-w-0 items-center gap-3">
            <Shield className="h-4 w-4 shrink-0 text-secondary-text" />
            <span className="min-w-0 text-left text-sm font-medium">
              {showManagementLabel ? (
                <>
                  <Lang text={{ ko: "유니버스 관리", en: "Manage Universe" }} />
                  <span className="ml-1 text-secondary-text">· {universe.name}</span>
                </>
              ) : (
                <span className="block truncate">{universe.name}</span>
              )}
            </span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-secondary-text/70" />
        </Link>
      </Button>
    );
  };

  return (
    <>
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <Button
            variant="blank"
            aria-label={lang({ ko: "프로필 열기", en: "Open profile" })}
            className={cn(
              triggerType === "menu" && "flex h-6 w-6 items-center justify-center p-0 text-foreground",
              triggerClassName,
            )}
          >
            {triggerType === "menu" ? (
              <Menu className="icon-xs" />
            ) : profileImageUrl ? (
              <AvatarThumbnail src={profileImageUrl} alt={resolvedUserName} size="sm" imgClassName="origin-center" />
            ) : (
              <span className="flex icon-sm items-center justify-center rounded-full bg-primary/10 text-primary-text">
                <User className="icon-xs" />
              </span>
            )}
          </Button>
        </PopoverTrigger>

        <PopoverContent
          className="w-72 max-h-[calc(100vh-5rem)] supports-[height:100dvh]:max-h-[calc(100dvh-5rem)] touch-pan-y overflow-y-auto overflow-x-hidden overscroll-contain p-0 scrollbar-ghost"
          align="end"
          sideOffset={8}
        >
          <div className="rounded-t-[inherit] border-b border-border/60 px-4 py-4">
            <div className="flex items-center gap-3">
              {profileImageUrl ? (
                <AvatarThumbnail
                  src={profileImageUrl}
                  alt={resolvedUserName}
                  size="lg"
                  className="border-0"
                  imgClassName="scale-100 origin-center"
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <User className="h-6 w-6" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold text-primary-text">{resolvedUserName}</p>
                <p className="truncate text-xs text-secondary-text">
                  {userEmail || lang({ ko: "이메일 정보 없음", en: "No email available" })}
                </p>
              </div>
            </div>
          </div>

          <div className="pb-2">
            <div className="py-2">
              <Button
                variant="blank"
                onClick={handleEditClick}
                className="flex w-full items-center justify-between px-4 py-3 text-primary-text transition-colors hover:bg-muted/60"
              >
                <span className="flex items-center gap-3">
                  <Edit2 className="h-4 w-4 text-secondary-text" />
                  <span className="text-sm font-medium">
                    <Lang text={{ ko: "프로필 편집", en: "Edit Profile" }} />
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 text-secondary-text/70" />
              </Button>

              <FriendsMenuRow onClick={handleFriendsClick} />

              <Button
                variant="blank"
                onClick={handleAccountClick}
                className="flex w-full items-center justify-between px-4 py-3 text-primary-text transition-colors hover:bg-muted/60"
              >
                <span className="flex items-center gap-3">
                  <Settings className="h-4 w-4 text-secondary-text" />
                  <span className="text-sm font-medium"><Lang text={{ ko: "계정 관리", en: "Account management" }} /></span>
                </span>
                <ChevronRight className="h-4 w-4 text-secondary-text/70" />
              </Button>

              <Button
                variant="blank"
                onClick={handleLibraryClick}
                className="flex w-full items-center justify-between px-4 py-3 text-primary-text transition-colors hover:bg-muted/60"
              >
                <span className="flex items-center gap-3">
                  <Images className="h-4 w-4 text-secondary-text" />
                  <span className="text-sm font-medium">
                    <Lang text={{ ko: "내 라이브러리", en: "My Library" }} />
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 text-secondary-text/70" />
              </Button>

              <Button
                variant="blank"
                onClick={handleServicesClick}
                className="flex w-full items-center justify-between px-4 py-3 text-primary-text transition-colors hover:bg-muted/60"
              >
                <span className="flex items-center gap-3">
                  <LayoutGrid className="h-4 w-4 text-secondary-text" />
                  <span className="text-sm font-medium">
                    <Lang text={{ ko: "주요 서비스", en: "Main Services" }} />
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 text-secondary-text/70" />
              </Button>

              {isAdminUniverseLoading ? (
                <div
                  className="flex min-h-11 items-center gap-3 px-4 py-2.5 text-secondary-text"
                  role="status"
                  aria-live="polite"
                >
                  <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
                  <span className="text-sm font-medium">
                    <Lang text={{ ko: "관리자 권한 확인 중", en: "Checking admin access" }} />
                  </span>
                </div>
              ) : adminUniverses.length === 1 ? (
                renderAdminUniverseLink(adminUniverses[0], true)
              ) : adminUniverses.length > 1 ? (
                <div className="border-t border-border/60 pt-1" role="group" aria-labelledby="admin-universe-menu-label">
                  <p id="admin-universe-menu-label" className="px-4 pb-1 pt-2 text-xs font-medium text-secondary-text">
                    <Lang text={{ ko: "관리자 화면", en: "Admin pages" }} />
                  </p>
                  <div>{adminUniverses.map((universe) => renderAdminUniverseLink(universe))}</div>
                </div>
              ) : null}

              {canShowAdminButton ? (
                <Button
                  variant="blank"
                  onClick={handleAdminClick}
                  className="flex w-full items-center justify-between px-4 py-3 text-primary-text transition-colors hover:bg-muted/60"
                >
                  <span className="flex items-center gap-3">
                    <Shield className="h-4 w-4 text-secondary-text" />
                    <span className="text-sm font-medium">
                      <Lang text={{ ko: "시스템 관리", en: "System Admin" }} />
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-secondary-text/70" />
                </Button>
              ) : null}
            </div>

            <div className="border-t border-border/60 px-4 py-2 -mb-2">
              <Logout redirect={logoutRedirectPage} size="sm" className="w-full justify-center" />
            </div>
          </div>
        </PopoverContent>
      </Popover>
      <TopBarAppLauncher isLabel open={isServicesOpen} hideTrigger onOpenChange={setIsServicesOpen} />
      <FriendsPanel open={isFriendsPanelOpen} onOpenChange={setIsFriendsPanelOpen} hideTrigger />
    </>
  );
}
