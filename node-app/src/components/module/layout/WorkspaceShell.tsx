"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useIsMobile } from "hooks/common/useIsMobile";
import { cn } from "utils/common";

export type WorkspaceShellTopBarSlotProps = {
  /** @deprecated ASH-21 — use onToggleSidebar. Kept for existing adapters. */
  onOpenSidebar: () => void;
  onToggleSidebar: () => void;
  sidebarExpanded: boolean;
  sidebarControlsId?: string;
};

export type WorkspaceShellSidebarSlotProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  desktopCollapsed: boolean;
  desktopSidebarId: string;
  sheetId: string;
};

export type WorkspaceShellProps = {
  children: ReactNode;
  mainId: string;
  skipLink: ReactNode;
  topBar: (props: WorkspaceShellTopBarSlotProps) => ReactNode;
  sidebar: (props: WorkspaceShellSidebarSlotProps) => ReactNode;
};

/**
 * 도메인별 작업 공간이 공유하는 상단 바·사이드바·본문 프레임.
 * 인증, 권한, 라우트, 메뉴 데이터와 서비스별 UI는 각 어댑터가 소유한다.
 */
export function WorkspaceShell({ children, mainId, skipLink, topBar, sidebar }: WorkspaceShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const isBelowLg = useIsMobile("(max-width: 1023px)");
  const desktopSidebarId = `${mainId}-sidebar`;
  const sheetId = `${mainId}-sidebar-sheet`;
  const sidebarExpanded = isBelowLg ? sidebarOpen : !desktopCollapsed;
  const sidebarControlsId = isBelowLg ? (sidebarOpen ? sheetId : undefined) : desktopSidebarId;

  const onOpenSidebar = () => setSidebarOpen(true);
  const onToggleSidebar = () => {
    if (isBelowLg) {
      setSidebarOpen((open) => !open);
      return;
    }

    setDesktopCollapsed((collapsed) => !collapsed);
  };

  useEffect(
    function closeSheetOnDesktop() {
      if (!isBelowLg && sidebarOpen) setSidebarOpen(false);
    },
    [isBelowLg, sidebarOpen],
  );

  return (
    <div className="min-h-[100dvh] bg-background text-primary-text">
      <a
        href={`#${mainId}`}
        className="sr-only z-50 rounded-md bg-background px-4 py-3 text-primary-text focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus-visible-ring"
      >
        {skipLink}
      </a>

      {topBar({ onOpenSidebar, onToggleSidebar, sidebarExpanded, sidebarControlsId })}

      <div
        className={cn(
          "lg:grid",
          desktopCollapsed ? "lg:grid-cols-[minmax(0,1fr)]" : "lg:grid-cols-[236px_minmax(0,1fr)]",
        )}
      >
        {sidebar({ open: sidebarOpen, onOpenChange: setSidebarOpen, desktopCollapsed, desktopSidebarId, sheetId })}
        <main id={mainId} className="min-w-0 px-4 pb-10 pt-4 sm:px-6 lg:px-6 lg:pt-6">
          {children}
        </main>
      </div>
    </div>
  );
}
