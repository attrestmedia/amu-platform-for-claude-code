"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle } from "@amu-labs/ui";
import { CoinUsageDialog } from "./CoinUsageDialog";
import { Lang, useLocalize } from "components/module/i18n";
import { consumeCoinUpdatedIfAny, onCoinUpdated } from "utils/payment";
import { cn, runAfterCurrentRender } from "utils/common";
import { useUserData } from "hooks/auth";
import { useAuthStore } from "store/auth";
import { Coins } from "lucide-react";
import CoinChargeWidget from "./CoinChargeWidget";

// 개인 사용 가능 잔액은 무상 bonus와 유상 charged의 합계다.
interface CoinBalanceProps {
  className?: string;
  iconSize?: number;
  showLabel?: boolean;
}

/**
 * 유저 사용 가능 코인 잔액 표시(무상 bonus + 유상 charged, 로딩: "--")
 * - coin-updated(scope=user) 수신 시 refetch
 */
export default function CoinBalance({ className, iconSize = 16, showLabel = true }: CoinBalanceProps) {
  const { localize } = useLocalize();
  const { user } = useAuthStore();
  const { userData, isLoading, refetchUserData } = useUserData();
  const [delta, setDelta] = useState<number | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(
    // 매거진 등 외부 진입 딥링크: /?coinUsage=1 로 오면 사용내역 다이얼로그를 바로 연다.
    // SSR 초기값은 false이고, 클라이언트 첫 렌더에서 URL을 읽어 초기화한다.
    typeof window !== "undefined" && window.location.search.includes("coinUsage=1"),
  );
  const [isChargeOpen, setIsChargeOpen] = useState(false);
  const coins = useMemo(
    () => (userData?.wallet?.bonus?.coins ?? 0) + (userData?.wallet?.charged?.coins ?? 0),
    [userData],
  );
  const uid = user?.id || userData?.uid || "";
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    // 딥링크 파라미터는 초기화에 사용한 뒤 주소에서 정리한다(외부 시스템 갱신 — setState 없음).
    if (typeof window === "undefined" || !window.location.search.includes("coinUsage=1")) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("coinUsage");
    window.history.replaceState(window.history.state, "", url.toString());
  }, []);

  useEffect(() => {
    // 라우트 전환 직후 저장된 "충전 완료" 신호가 있으면 소비하고 즉시 갱신
    const consumed = consumeCoinUpdatedIfAny("user");
    if (consumed) {
      if (typeof consumed.amount === "number") {
        // 이펙트 내 동기 setState 회피: 현재 렌더 직후로 지연
        const amount = consumed.amount;
        runAfterCurrentRender(() => {
          setDelta(amount);
          if (timerRef.current) window.clearTimeout(timerRef.current);
          timerRef.current = window.setTimeout(() => setDelta(null), 1500);
        });
      }
      refetchUserData?.();
    }

    // coin-updated 브로드캐스트를 수신해서 실시간 반영
    const unsubscribe = onCoinUpdated((e) => {
      if (e.detail.scope !== "user") return;

      // amount가 넘어오면 delta 애니메이션에도 반영
      if (typeof e.detail.amount === "number") {
        setDelta(e.detail.amount);
        if (timerRef.current) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => setDelta(null), 1500);
      }

      // 실제 잔액은 항상 서버 기준으로 다시 가져옴
      refetchUserData?.();
    });

    // 탭 포커스만 돌아와도 잔액 싱크 (안전장치)
    const onFocus = () => refetchUserData?.();
    window.addEventListener("focus", onFocus);

    return () => {
      window.removeEventListener("focus", onFocus);
      unsubscribe?.();
    };
  }, [refetchUserData]);

  return (
    <>
      <Button
        variant="blank"
        rounded="lg"
        className={cn(
          "inline-flex min-h-11 min-w-11 items-center gap-1.5 rounded-default xs:px-2 text-xs md:text-sm",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 hover:bg-muted/60",
          className,
        )}
        aria-label={localize({ ko: "코인 사용 내역 보기", en: "View coin activity" })}
        aria-haspopup="dialog"
        aria-expanded={isHistoryOpen}
        onClick={(event) => {
          event.stopPropagation();
          setIsHistoryOpen(true);
        }}
      >
        {showLabel && (
          <span className="text-gray-700">
            <Lang text={{ ko: "보유 코인", en: "Coin balance" }} />
          </span>
        )}
        <span className="inline-flex items-center gap-1 text-sm font-bold text-amber-700 tabular-nums">
          <Coins style={{ width: iconSize, height: iconSize }} />
          <span>{isLoading ? "--" : `${coins.toLocaleString()}`}</span>
        </span>

        {/* 최근 변화량 */}
        {!!delta && (
          <span className={cn("ml-1 animate-pulse", delta < 0 ? "text-red-600" : "text-emerald-600")}>
            {delta > 0 ? `+${delta}` : `${delta}`}
          </span>
        )}
      </Button>
      <CoinUsageDialog
        open={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        onChargeClick={
          uid
            ? () => {
                setIsHistoryOpen(false);
                setIsChargeOpen(true);
              }
            : undefined
        }
      />
      {uid && (
        <Dialog open={isChargeOpen} onOpenChange={setIsChargeOpen}>
          <DialogContent innerWrapClassName="min-w-[20rem] md:min-w-[30rem]" centered>
            <DialogHeader>
              <DialogTitle>
                <Lang text={{ ko: "코인 충전", en: "Charge Coins" }} />
              </DialogTitle>
            </DialogHeader>
            <CoinChargeWidget uid={uid} title="" />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
