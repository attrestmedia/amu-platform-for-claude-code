"use client";

import { Suspense } from "react";
import { Preloader } from "@amu-labs/ui";
import { MarketingOperationsShell } from "components/template/marketing-oops/MarketingOperationsShell";

export default function MarketingOperationsPage() {
  return (
    <Suspense fallback={<Preloader variant="spin" size="lg" container fullScreen />}>
      <MarketingOperationsShell />
    </Suspense>
  );
}
