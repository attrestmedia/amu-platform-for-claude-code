"use client";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import { cn } from "utils/common";
import { ADMIN_WORKSPACE_NAV_SECTIONS } from "./adminWorkspaceNavModel";
import { AdminWorkspaceNavItem } from "./AdminWorkspaceNavItem";

function AdminWorkspaceSidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label={lang({ ko: "Assets Studio", en: "Assets Studio" })} className="flex flex-col">
      {ADMIN_WORKSPACE_NAV_SECTIONS.map((section) => (
        <div key={section.id} className={cn(section.trailingDivider && "mb-2 border-b border-border pb-2")}>
          {section.label ? (
            <p className="px-2.5 pb-2 pt-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-text">
              <Lang text={section.label} />
            </p>
          ) : null}
          <ul className="flex flex-col gap-1">
            {section.items.map((item) => (
              <li key={item.id}>
                <AdminWorkspaceNavItem item={item} onNavigate={onNavigate} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function AdminWorkspaceSidebar({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const closeOnNavigate = () => onOpenChange(false);

  return (
    <>
      <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-[236px] shrink-0 overflow-y-auto border-r border-border bg-surface px-3 py-4 lg:block">
        <AdminWorkspaceSidebarNav />
      </aside>

      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="left" className="w-[236px] max-w-[85vw] gap-0 bg-surface p-0">
          <SheetHeader className="border-b border-border px-4 py-3">
            <SheetTitle className="text-base font-semibold">
              <Lang text={{ ko: "Assets Studio", en: "Assets Studio" }} />
            </SheetTitle>
            <SheetDescription className="sr-only">
              <Lang text={{ ko: "Assets Studio 탐색 메뉴", en: "Assets Studio navigation menu" }} />
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-col overflow-y-auto px-3 py-4">
            <AdminWorkspaceSidebarNav onNavigate={closeOnNavigate} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
