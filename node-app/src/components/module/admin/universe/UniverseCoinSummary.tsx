import { useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchUniverseWallet } from "libs/api/payment";
import { consumeCoinUpdatedIfAny } from "utils/payment";
import { onCoinUpdated } from "utils/payment";
import { Coins } from "lucide-react";
import { Lang } from "components/module/i18n";

type UniverseCoinSummaryProps = {
  universeId?: string;
  /**
   * compact: Bottom Action Bar 등 CTA 인접 잔액 표기용 소형 표기 (Phase 4 계약 §3.8).
   * card: 기존 카드형(기본값) — 기존 호출부 동작 유지.
   */
  variant?: "card" | "compact";
};

/**
 * 유니버스 관리자 모드에서 사용할 코인 요약 바
 * - /admin/[universeId] Pixel Studio 다이얼로그에서 사용
 */
export function UniverseCoinSummary({ universeId, variant = "card" }: UniverseCoinSummaryProps) {
  const enabled = !!universeId;

  const { data, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ["universe-wallet", universeId],
    queryFn: () => fetchUniverseWallet(universeId as string),
    enabled,
    staleTime: 10_000,
  });

  // membership 코인은 만료일을 고려해서 0 처리
  const membership = useMemo(() => {
    if (!data?.wallet?.membership) return 0;
    const m = Math.max(0, data.wallet.membership.coins ?? 0);
    const exp = data.wallet.membership.expiresAt ? +new Date(data.wallet.membership.expiresAt) : 0;
    if (exp && dataUpdatedAt > exp) return 0;
    return m;
  }, [data, dataUpdatedAt]);

  const charged = useMemo(() => Math.max(0, data?.wallet?.charged?.coins ?? 0), [data]);

  useEffect(() => {
    if (!enabled || !universeId) return;

    // 결제 성공 페이지에서 넘어온 직후 localStorage 플래그 소비
    const consumed = consumeCoinUpdatedIfAny("universe", universeId);
    if (consumed) refetch();

    // coin-updated 브로드캐스트 수신 시 실시간 갱신
    const unsubscribe = onCoinUpdated((e) => {
      if (e.detail.scope === "universe" && e.detail.universeId === universeId) {
        refetch();
      }
    });

    return () => {
      unsubscribe?.();
    };
  }, [enabled, universeId, refetch]);

  if (!enabled) return null;

  const showSkeleton = isFetching && !data;

  if (variant === "compact") {
    // CTA 인접 소형 표기 — charged 기준 축약(secondary 정보, 계약 §3.8)
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap">
        <Coins className="h-3 w-3 text-muted-foreground" aria-hidden />
        <span className="tabular-nums">{showSkeleton ? "--" : charged.toLocaleString()}</span>
        <span className="text-xxs text-muted-foreground">Coins</span>
      </span>
    );
  }

  return (
    <div className="mt-3 flex flex-col gap-1 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
      {/* 왼쪽: 코인 숫자 */}
      <div className="flex flex-wrap items-center gap-2 text-xs md:text-sm">
        <Coins className="h-4 w-4 text-emerald-600" />
        <span className="font-medium text-gray-700">
          <Lang text={{ ko: "유니버스 코인", en: "Universe coins" }} />
        </span>

        {/* Charged 코인 */}
        <span className="ml-1 inline-flex items-baseline gap-1 rounded-default bg-emerald-50 px-2 py-0.5 text-emerald-800">
          <span className="text-xxs font-medium">
            <Lang text={{ ko: "Charged", en: "Charged" }} />
          </span>
          <span className="font-bold tabular-nums">{showSkeleton ? "--" : charged.toLocaleString()}</span>
          <span className="text-xxs text-emerald-700">Coin</span>
        </span>

        {/* Membership 코인 (넓은 화면에서만 노출) */}
        <span className="hidden sm:inline-flex items-baseline gap-1 rounded-default bg-amber-50 px-2 py-0.5 text-amber-800">
          <span className="text-xxs font-medium">Membership</span>
          <span className="font-semibold tabular-nums">{showSkeleton ? "--" : membership.toLocaleString()}</span>
          <span className="text-xxs text-amber-700">Coin</span>
        </span>
      </div>

      {/* 오른쪽: 설명 텍스트 */}
      <p className="mt-1 text-xxs leading-relaxed text-gray-500">
        <Lang
          text={{
            ko: "이미지 생성 시 이 유니버스 지갑에서 코인이 차감되며, 변경 사항이 즉시 반영됩니다.",
            en: "Image generation deducts coins from this universe wallet and reflects immediately.",
          }}
        />
      </p>
    </div>
  );
}
