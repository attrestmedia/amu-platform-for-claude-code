"use client";

import type { ReactNode } from "react";
import { Lang, lang } from "components/module/i18n";
import { WorkspaceSidebar, WorkspaceSidebarNav } from "components/module/layout";
import { WorkspaceShell } from "components/module/layout/WorkspaceShell";
import { AdminTopBar } from "./AdminTopBar";
import { useAdminNavSections } from "./useAdminNavSections";

// §11.6 어드민 어댑터 (ASH-04)
export function AdminWorkspaceShell({ children }: { children: ReactNode }) {
  const sections = useAdminNavSections();

  return (
    <WorkspaceShell
      mainId="admin-main"
      skipLink={<Lang text={{ ko: "관리자 본문으로 건너뛰기", en: "Skip to admin content" }} />}
      topBar={(props) => <AdminTopBar {...props} />}
      sidebar={(props) => (
        <WorkspaceSidebar
          {...props}
          title={<Lang text={{ ko: "관리자", en: "Admin" }} />}
          description={<Lang text={{ ko: "관리자 탐색 메뉴", en: "Admin navigation menu" }} />}
        >
          <WorkspaceSidebarNav sections={sections} ariaLabel={lang({ ko: "관리자 메뉴", en: "Admin menu" })} />
        </WorkspaceSidebar>
      )}
    >
      {children}
    </WorkspaceShell>
  );
}
