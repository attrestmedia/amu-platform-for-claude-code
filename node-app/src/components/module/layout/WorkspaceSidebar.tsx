"use client";

import type { ReactNode } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@amu-labs/ui";
import { cn } from "utils/common";
import type { WorkspaceShellSidebarSlotProps } from "./WorkspaceShell";

export type WorkspaceSidebarProps = WorkspaceShellSidebarSlotProps & {
  title: ReactNode;
  description: ReactNode;
  children: ReactNode;
};

export function WorkspaceSidebar({
  open,
  onOpenChange,
  desktopCollapsed,
  desktopSidebarId,
  sheetId,
  onSheetCloseAutoFocus,
  title,
  description,
  children,
}: WorkspaceSidebarProps) {
  return (
    <>
      <aside
        id={desktopSidebarId}
        className={cn(
          "sticky top-14 h-[calc(100dvh-3.5rem)] w-[236px] shrink-0 overflow-y-auto border-r border-border bg-surface px-3 py-4",
          desktopCollapsed ? "hidden" : "hidden lg:block",
        )}
      >
        {children}
      </aside>

      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          id={sheetId}
          onCloseAutoFocus={onSheetCloseAutoFocus}
          side="left"
          className="w-[236px] max-w-[85vw] gap-0 bg-surface p-0 motion-reduce:animate-none motion-reduce:transition-none"
          overlayClassName="motion-reduce:animate-none motion-reduce:transition-none"
        >
          <SheetHeader className="border-b border-border px-4 py-3">
            <SheetTitle className="text-base font-semibold">{title}</SheetTitle>
            <SheetDescription className="sr-only">{description}</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-2 overflow-y-auto px-3 py-4">{children}</div>
        </SheetContent>
      </Sheet>
    </>
  );
}
