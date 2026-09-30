"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  ChevronRight,
  ExternalLink,
  Gamepad2,
  Images,
  LayoutGrid,
  Link2,
  Newspaper,
  Pencil,
  Settings,
  Sparkles,
  Store,
  X,
} from "lucide-react";
import { Button, Popover, PopoverContent, PopoverTrigger, Sheet, SheetContent, SheetHeader, SheetTrigger, SheetTitle } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import { useManageableUniverses } from "hooks/admin";
import { useAuthStore } from "store/auth";
import { WP_HOME_URL } from "consts/env/public";
import type { ServiceKey } from "consts/system/serviceAvailability";
import { useServiceAvailability } from "components/module/service";

type LauncherApp = "drawing" | "scrape-links" | "search-images";

const SERVICE_ITEMS = [
  { id: "play", href: "/play", icon: Gamepad2, label: "Play" },
  { id: "gen-studio", href: "/gen-studio", icon: Sparkles, label: "Gen Studio" },
  { id: "tutors", href: "/tutors", icon: BookOpen, label: "Tutors" },
  { id: "marketing-oops", href: "/marketing-oops", icon: BarChart3, label: "Marketing Oops" },
  { id: "store", href: "/store", icon: Store, label: "Store" },
] as const;

const CONTENT_ITEMS = [
  {
    id: "magazine",
    href: `${WP_HOME_URL}/magazine/`,
    icon: Newspaper,
    label: "Magazine",
    external: true,
  },
] as const;

const CanvasDrawingApp = dynamic(
  () => import("components/template/canvas-drawing/CanvasDrawingApp").then((mod) => mod.CanvasDrawingApp),
  { ssr: false },
);
const ScrapeLinksApp = dynamic(() => import("src/app/(public)/apps/scrape-links/ScrapeLinksApp"), { ssr: false });
const SearchImgsPage = dynamic(() => import("src/app/(public)/apps/search-imgs/page"), { ssr: false });

const APP_ITEMS: Array<{
  id: LauncherApp;
  icon: typeof Pencil;
  label: { ko: string; en: string };
  description: { ko: string; en: string };
  serviceKey: ServiceKey;
}> = [
  {
    id: "drawing",
    icon: Pencil,
    label: { ko: "Drawing", en: "Drawing" },
    description: { ko: "투명 캔버스에 바로 스케치", en: "Sketch on a transparent canvas" },
    serviceKey: "drawing",
  },
  {
    id: "scrape-links",
    icon: Link2,
    label: { ko: "Scrape Links", en: "Scrape Links" },
    description: { ko: "링크를 수집하고 분류", en: "Collect and label links" },
    serviceKey: "scrape-links",
  },
  {
    id: "search-images",
    icon: Images,
    label: { ko: "Search Images", en: "Search Images" },
    description: { ko: "무료 이미지를 통합 검색", en: "Search free images" },
    serviceKey: "search-images",
  },
];

