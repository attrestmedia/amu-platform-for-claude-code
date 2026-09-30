"use client";

import { UniverseCoinSummary } from "components/module/admin/universe";
import { CoinBalance } from "components/module/commerce";
import { Lang } from "components/module/i18n";
import type { UserScopeType } from "types/ai";
import { Coins, LogIn } from "lucide-react";
import { useAuthStore } from "store/auth";
import { Button } from "@amu-labs/ui";
import { cn } from "utils/common";

type CoinSummaryProps = {
  mode: UserScopeType;
  universeId?: string;
  message?: string;
  className?: string;
  onLogin?: () => void;
};

// 이미지 스튜디오 상단에 표시할 코인 요약 바
// - user 모드: 로그인 유저의 사용 가능 bonus+charged coin / universe 모드: 해당 유니버스의 membership/charged coin
export function CoinSummary({ mode, universeId, message, className, onLogin }: CoinSummaryProps) {
  const isLoggedIn = useAuthStore((s) => s.isLogged());

  if (mode === "user") {
    return (
      <div
        className={cn(
          "flex flex-col gap-1.5 rounded-xl border bg-surface px-4 py-2.5",
          "sm:flex-row sm:items-center sm:justify-between",
          className,
        )}
      >
        <div className="flex items-center gap-2 w-full text-xs md:text-sm">
          <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-accent">
            <Coins className="h-3.5 w-3.5 text-accent-text" />
          </div>
          <span className="font-semibold text-card-foreground tracking-tight">
            My Coins
            {message && <p className="text-xxs font-normal leading-relaxed text-muted-foreground/70">{message}</p>}
          </span>
          {isLoggedIn ? (
            <CoinBalance className="ml-auto p-0 font-mono font-bold text-primary-text" showLabel={false} />
          ) : (
            <Button
              variant="blank"
              size="xs"
              rounded="sm"
              className="ml-auto inline-flex items-center gap-1.5 py-1 text-accent-text dark:text-accent"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onLogin?.();
              }}
            >
              <LogIn className="h-3.5 w-3.5" />
              <Lang text={{ ko: "로그인이 필요해요.", en: "Please Sign in." }} />
            </Button>
          )}
        </div>
      </div>
    );
  }

  return <UniverseCoinSummary universeId={universeId} />;
}
