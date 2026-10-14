"use client";

import type { ReactNode } from "react";
import { Suspense } from "react";
import { Preloader } from "@amu-labs/ui";
import { MarketingOperationsShell } from "components/template/marketing-oops/MarketingOperationsShell";

export default function MarketingWorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Suspense fallback={<Preloader variant="spin" size="lg" container fullScreen />}>
        <MarketingOperationsShell />
      </Suspense>
      {children}
    </>
  );
}
