"use client";

import { useQuery } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import { cn } from "utils/common";
import { getForgeSummary } from "libs/api/game/forgeSummaryClient";
import { buildForgeNavSections, FORGE_STEP_ITEM_IDS } from "../model/forgeNavModel";
import { mapSummaryStepStatus } from "../model/forgeStepStatus";
import { useForgeAudience } from "../model/useForgeAudience";
import { ForgeSidebarNavItem } from "./ForgeSidebarNavItem";
import { ForgeOnboardingCard } from "./ForgeOnboardingCard";
import { FORGE_GLOSSARY } from "../model/forgeGlossary";

function ForgeSidebarNav() {
  const forgeAudience = useForgeAudience();
  const navSections = buildForgeNavSections(forgeAudience);

  // 대시보드와 동일한 queryKey로 조회해 react-query가 1회 요청으로 dedupe한다.
  const { data: summary } = useQuery({
    queryKey: ["forge-summary"],
    queryFn: getForgeSummary,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
  const stepStatusMap = mapSummaryStepStatus(summary?.stepStatus, FORGE_STEP_ITEM_IDS);

  return (
    <nav aria-label={lang(FORGE_GLOSSARY.service)} className="flex flex-col">
      {navSections.map((section) => (
        <div key={section.id} className={section.trailingDivider ? "mb-2 border-b border-border pb-2" : ""}>
          {section.label ? (
            <p className="px-2.5 pb-2 pt-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-text">
              {typeof section.label === "string" ? section.label : <Lang text={section.label} />}
            </p>
          ) : null}
          <ul className="flex flex-col gap-1">
            {section.items.map((item) => (
              <li key={item.id}>
                <ForgeSidebarNavItem item={item} status={stepStatusMap[item.id]} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

type ForgeSidebarProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  desktopCollapsed: boolean;
  desktopSidebarId: string;
  sheetId: string;
};

export function ForgeSidebar({ open, onOpenChange, desktopCollapsed, desktopSidebarId, sheetId }: ForgeSidebarProps) {
  return (
    <>
      {/* 데스크톱 고정 사이드바 (lg 이상). 다크 스코프 도입 시 배경을 --sidebar-bg로 전환한다. */}
      <aside
        id={desktopSidebarId}
        className={cn(
          "sticky top-14 h-[calc(100dvh-3.5rem)] w-[236px] shrink-0 overflow-y-auto border-r border-border bg-surface px-3 py-4",
          desktopCollapsed ? "hidden" : "hidden lg:block",
        )}
      >
        <ForgeSidebarNav />
        <ForgeOnboardingCard />
      </aside>

      {/* 모바일 Sheet (lg 미만) */}
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          id={sheetId}
          side="left"
          className="w-[236px] max-w-[85vw] gap-0 bg-surface p-0 motion-reduce:animate-none motion-reduce:transition-none"
          overlayClassName="motion-reduce:animate-none motion-reduce:transition-none"
        >
          <SheetHeader className="border-b border-border px-4 py-3">
            <SheetTitle className="text-base font-semibold"><Lang text={FORGE_GLOSSARY.service} /></SheetTitle>
            <SheetDescription className="sr-only">
              <Lang text={{ ko: "에셋 스튜디오 탐색 메뉴", en: "Assets Studio navigation menu" }} />
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-2 overflow-y-auto px-3 py-4">
            <ForgeSidebarNav />
            <ForgeOnboardingCard />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
