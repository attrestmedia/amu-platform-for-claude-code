"use client";

import { useQuery } from "@tanstack/react-query";
import fetchClient from "libs/api/fetchClient";
import { useEffect } from "react";
import { History, TrendingUp, TrendingDown } from "lucide-react";
import { consumeCoinUpdatedIfAny } from "utils/payment";
import { cn } from "utils/common";
import { getResponseStatus } from "utils/common/typeUtils";

type UsageItem = {
  _id: string;
  universeId: string;
  userId?: string;
  amount: number;
  reason?: string;
  createdAt: string;
};

async function fetchUsage(universeId: string, limit = 10) {
  const res = await fetchClient.get("/admin/payments/usage", {
    params: { universeId, limit },
  });
  return res.data as { list: UsageItem[] };
}

export function UniverseUsageList({ universeId, className = "" }: { universeId: string; className?: string }) {
  const q = useQuery({
    queryKey: ["coin-usage", universeId],
    queryFn: () => fetchUsage(universeId, 10),
    refetchOnWindowFocus: false,
    enabled: !!universeId,
  });

  useEffect(() => {
    const consumed = consumeCoinUpdatedIfAny("universe", universeId);
    if (consumed) q.refetch();
  }, [universeId, q]);

  if (q.isError) {
    const status = getResponseStatus(q.error);
    const msg =
      status === 401
        ? "로그인이 필요합니다."
        : status === 403
        ? "해당 유니버스 사용 내역을 볼 권한이 없습니다."
        : "사용 내역을 불러오는 중 오류가 발생했습니다.";

    return (
      <section className={cn("rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden", className)}>
        <div className="p-6 text-center text-sm text-red-600">{msg}</div>
      </section>
    );
  }

  return (
    <section className={cn("rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden", className)}>
      {/* 헤더 */}
      <div className="px-4 py-3 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-blue-600" />
          <h3 className="text-base font-bold text-gray-900">Recent Deductions</h3>
          {q.isFetching && (
            <div className="ml-auto">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent" />
            </div>
          )}
        </div>
      </div>

      {/* 사용 내역 리스트 */}
      <div className="divide-y divide-gray-100">
        {(q.data?.list || []).map((u) => (
          <div key={u._id} className="px-4 py-3 hover:bg-gray-50 transition-colors duration-150">
            <div className="flex items-center justify-between gap-3">
              {/* 이유 및 금액 */}
              <div className="flex-1 flex items-center gap-3">
                {/* 아이콘 */}
                <div className={cn("flex-shrink-0 p-2 rounded-lg", u.amount < 0 ? "bg-red-50" : "bg-emerald-50")}>
                  {u.amount < 0 ? (
                    <TrendingDown className="h-4 w-4 text-red-600" />
                  ) : (
                    <TrendingUp className="h-4 w-4 text-emerald-600" />
                  )}
                </div>

                {/* 텍스트 정보 */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">{u.reason || "usage"}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {new Date(u.createdAt).toLocaleString("ko-KR", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
              </div>

              {/* 금액 표시 */}
              <div
                className={cn(
                  "inline-flex items-end gap-1 text-right font-bold tabular-nums text-lg",
                  u.amount < 0 ? "text-red-600" : "text-emerald-600"
                )}
              >
                {u.amount > 0 ? `+${u.amount.toLocaleString()}` : u.amount.toLocaleString()}
                <span className="font-normal text-sm mb-[3px]">Coin</span>
              </div>
            </div>
          </div>
        ))}

        {/* 빈 상태 */}
        {!q.data?.list?.length && (
          <div className="p-8 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 mb-3">
              <History className="h-6 w-6 text-gray-400" />
            </div>
            <p className="text-sm text-gray-500">아직 사용 내역이 없습니다</p>
          </div>
        )}
      </div>
    </section>
  );
}
