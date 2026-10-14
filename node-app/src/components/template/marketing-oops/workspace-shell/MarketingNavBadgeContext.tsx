"use client";

import { createContext, Suspense, useContext, useEffect, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import fetchClient from "libs/api/fetchClient";
import { MARKETING_CONTENT_QUEUE_API } from "components/module/admin/third-party/marketing-operations/MarketingOpsConstants";
import { buildScopeParams } from "components/module/admin/third-party/marketing-operations/MarketingOpsUtils";

const MarketingNavBadgeContext = createContext<number>(0);

function MarketingReviewTotalLoader({
  onTotalChange,
}: {
  onTotalChange: Dispatch<SetStateAction<number>>;
}) {
  const pathname = usePathname() ?? "";
  const universeId = useSearchParams().get("universeId") ?? "";

  useEffect(
    function loadWaitingReviewTotal() {
      let isCurrent = true;

      async function fetchWaitingReviewTotal() {
        try {
          const response = await fetchClient.get<{
            data?: { pagination?: { total?: unknown } };
          }>(MARKETING_CONTENT_QUEUE_API, {
            params: {
              ...buildScopeParams(universeId),
              page: 1,
              limit: 1,
              status: "waiting_review",
            },
          });
          const total = response.data?.data?.pagination?.total;
          const reviewTotal =
            typeof total === "number" && Number.isInteger(total) && total >= 0 ? total : 0;

          if (isCurrent) onTotalChange(reviewTotal);
        } catch {
          if (isCurrent) onTotalChange(0);
        }
      }

      void fetchWaitingReviewTotal();

      return () => {
        isCurrent = false;
      };
    },
    [onTotalChange, pathname, universeId],
  );

  return null;
}

export function MarketingNavBadgeProvider({ children }: { children: ReactNode }) {
  const [reviewTotal, setReviewTotal] = useState(0);

  return (
    <MarketingNavBadgeContext.Provider value={reviewTotal}>
      <Suspense fallback={null}>
        <MarketingReviewTotalLoader onTotalChange={setReviewTotal} />
      </Suspense>
      {children}
    </MarketingNavBadgeContext.Provider>
  );
}

export function useMarketingReviewTotal(): number {
  return useContext(MarketingNavBadgeContext);
}
