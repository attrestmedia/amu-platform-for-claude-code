"use client";

import type { ReactNode } from "react";
import { Lang, lang } from "components/module/i18n";
import { WorkspaceSidebar, WorkspaceSidebarNav } from "components/module/layout";
import { WorkspaceShell } from "components/module/layout/WorkspaceShell";
import { StoreTopBar } from "./StoreTopBar";
import { useStoreNavSections } from "./useStoreNavSections";

export function StoreWorkspaceShell({ children }: { children: ReactNode }) {
  const sections = useStoreNavSections();

  return (
    <WorkspaceShell
      mainId="store-manage-main"
      skipLink={<Lang text={{ ko: "스토어 관리 본문으로 건너뛰기", en: "Skip to store management content" }} />}
      topBar={(props) => <StoreTopBar {...props} />}
      sidebar={(props) => (
        <WorkspaceSidebar
          {...props}
          title={<Lang text={{ ko: "스토어 관리", en: "Store management" }} />}
          description={<Lang text={{ ko: "스토어 관리 탐색 메뉴", en: "Store management navigation" }} />}
        >
          <WorkspaceSidebarNav sections={sections} ariaLabel={lang({ ko: "스토어 관리 메뉴", en: "Store management menu" })} />
        </WorkspaceSidebar>
      )}
    >
      {children}
    </WorkspaceShell>
  );
}
