"use client";

import type { ReactNode } from "react";
import { Suspense } from "react";
import { Lang, lang } from "components/module/i18n";
import { WorkspaceShell } from "components/module/layout/WorkspaceShell";
import { WorkspaceSidebar, WorkspaceSidebarNav } from "components/module/layout";
import { MarketingNavBadgeProvider } from "./MarketingNavBadgeContext";
import { MarketingOopsTopBar } from "./MarketingOopsTopBar";
import { useMarketingNavSections } from "./useMarketingNavSections";

function MarketingOopsSidebarNavigation() {
  const sections = useMarketingNavSections();
  return <WorkspaceSidebarNav sections={sections} ariaLabel={lang({ ko: "Marketing Oops 메뉴", en: "Marketing Oops menu" })} />;
}

export function MarketingOopsWorkspaceShell({ children }: { children: ReactNode }) {
  return (
    <MarketingNavBadgeProvider>
      <WorkspaceShell
        mainId="marketing-oops-main"
        skipLink={<Lang text={{ ko: "Marketing Oops 본문으로 건너뛰기", en: "Skip to Marketing Oops content" }} />}
        topBar={(props) => <MarketingOopsTopBar {...props} />}
        sidebar={(props) => (
          <WorkspaceSidebar
            {...props}
            title={<Lang text={{ ko: "Marketing Oops", en: "Marketing Oops" }} />}
            description={<Lang text={{ ko: "Marketing Oops 탐색 메뉴", en: "Marketing Oops navigation" }} />}
          >
            <Suspense fallback={null}>
              <MarketingOopsSidebarNavigation />
            </Suspense>
          </WorkspaceSidebar>
        )}
      >
        {children}
      </WorkspaceShell>
    </MarketingNavBadgeProvider>
  );
}
