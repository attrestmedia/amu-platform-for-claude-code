"use client";

import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "utils/common";
import { Wallet, CreditCard, Info } from "lucide-react";
import { consumeCoinUpdatedIfAny, onCoinUpdated } from "utils/payment";
import { fetchUniverseWallet } from "libs/api/payment";
import { Button, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";

export function UniverseWalletPanel({ universeId, className = "" }: { universeId: string; className?: string }) {
  const { data, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ["universe-wallet", universeId],
    queryFn: () => fetchUniverseWallet(universeId),
    staleTime: 10000,
  });

  // 만료 반영(기간 지나면 0으로 표시)
  const membership = useMemo(() => {
    const m = Math.max(0, data?.wallet?.membership?.coins ?? 0);
    const exp = data?.wallet?.membership?.expiresAt ? +new Date(data.wallet.membership.expiresAt) : 0;
    return exp && dataUpdatedAt > exp ? 0 : m;
  }, [data, dataUpdatedAt]);

  const charged = useMemo(() => Math.max(0, data?.wallet?.charged?.coins ?? 0), [data]);
  const expiryDate = useMemo(() => {
    const exp = data?.wallet?.membership?.expiresAt;
    if (!exp) return null;
    return new Date(exp);
  }, [data]);
  const renewableDate = useMemo(() => {
    const value = data?.policy?.renewableAt;
    return value ? new Date(value) : null;
  }, [data]);
  const pendingRenewal = data?.wallet?.membership?.pendingRenewal;

  useEffect(() => {
    // 결제 성공 페이지에서 돌아온 직후 한 번 강제 리프레시
    const consumed = consumeCoinUpdatedIfAny("universe", universeId);
    if (consumed) refetch();

    // coin-updated 브로드캐스트 수신 시에도 실시간 갱신
    const unsubscribe = onCoinUpdated((e) => {
      if (e.detail.scope === "universe" && e.detail.universeId === universeId) {
        refetch();
      }
    });

    return () => {
      unsubscribe?.();
    };
  }, [universeId, refetch]);

  return (
    <TooltipProvider>
      <section className={cn("rounded-xl border border-border bg-surface shadow-sm overflow-hidden", className)}>
        {/* 헤더 */}
        <div className="px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            <h3 className="text-base font-bold text-foreground">Universe Wallet</h3>
            {isFetching && (
              <div className="ml-auto">
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent" />
              </div>
            )}
          </div>
        </div>

        {/* 잔액 카드 */}
        <div className="p-4">
          <div className="grid grid-cols-2 gap-3">
            {/* Membership 코인 */}
            <div className="relative rounded-lg bg-gradient-to-br from-amber-50 to-orange-50 p-4 border border-amber-200 dark:from-amber-950/40 dark:to-orange-950/30 dark:border-amber-900/40">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 bg-surface rounded-default shadow-sm">
                  <CreditCard className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="flex items-center gap-1">
                  <div className="text-xs font-medium text-amber-900 dark:text-amber-100">Membership</div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="blank" size="icon-sm" aria-label="구독 코인 정보">
                        <Info className="h-3.5 w-3.5 text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs p-3 space-y-2">
                      <p className="font-semibold text-sm">Membership 코인 정책</p>
                      <ul className="text-xs space-y-1 list-disc list-inside">
                        <li>
                          결제 공급가액의 <strong>5% 추가 지급</strong>
                        </li>
                        <li>
                          유니버스 안의 <strong>모든 과금 서비스</strong>에서 우선 차감
                        </li>
                        <li>결제일 기준 한 달 후 미사용분 만료</li>
                      </ul>
                      {expiryDate && (
                        <p className="text-xs font-medium pt-1 border-t border-amber-200 dark:border-amber-900/40">
                          만료일: {expiryDate.toLocaleDateString("ko-KR")}
                        </p>
                      )}
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>
              <div className="text-2xl font-bold text-amber-900 tabular-nums dark:text-amber-100">
                {isFetching ? "--" : membership.toLocaleString()}
              </div>
              <div className="text-xs text-amber-700 mt-1 dark:text-amber-300">멤버십 코인 (우선 차감)</div>
              {expiryDate && membership > 0 && (
                <div className="text-xs text-amber-700 mt-2 flex items-center gap-1 dark:text-amber-300">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 dark:bg-amber-400" />
                  {expiryDate.toLocaleDateString("ko-KR")}까지
                </div>
              )}
            </div>

            {/* Charged 코인 */}
            <div className="relative rounded-lg bg-gradient-to-br from-emerald-50 to-green-50 p-4 border border-emerald-200 dark:from-emerald-950/40 dark:to-green-950/30 dark:border-emerald-900/40">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 bg-surface rounded-default shadow-sm">
                  <Wallet className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="flex items-center gap-1">
                  <div className="text-xs font-medium text-emerald-900 dark:text-emerald-100">Charged</div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="blank" size="icon-sm" aria-label="충전 코인 정보">
                        <Info className="h-3.5 w-3.5 text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs p-3 space-y-2">
                      <p className="font-semibold text-sm">Charged 코인 정책</p>
                      <ul className="text-xs space-y-1 list-disc list-inside">
                        <li>
                          유니버스 안의 <strong>모든 과금 서비스</strong>에 사용
                        </li>
                        <li>Membership 소진 후 차감</li>
                        <li>활성 Membership 잔액이 있을 때만 신규 충전</li>
                        <li>24개월 무활동 폐쇄 시 미사용 코인 소멸</li>
                      </ul>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>
              <div className="text-2xl font-bold text-emerald-900 tabular-nums dark:text-emerald-100">
                {isFetching ? "--" : charged.toLocaleString()}
              </div>
              <div className="text-xs text-emerald-700 mt-1 dark:text-emerald-300">Charged 코인 (Membership 다음 차감)</div>
            </div>
          </div>

          {/* 추가 안내 메시지 */}
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg dark:bg-blue-950/30 dark:border-blue-900/40">
            <p className="text-xs text-blue-800 leading-relaxed dark:text-blue-200">
              Membership 코인을 먼저 사용하고 부족분을 Charged 코인에서 차감합니다. 두 잔액이 모두 0이면 공개 페이지가 일시 중지됩니다.
            </p>
          </div>
          <div className="mt-3 rounded-lg border border-border p-3 text-xs text-secondary-text">
            {data?.policy?.accessState !== "active" && (
              <p className="font-medium text-danger"><Lang text={{ ko: "멤버십 부족으로 유니버스가 잠시 사라집니다.", en: "This universe is temporarily unavailable due to insufficient membership." }} /></p>
            )}
            {expiryDate && <p>{lang({ ko: `다음 정기 결제일: ${expiryDate.toLocaleString("ko-KR")}`, en: `Next billing date: ${expiryDate.toLocaleString("en-US")}` })}</p>}
            {renewableDate && !pendingRenewal && <p>{lang({ ko: `조기 재결제 가능일: ${renewableDate.toLocaleString("ko-KR")}`, en: `Early renewal available: ${renewableDate.toLocaleString("en-US")}` })}</p>}
            {pendingRenewal && <p><Lang text={{ ko: "다음 기간 멤버십 결제가 예약되어 있습니다.", en: "Membership payment for the next period is scheduled." }} /></p>}
          </div>
        </div>
      </section>
    </TooltipProvider>
  );
}
