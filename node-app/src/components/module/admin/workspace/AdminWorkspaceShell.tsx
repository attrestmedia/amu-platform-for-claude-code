"use client";

import type { ReactNode } from "react";
import { Lang } from "components/module/i18n";
import { WorkspaceShell } from "components/module/layout/WorkspaceShell";
import { AdminWorkspaceHeader } from "./AdminWorkspaceHeader";
import { AdminWorkspaceSidebar } from "./AdminWorkspaceSidebar";

export function AdminWorkspaceShell({ children }: { children: ReactNode }) {
  return (
    <WorkspaceShell
      mainId="assets-studio-main"
      skipLink={<Lang text={{ ko: "Assets Studio 본문으로 건너뛰기", en: "Skip to Assets Studio content" }} />}
      topBar={({ onOpenSidebar }) => <AdminWorkspaceHeader onOpenSidebar={onOpenSidebar} />}
      sidebar={({ open, onOpenChange }) => <AdminWorkspaceSidebar open={open} onOpenChange={onOpenChange} />}
    >
      {children}
    </WorkspaceShell>
  );
}