type TopBarAppLauncherProps = {
  isLabel?: boolean;
  open?: boolean;
  hideTrigger?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function TopBarAppLauncher({
  isLabel = false,
  open: controlledOpen,
  hideTrigger = false,
  onOpenChange,
}: TopBarAppLauncherProps) {
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);
  const [activeApp, setActiveApp] = useState<LauncherApp | null>(null);
  const menuOpen = controlledOpen ?? internalOpen;
  const setMenuOpen = (open: boolean) => {
    if (controlledOpen === undefined) setInternalOpen(open);
    onOpenChange?.(open);
  };
  const isLoggedIn = useAuthStore((state) => Boolean(state.hasHydrated && state.isAuthenticated && state.user?.id));
  const {
    editableUniverses,
    isAdministrator,
    isLoading: isManagementLoading,
  } = useManageableUniverses(menuOpen && isLoggedIn);
  const canUseUtilityApps = Boolean(isAdministrator || editableUniverses.length > 0);
  const { services } = useServiceAvailability();
  const visibleServiceItems = SERVICE_ITEMS.filter((item) => services[item.id] || isAdministrator);
  const visibleAppItems = APP_ITEMS.filter((item) => services[item.serviceKey] || isAdministrator);

  const openApp = (app: LauncherApp) => {
    setMenuOpen(false);
    setActiveApp(app);
  };

  const closeApp = () => setActiveApp(null);

  const openDestination = (href: string, external = false) => {
    setMenuOpen(false);
    if (external) {
      window.open(href, "_blank", "noopener,noreferrer");
      return;
    }
    router.push(href);
  };

  const LauncherRoot = isLabel ? Sheet : Popover;
  const LauncherTrigger = isLabel ? SheetTrigger : PopoverTrigger;
  const LauncherContent = isLabel ? SheetContent : PopoverContent;

  return (
    <>
      <LauncherRoot open={menuOpen} onOpenChange={setMenuOpen}>
        {!hideTrigger ? (
          <LauncherTrigger asChild>
            <Button
              variant="blank"
              size={isLabel ? undefined : "icon-sm"}
              rounded={isLabel ? "none" : "full"}
              aria-label={lang({ ko: "앱 메뉴 열기", en: "Open app menu" })}
              className={
                isLabel
                  ? "flex w-full items-center justify-between px-4 py-3 text-primary-text transition-colors hover:bg-muted/60"
                  : "icon-sm bg-primary/10 text-primary-text"
              }
            >
              {isLabel ? (
                <>
                  <span className="flex items-center gap-3">
                    <LayoutGrid className="h-4 w-4 text-secondary-text" />
                    <span className="text-sm font-medium">
                      <Lang text={{ ko: "주요 서비스", en: "Main Services" }} />
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-secondary-text/70" />
                </>
              ) : (
                <LayoutGrid className="icon-xs" />
              )}
            </Button>
          </LauncherTrigger>
        ) : null}
        <LauncherContent
          className={
            isLabel
              ? "w-full overflow-hidden rounded-t-2xl p-1 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] xs:rounded-2xl xs:pb-1"
              : "w-80 overflow-y-auto p-1"
          }
          {...(isLabel
            ? {
                side: "bottom" as const,
                responsiveModal: true,
                overlayClassName: "bg-black/50",
              }
            : { align: "end" as const, sideOffset: 8 })}
        >
          <div className="px-3 pb-2 pt-3">
            {isLabel ? (
              <SheetHeader className="text-left">
                <SheetTitle className="text-base">
                  <Lang text={{ ko: "주요 서비스", en: "Services" }} />
                </SheetTitle>
              </SheetHeader>
            ) : (
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-secondary-text">
                <Lang text={{ ko: "주요 서비스", en: "Services" }} />
              </p>
            )}
          </div>

          <div className="flex max-h-[calc(100dvh-10rem)] flex-col overflow-y-auto scrollbar-ghost xs:max-h-[calc(min(82dvh,44rem)-4.5rem)]">
            <div className="flex flex-col gap-1 pb-2">
              {visibleServiceItems.map(({ id, href, icon: Icon, label }) => (
                <Button
                  key={id}
                  variant="blank"
                  className="group flex w-full items-center justify-between px-3 py-2 text-left"
                  onClick={() => openDestination(href)}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Icon className="icon-xs" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-primary-text group-hover:text-primary">
                        {label}
                      </span>
                      {!services[id] && isAdministrator ? (
                        <span className="block text-xxs font-medium text-secondary-text">
                          <Lang text={{ ko: "비공개 · 관리자 접근", en: "Private · Admin access" }} />
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <ChevronRight className="icon-xs shrink-0 text-secondary-text" />
                </Button>
              ))}
            </div>

            <div className="border-t border-border/60 pb-2">
              <div className="px-3 pb-2 pt-3">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-secondary-text">
                  <Lang text={{ ko: "콘텐츠", en: "Content" }} />
                </p>
              </div>
              {CONTENT_ITEMS.map(({ id, href, icon: Icon, label }) => (
                <Button
                  key={id}
                  variant="blank"
                  className="group flex w-full items-center justify-between px-3 py-2 text-left"
                  onClick={() => openDestination(href, true)}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Icon className="icon-xs" />
                    </span>
                    <span className="truncate text-sm font-semibold text-primary-text group-hover:text-primary">{label}</span>
                  </span>
                  <ExternalLink className="icon-xs shrink-0 text-secondary-text" />
                </Button>
              ))}
            </div>

            {isLoggedIn && (isManagementLoading || editableUniverses.length > 0) ? (
              <div className="border-t border-border/60 pb-2">
                <div className="px-3 pb-2 pt-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-secondary-text">
                    <Lang text={{ ko: "관리", en: "Management" }} />
                  </p>
                </div>
                {isManagementLoading ? (
                  <p className="px-3 pb-3 text-xs text-secondary-text">
                    <Lang text={{ ko: "관리 권한 확인 중...", en: "Checking management access..." }} />
                  </p>
                ) : (
                  <div className="flex flex-col gap-1">
                    {editableUniverses.map((universe) => (
                      <Button
                        key={universe.id}
                        variant="blank"
                        className="group flex w-full items-center justify-between px-3 py-2 text-left"
                        onClick={() => openDestination(
                          universe.type === "commerce"
                            ? `/store/${encodeURIComponent(universe.id)}/manage`
                            : `/admin/${encodeURIComponent(universe.id)}`,
                        )}
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                            <Settings className="icon-xs" />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-primary-text">
                              {universe.name}
                            </span>
                            <span className="block text-xs text-secondary-text">
                              <Lang
                                text={{
                                  ko: universe.type === "commerce" ? "스토어 관리" : "유니버스 관리",
                                  en: universe.type === "commerce" ? "Store management" : "Universe management",
                                }}
                              />
                            </span>
                          </span>
                        </span>
                        <ChevronRight className="icon-xs shrink-0 text-secondary-text" />
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {canUseUtilityApps && visibleAppItems.length > 0 ? (
              <div className="border-t border-border/60">
                <div className="px-3 pb-2 pt-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-secondary-text">
                    <Lang text={{ ko: "유용한 앱들", en: "Useful Apps" }} />
                  </p>
                </div>
                <div className="flex flex-col gap-1 pb-4">
                  {visibleAppItems.map(({ id, icon: Icon, label, description, serviceKey }) => (
                    <Button
                      key={id}
                      variant="blank"
                      className="group flex w-full items-center justify-between px-3 py-1 text-left"
                      onClick={() => openApp(id)}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                          <Icon className="icon-xs" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-primary-text group-hover:text-primary">
                            <Lang text={label} />
                          </span>
                          <span className="block truncate text-xs text-secondary-text group-hover:text-secondary">
                            <Lang text={description} />
                          </span>
                          {!services[serviceKey] && isAdministrator ? (
                            <span className="block text-xxs font-medium text-secondary-text">
                              <Lang text={{ ko: "비공개 · 관리자 접근", en: "Private · Admin access" }} />
                            </span>
                          ) : null}
                        </span>
                      </span>
                      <ChevronRight className="icon-xs shrink-0 text-secondary-text" />
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </LauncherContent>
      </LauncherRoot>

      <Sheet open={activeApp === "drawing"} onOpenChange={(open) => !open && closeApp()}>
        <SheetContent
          side="bottom"
          hideOverlay
          hideClose
          lockBodyScroll
          className="inset-0 h-[100dvh] max-h-none w-[100dvw] max-w-none border-0 bg-transparent p-0 shadow-none"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>
              <Lang text={{ ko: "Drawing", en: "Drawing" }} />
            </SheetTitle>
          </SheetHeader>
          <CanvasDrawingApp
            embedded
            forceTransparentBackground
            showTransparentCheckerboard={false}
            toolbarCollapsible
            titleText={{ ko: "드로잉", en: "Drawing" }}
            hideBackgroundControls
            onClose={closeApp}
          />
        </SheetContent>
      </Sheet>

      <Sheet open={activeApp === "scrape-links"} onOpenChange={(open) => !open && closeApp()}>
        <SheetContent side="bottom" hideClose className="h-[92dvh] overflow-hidden rounded-t-2xl p-0">
          <SheetHeader className="border-b border-border bg-background/95 px-4 py-4 text-left">
            <SheetTitle>
              <Lang text={{ ko: "Scrape Links", en: "Scrape Links" }} />
            </SheetTitle>
            <Button
              variant="blank"
              aria-label={lang({ ko: "Scrape Links 닫기", en: "Close Scrape Links" })}
              className="absolute right-3 top-3 h-9 w-9 p-0"
              onClick={closeApp}
            >
              <X className="h-4 w-4" />
            </Button>
          </SheetHeader>
          <div className="h-full overflow-auto pb-16">
            <ScrapeLinksApp />
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={activeApp === "search-images"} onOpenChange={(open) => !open && closeApp()}>
        <SheetContent side="bottom" hideClose className="h-[92dvh] overflow-hidden rounded-t-2xl p-0">
          <SheetHeader className="border-b border-border bg-background/95 px-4 py-4 text-left">
            <SheetTitle>
              <Lang text={{ ko: "Search Images", en: "Search Images" }} />
            </SheetTitle>
            <Button
              variant="blank"
              aria-label={lang({ ko: "Search Images 닫기", en: "Close Search Images" })}
              className="absolute right-3 top-3 h-9 w-9 p-0"
              onClick={closeApp}
            >
              <X className="h-4 w-4" />
            </Button>
          </SheetHeader>
          <div className="h-full overflow-auto pb-16">
            <SearchImgsPage startOpen />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
