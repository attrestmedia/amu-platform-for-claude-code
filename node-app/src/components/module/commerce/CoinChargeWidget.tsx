"use client";

import { useMemo, useState } from "react";
import { Button } from "@amu-labs/ui";
import { TossPaymentDialog } from "components/module/payments";
import { Lang } from "components/module/i18n";
import { COIN_PACKS, UNIVERSE_COIN_PACKS, WON_PER_COIN } from "consts/payment";
import { cn } from "utils/common";
import { quoteCoinCharge, quoteUniverseCoinCharge } from "utils/payment";
import type { UserScopeType } from "types/ai";

type Props = {
  uid: string;
  className?: string;
  defaultUseCustom?: boolean;
  defaultPackAmount?: number; // 기본 9,800
  defaultCustomAmount?: number; // 기본 10,000
  buttonLabel?: string; // 기본 "결제하기"
  title?: string; // 박스 타이틀 커스터마이즈
  scope?: UserScopeType;
  universeId?: string; // scope=universe일 때 필요
  adminUid?: string; // scope=universe일 때 결제자(관리자)
};

export default function CoinChargeWidget({
  uid,
  className,
  defaultPackAmount,
  buttonLabel = "결제하기",
  title = "코인 충전",
  scope = "user",
  universeId,
  adminUid,
}: Props) {
  const [open, setOpen] = useState(false);

  // 코인팩/커스텀 상태
  const packTable = scope === "universe" ? UNIVERSE_COIN_PACKS : COIN_PACKS;
  const [packAmount, setPackAmount] = useState<number>(defaultPackAmount || (scope === "universe" ? 100_000 : 9_800));

  // 미리보기 코인 계산
  const previewCoins = useMemo(() => {
    const amt = packAmount;
    if (!amt || amt <= 0) return 0;
    if (packTable[amt]) return packTable[amt]; // 코인팩 매칭 시 보너스
    return Math.floor(amt / WON_PER_COIN); // 일반 환산
  }, [packAmount, packTable]);

  return (
    <div className={className}>
      {title && (
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-lg font-bold text-gray-800">{title}</h2>
          <div className="flex-1 h-px bg-gray-200" />
        </div>
      )}

      {/* 코인팩 선택 */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium sr-only">충전 금액 선택</h3>
        <p className="text-xs text-muted-text">
          <Lang
            text={{
              ko: "공급가액에 부가세 10%가 별도 적용됩니다. 부가세가 포함된 실제 총 결제금액을 확인하세요.",
              en: "VAT of 10% is added to the supplied amount. Each card shows the actual VAT-inclusive total.",
            }}
          />
        </p>
        <div className="max-h-[calc(100dvh-25rem)] overflow-y-auto scrollbar-ghost -mx-6 px-6">
          <div className={cn("grid grid-cols-2 gap-2 sm:grid-cols-3")}>
            {Object.entries(packTable)
              .sort(([a], [b]) => Number(a) - Number(b))
              .map(([amt, coins]) => {
                const amount = Number(amt);
                const coinAmount = Number(coins);
                const isSelected = packAmount === amount;
                const bonusCoins = coinAmount - amount; // 보너스 코인 계산
                const hasBonus = bonusCoins > 0;
                const quote = scope === "universe" ? quoteUniverseCoinCharge(amount) : quoteCoinCharge(amount);

                return (
                  <Button
                    key={amt}
                    variant={isSelected ? "primary" : "outlinePrimary"}
                    rounded="xl"
                    noWrap={true}
                    onClick={() => setPackAmount(amount)}
                    className={cn("relative flex-col h-auto min-h-[8rem] transition-all duration-200 active:scale-95")}
                  >
                    <div className="text-base font-semibold">{quote.amount.toLocaleString()}원</div>
                    <div
                      className={cn("flex gap-1 text-xxs font-light", isSelected ? "text-white/70" : "text-muted-text")}
                    >
                      <span className="font-semibold">{amount.toLocaleString()}원</span>
                      <span>+</span>
                      <span>
                        VAT <span className="font-semibold">{quote.vat.toLocaleString()}원</span>
                      </span>
                    </div>

                    {/* 보너스 뱃지 */}
                    {hasBonus && isSelected && (
                      <span className="absolute -top-3.5 -right-3.5 z-9 bg-gradient-to-r from-orange-400 to-pink-500 text-white text-xs font-bold shadow-lg w-[3rem] h-[3rem] rounded-full flex-center">
                        +{bonusCoins.toLocaleString()}
                      </span>
                    )}

                    <div className={cn("text-lg font-bold mt-2", isSelected ? "text-yellow-300" : "text-orange-600")}>
                      {coinAmount.toLocaleString()}코인
                    </div>
                  </Button>
                );
              })}
          </div>
        </div>
      </div>

      {/* 미리보기 */}
      <div className="mt-4 p-4 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10">
            <span className="text-2xl">💎</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-gray-600">적립 예정</span>
            <span className="text-2xl font-bold text-primary">
              {previewCoins.toLocaleString()}
              <span className="text-base ml-1">코인</span>
            </span>
          </div>
        </div>

        {/* 보너스 정보 표시 */}
        {packTable[packAmount] && packTable[packAmount] > packAmount && (
          <div className="mt-3 pt-3 border-t border-primary/20 flex items-center gap-2 text-sm">
            <span className="text-orange-600">⭐</span>
            <span className="text-gray-700">
              <b className="text-orange-600">+{(packTable[packAmount] - packAmount).toLocaleString()}코인</b> 추가 제공
            </span>
          </div>
        )}
      </div>

      {/* 결제 버튼 */}
      <Button size="xl" rounded="full" className="w-full mt-4" onClick={() => setOpen(true)}>
        {buttonLabel}
      </Button>

      {/* Toss 결제 다이얼로그 */}
      <TossPaymentDialog
        open={open}
        onOpenChange={setOpen}
        mode="coin_pack"
        packAmount={packAmount}
        uid={scope === "user" ? uid : undefined}
        scope={scope}
        universeId={scope === "universe" ? universeId : undefined}
        adminUid={scope === "universe" ? adminUid || uid : undefined}
      />
    </div>
  );
}
