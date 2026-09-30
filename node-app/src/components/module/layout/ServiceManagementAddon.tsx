"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Settings2, MessageSquareText, Shield, type LucideIcon } from "lucide-react";
import { Button, Sheet, SheetContent, SheetHeader, SheetTitle } from "@amu-labs/ui";
import { useUserData } from "hooks/auth";
import { useAuthStore } from "store/auth";
import { UserPromptManager, type UserPromptManagerTab } from "components/module/admin/prompt-manager/UserPromptManager";
import { UserPersonaManager } from "components/module/persona/UserPersonaManager";
import { Lang, lang } from "components/module/i18n";
import { cn } from "utils/common";
import { OPEN_GEN_STUDIO_MANAGEMENT_EVENT } from "consts/app";
import { SHEET_CLASS, SHEET_HEADER_CLASS, THEME_OVERRIDE_CLASS } from "utils/theme";

export type ServiceManagementVariant = "genstudio" | "tutors";
type MenuByKey = "admin_system_persona" | "admin_prompts";

type MenuProps = {
  variant: ServiceManagementVariant;
  className?: string;
};

function ServiceManagementMenu({ variant, className }: MenuProps) {
  const router = useRouter();
  const { isAdministrator } = useUserData();
  const isLoggedIn = useAuthStore((s) => Boolean(s.hasHydrated && s.isAuthenticated && s.user?.id));

  const [open, setOpen] = useState<boolean>(false);
  const [promptManagerInitialTab, setPromptManagerInitialTab] = useState<UserPromptManagerTab>("image");

  useEffect(() => {
    if (variant !== "genstudio") return;

    const handleOpenGenStudioManagement = (event: Event) => {
      const detail = (event as CustomEvent<{ tab?: UserPromptManagerTab }>).detail;
      const nextTab = detail?.tab;
      setPromptManagerInitialTab(
        nextTab === "content" ||
          nextTab === "bookmarks" ||
          nextTab === "content-bookmarks" ||
          nextTab === "extra-prompts"
          ? nextTab
          : "image",
      );
      setOpen(true);
    };

    window.addEventListener(OPEN_GEN_STUDIO_MANAGEMENT_EVENT, handleOpenGenStudioManagement);
    return () => {
      window.removeEventListener(OPEN_GEN_STUDIO_MANAGEMENT_EVENT, handleOpenGenStudioManagement);
    };
  }, [variant]);

  // 로그인 또는 어드민만 관리 버튼 표시
  const canOpen = useMemo(() => {
    if (variant === "genstudio") return Boolean(isLoggedIn || isAdministrator);
    return Boolean(isLoggedIn || isAdministrator);
  }, [variant, isLoggedIn, isAdministrator]);

  const iconByKey: Record<MenuByKey, LucideIcon> = {
    admin_system_persona: Shield,
    admin_prompts: MessageSquareText,
  };

  const labelByKey = (k: MenuByKey) => {
    switch (k) {
      case "admin_system_persona":
        return <Lang text={{ ko: "System Persona 관리", en: "System Persona" }} />;
      case "admin_prompts":
        return <Lang text={{ ko: "프롬프트 관리(어드민)", en: "Prompts (Admin)" }} />;
    }
  };

  const dialogTitle =
    variant === "genstudio"
      ? lang({ ko: "Gen Studio 관리", en: "Gen Studio Management" })
      : lang({ ko: "Tutors 관리", en: "Tutors Management" });

  const openAdmin = () => {
    setOpen(false);
    router.push("/admin");
  };

  return (
    <div className={cn("flex justify-end", className)} aria-label="service-management-menu">
      {canOpen && (
        <Button
          variant="blank"
          size="xs"
          className="flex min-h-11 min-w-11 items-center gap-1 font-bold focus:ring-2 focus:ring-ring/20 !px-1"
          onClick={() => {
            setOpen(true);
          }}
          aria-label={lang({ ko: "관리", en: "Manage" })}
        >
          <Settings2 className="icon-xs" />
          <span className="hidden sm:inline">
            <Lang text={{ ko: "관리", en: "Manage" }} />
          </span>
        </Button>
      )}

      {/* 관리 UI */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className={cn(SHEET_CLASS, "border-[transparent]")} hideOverlay lockBodyScroll>
          <div className="flex h-full flex-col">
            <SheetHeader className={cn("text-left", SHEET_HEADER_CLASS)}>
              <SheetTitle className="text-base sm:text-lg">{dialogTitle}</SheetTitle>
              <p className="text-xs text-muted-foreground mt-1">
                <Lang
                  text={{
                    ko:
                      variant === "tutors"
                        ? "페르소나를 직접 등록하고 편집할 수 있습니다."
                        : "프롬프트와 저장한 이미지 설명을 관리할 수 있습니다.",
                    en:
                      variant === "tutors"
                        ? "Create and edit your personas directly."
                        : "Manage your prompts and saved image descriptions in one place.",
                  }}
                />
              </p>
            </SheetHeader>

            <div className="flex-1 overflow-hidden flex flex-col p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
              {variant === "genstudio" ? (
                <div className="flex-1 min-h-0 overflow-y-auto">
                  <UserPromptManager initialTab={promptManagerInitialTab} onClose={() => setOpen(false)} />
                </div>
              ) : (
                <div className={cn("mt-2 flex-1 min-h-0 space-y-3 overflow-y-auto", THEME_OVERRIDE_CLASS)}>
                  {/* Tutors: 어드민 빠른 메뉴 */}
                  {isAdministrator && (
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={openAdmin}
                        className="min-h-10 justify-start gap-2 rounded-xl bg-background/70 px-3 text-xs"
                      >
                        {(() => {
                          const Icon = iconByKey["admin_system_persona"];
                          return <Icon className="icon-xs" />;
                        })()}
                        {labelByKey("admin_system_persona")}
                      </Button>
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={openAdmin}
                        className="min-h-10 justify-start gap-2 rounded-xl bg-background/70 px-3 text-xs"
                      >
                        {(() => {
                          const Icon = iconByKey["admin_prompts"];
                          return <Icon className="icon-xs" />;
                        })()}
                        {labelByKey("admin_prompts")}
                      </Button>
                    </div>
                  )}
                  <UserPersonaManager
                    surface="tutors"
                    imageGenerationPresentation="embedded"
                  />
                </div>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export function ServiceManagementAddon({ variant }: { variant: ServiceManagementVariant }) {
  const hideTutorsMobileShortcut = variant === "tutors";

  return (
    <>
      <div className={cn("mr-2", hideTutorsMobileShortcut && "hidden sm:block")}>
        <ServiceManagementMenu variant={variant} />
      </div>
    </>
  );
}
