"use client";

import { Suspense } from "react";
import { Preloader } from "@amu-labs/ui";
import { MarketingConnectionsShell } from "components/template/marketing-oops/MarketingConnectionsShell";

export default function MarketingConnectionsPage() {
  return (
    <Suspense fallback={<Preloader variant="spin" size="lg" container fullScreen />}>
      <MarketingConnectionsShell />
    </Suspense>
  );
}
