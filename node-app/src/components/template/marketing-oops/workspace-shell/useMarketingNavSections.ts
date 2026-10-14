"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useUserData } from "hooks/auth";
import { useMarketingReviewTotal } from "./MarketingNavBadgeContext";
import { buildMarketingNavSections } from "./marketingNavModel";

export function useMarketingNavSections() {
  const { userData } = useUserData();
  const searchParams = useSearchParams();
  const isAdministrator = userData?.roles?.includes("administrator") === true;
  const universeId = searchParams.get("universeId") ?? "";
  const reviewTotal = useMarketingReviewTotal();

  return useMemo(
    () => buildMarketingNavSections({ isAdministrator, universeId, reviewTotal }),
    [isAdministrator, reviewTotal, universeId],
  );
}
