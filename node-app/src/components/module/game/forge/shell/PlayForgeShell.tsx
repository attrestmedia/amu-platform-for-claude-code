"use client";

import type { ReactNode } from "react";
import { Lang } from "components/module/i18n";
import { ForgeTopBar } from "./ForgeTopBar";
import { ForgeSidebar } from "./ForgeSidebar";
import { WorkspaceShell } from "components/module/layout/WorkspaceShell";

/**
 * Assets Studio 앱 셸 — 상단 바 + 사이드바 + 본문 슬롯.
 * 인증 가드는 layout.tsx가 담당하고 여기서는 레이아웃만 조립한다.
 */
export function PlayForgeShell({ children }: { children: ReactNode }) {
  return (
    <WorkspaceShell
      mainId="forge-main"
      skipLink={<Lang text={{ ko: "에셋 스튜디오 본문으로 건너뛰기", en: "Skip to Assets Studio content" }} />}
      topBar={({ onToggleSidebar, sidebarExpanded, sidebarControlsId }) => (
        <ForgeTopBar
          onToggleSidebar={onToggleSidebar}
          sidebarExpanded={sidebarExpanded}
          sidebarControlsId={sidebarControlsId}
        />
      )}
      sidebar={(props) => <ForgeSidebar {...props} />}
    >
      {children}
    </WorkspaceShell>
  );
}
